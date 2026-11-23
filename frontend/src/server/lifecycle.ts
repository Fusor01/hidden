import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { eligDigest, generateSigningKey, seal } from "./crypto";
import { all, one, query, transaction } from "./db";
import { ApiError } from "./http";

type CampaignRow = {
  id: string;
  offering_id: string;
  name: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
  k_threshold: number;
  text_enabled: boolean;
  moderation_enabled: boolean;
};

type QuestionRow = {
  id: string;
  position: number;
  type: string;
  prompt: string;
  required: boolean;
  min_value: number | null;
  max_value: number | null;
  options: { id: string; position: number; label: string }[];
};

async function questionsFor(client: PoolClient, campaignId: string): Promise<QuestionRow[]> {
  const qs = await client.query<QuestionRow>(
    "SELECT id::text, position, type, prompt, required, min_value, max_value FROM campaign_questions WHERE campaign_id = $1 ORDER BY position",
    [campaignId]
  );
  for (const q of qs.rows) {
    const os = await client.query<{ id: string; position: number; label: string }>(
      "SELECT id::text, position, label FROM question_options WHERE question_id = $1 ORDER BY position",
      [q.id]
    );
    q.options = os.rows;
  }
  return qs.rows;
}

/** Freeze the roster, create the signing key, and publish the anonymous campaign view. */
export async function openCampaign(campaignId: string, actorId: string): Promise<void> {
  await transaction(async (client) => {
    const c = (await client.query<CampaignRow>(
      "SELECT id::text, offering_id::text, name, status, starts_at, ends_at, k_threshold, text_enabled, moderation_enabled FROM campaigns WHERE id = $1",
      [campaignId]
    )).rows[0];
    if (!c) throw new ApiError(404, "Campaign not found");
    if (c.status !== "draft") throw new ApiError(409, "Only draft campaigns can be opened");

    const roster = (await client.query<{ student_id: string }>(
      "SELECT student_id::text FROM campaign_eligibility WHERE campaign_id = $1 ORDER BY student_id::text",
      [campaignId]
    )).rows.map((r) => r.student_id);
    const questions = await questionsFor(client, campaignId);

    if (!roster.length) throw new ApiError(400, "The eligibility roster is empty");
    if (!questions.length) throw new ApiError(400, "The campaign has no questions");
    if (roster.length < c.k_threshold) {
      throw new ApiError(400, "The roster is smaller than the anonymity threshold, so results could never be shown. Enlarge the roster or lower k (minimum 3).");
    }
    if (new Date(c.ends_at).getTime() <= Date.now()) throw new ApiError(400, "The campaign end date is in the past");

    for (const sid of roster) {
      await client.query(
        "INSERT INTO eligibility_credentials (campaign_id, student_id, llt_digest, expires_at) VALUES ($1, $2, $3, $4)",
        [campaignId, sid, eligDigest(campaignId, sid), c.ends_at]
      );
    }

    const key = generateSigningKey(Number(process.env.KEY_BITS ?? 3072));
    await client.query(
      "INSERT INTO signing_keys (campaign_id, key_id, public_key_der, private_key_enc) VALUES ($1, $2, $3, $4)",
      [campaignId, key.keyId, key.publicKeyDer, seal(key.privateKeyDer)]
    );

    const rosterHash = [...roster].sort().join(",");
    const digest = createHash("sha256").update(rosterHash).digest("hex");
    await client.query(
      "UPDATE campaigns SET status = 'open', roster_hash = $2, roster_frozen_at = now() WHERE id = $1",
      [campaignId, digest]
    );

    const off = (await client.query<{ course_id: string; faculty_id: string; semester_id: string }>(
      "SELECT course_id::text, faculty_id::text, semester_id::text FROM course_offerings WHERE id = $1",
      [c.offering_id]
    )).rows[0];
    if (!off) throw new ApiError(404, "Offering not found");

    await client.query(
      `INSERT INTO campaign_public
        (campaign_id, course_id, faculty_id, semester_id, status, opens_at_iso, closes_at_iso,
         k_threshold, text_enabled, moderation_enabled, key_id, public_key_der)
       VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10,$11)`,
      [
        campaignId, off.course_id, off.faculty_id, off.semester_id,
        new Date(c.starts_at).toISOString(), new Date(c.ends_at).toISOString(),
        c.k_threshold, c.text_enabled, c.moderation_enabled, key.keyId, key.publicKeyDer,
      ]
    );
    for (const q of questions) {
      await client.query(
        `INSERT INTO questions_public (id, campaign_id, position, type, prompt, required, min_value, max_value)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [q.id, campaignId, q.position, q.type, q.prompt, q.required, q.min_value, q.max_value]
      );
      for (const o of q.options) {
        await client.query(
          "INSERT INTO options_public (id, question_id, position, label) VALUES ($1,$2,$3,$4)",
          [o.id, q.id, o.position, o.label]
        );
      }
    }

    await client.query(
      "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, meta) VALUES ($1,'campaign.open','campaign',$2,$3)",
      [actorId, campaignId, JSON.stringify({ eligible: roster.length, roster_hash: digest })]
    );
  });
}

/** Stop ballots first, destroy the signing key, then release results. */
export async function closeCampaign(campaignId: string, actorId: string | null): Promise<void> {
  await transaction(async (client) => {
    const c = (await client.query<{ status: string }>(
      "SELECT status FROM campaigns WHERE id = $1",
      [campaignId]
    )).rows[0];
    if (!c) throw new ApiError(404, "Campaign not found");
    if (c.status !== "open") throw new ApiError(409, "Only open campaigns can be closed");

    await client.query("UPDATE campaign_public SET status = 'closed' WHERE campaign_id = $1", [campaignId]);
    await client.query(
      "UPDATE signing_keys SET private_key_enc = NULL, destroyed_at = now() WHERE campaign_id = $1",
      [campaignId]
    );
    await client.query("UPDATE campaigns SET status = 'closed' WHERE id = $1", [campaignId]);
    await client.query(
      "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES ($1,'campaign.close','campaign',$2)",
      [actorId, campaignId]
    );
  });
}

export async function campaignOutput(campaignId: string): Promise<Record<string, unknown>> {
  const c = await one<Record<string, unknown>>(
    "SELECT id::text, name, description, status, offering_id::text, starts_at, ends_at, k_threshold, text_enabled, moderation_enabled, roster_hash FROM campaigns WHERE id = $1",
    [campaignId]
  );
  if (!c) throw new ApiError(404, "Campaign not found");
  const qs = await all<{ id: string; type: string; prompt: string; required: boolean }>(
    "SELECT id::text, type, prompt, required FROM campaign_questions WHERE campaign_id = $1 ORDER BY position",
    [campaignId]
  );
  for (const q of qs) {
    const options = await all<{ label: string }>(
      "SELECT label FROM question_options WHERE question_id = $1 ORDER BY position",
      [q.id]
    );
    (q as Record<string, unknown>).options = options.map((o) => o.label);
  }
  return {
    ...c,
    starts_at: new Date(c.starts_at as string).toISOString(),
    ends_at: new Date(c.ends_at as string).toISOString(),
    questions: qs,
  };
}
