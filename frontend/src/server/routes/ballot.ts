import { NextRequest, NextResponse } from "next/server";
import { b64uDecode, sha256, tokenMessage, verifySignature } from "../crypto";
import { all, one, transaction } from "../db";
import { ApiError, clientIp, guard, jsonBody, ok, rateLimit } from "../http";
import { answers, str, uuid, type AnswerInput } from "../validate";

type PublicCampaign = {
  campaign_id: string; status: string; opens_at_iso: string; closes_at_iso: string;
  key_id: string; public_key_der: Buffer; text_enabled: boolean; moderation_enabled: boolean;
};

type PublicQuestion = {
  id: string; type: string; required: boolean; min_value: number | null; max_value: number | null;
  options: { id: string }[];
};

function validateAnswers(campaign: PublicCampaign, questions: PublicQuestion[], submitted: AnswerInput[]) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const rows: { question_id: string; int_value: number | null; option_id: string | null; text_value: string | null }[] = [];
  let hasText = false;

  for (const a of submitted) {
    const q = byId.get(a.question_id);
    if (!q) throw new ApiError(400, "Unknown question");
    if (seen.has(a.question_id)) throw new ApiError(400, "Duplicate answer for a question");
    seen.add(a.question_id);

    if (q.type === "star" || q.type === "numeric") {
      if (a.value === null || (a.option_ids && a.option_ids.length) || a.text) {
        throw new ApiError(400, "Expected a numeric value");
      }
      const lo = q.type === "star" ? 1 : q.min_value;
      const hi = q.type === "star" ? 5 : q.max_value;
      if (lo === null || hi === null || a.value === null || a.value < lo || a.value > hi) {
        throw new ApiError(400, "Value out of range");
      }
      rows.push({ question_id: q.id, int_value: a.value, option_id: null, text_value: null });
    } else if (q.type === "single" || q.type === "multi") {
      const ids = a.option_ids ?? [];
      const valid = new Set(q.options.map((o) => o.id));
      if (a.value !== null || a.text || !ids.length) throw new ApiError(400, "Expected option selection");
      if (new Set(ids).size !== ids.length || !ids.every((id) => valid.has(id))) {
        throw new ApiError(400, "Invalid option selection");
      }
      if (q.type === "single" && ids.length !== 1) throw new ApiError(400, "Exactly one option expected");
      for (const id of ids) rows.push({ question_id: q.id, int_value: null, option_id: id, text_value: null });
    } else if (q.type === "text") {
      if (!campaign.text_enabled) throw new ApiError(400, "Text answers are disabled for this campaign");
      const text = (a.text ?? "").trim();
      if (a.value !== null || (a.option_ids && a.option_ids.length) || !text) throw new ApiError(400, "Expected text");
      rows.push({ question_id: q.id, int_value: null, option_id: null, text_value: text.slice(0, 2000) });
      hasText = true;
    }
  }

  if (questions.some((q) => q.required && !seen.has(q.id))) {
    throw new ApiError(400, "Required questions are unanswered");
  }
  if (!rows.length) throw new ApiError(400, "Empty submission");
  return { rows, hasText };
}

export async function handleBallot(req: NextRequest, parts: string[]): Promise<NextResponse | null> {
  const submitMatch = parts.join("/").match(/^campaigns\/([^/]+)\/submit$/);
  if (submitMatch) {
    guard(req, "POST");
    const campaignId = uuid(submitMatch[1], "campaign id");
    const body = await jsonBody(req);
    const keyId = str(body.key_id, "key_id", 1, 32);
    const tokenB64 = str(body.token, "token", 40, 50);
    const signatureB64 = str(body.signature, "signature", 100, 1200);
    const submitted = answers(body.answers);
    rateLimit(`submit:${clientIp(req)}`, 30, 60_000);

    const camp = await one<PublicCampaign>(
      "SELECT campaign_id::text, status, opens_at_iso, closes_at_iso, key_id, public_key_der, text_enabled, moderation_enabled FROM campaign_public WHERE campaign_id = $1",
      [campaignId]
    );
    if (!camp) throw new ApiError(404, "Campaign not found");
    const now = Date.now();
    if (camp.status !== "open" || new Date(camp.opens_at_iso).getTime() > now || now >= new Date(camp.closes_at_iso).getTime()) {
      throw new ApiError(410, "Campaign is not accepting submissions");
    }
    if (keyId !== camp.key_id) throw new ApiError(401, "Invalid credential");

    const token = b64uDecode(tokenB64, "token");
    const signature = b64uDecode(signatureB64, "signature");
    if (token.length !== 32) throw new ApiError(401, "Invalid credential");
    if (!verifySignature(camp.public_key_der, tokenMessage(campaignId, token), signature)) {
      throw new ApiError(401, "Invalid credential");
    }

    const questions = await all<PublicQuestion>(
      "SELECT id::text, type, required, min_value, max_value FROM questions_public WHERE campaign_id = $1 ORDER BY position",
      [campaignId]
    );
    for (const q of questions) {
      q.options = await all<{ id: string }>("SELECT id::text FROM options_public WHERE question_id = $1", [q.id]);
    }
    const checked = validateAnswers(camp, questions, submitted);

    try {
      await transaction(async (client) => {
        await client.query(
          "INSERT INTO spent_tokens (campaign_id, token_hash) VALUES ($1, $2)",
          [campaignId, sha256(token)]
        );
        const r = await client.query<{ id: string }>(
          "INSERT INTO responses (campaign_id, moderation) VALUES ($1, $2) RETURNING id::text",
          [campaignId, camp.moderation_enabled && checked.hasText ? "pending" : "ok"]
        );
        const responseId = r.rows[0].id;
        for (const a of checked.rows) {
          await client.query(
            "INSERT INTO response_answers (response_id, question_id, int_value, option_id, text_value) VALUES ($1,$2,$3,$4,$5)",
            [responseId, a.question_id, a.int_value, a.option_id, a.text_value]
          );
        }
      });
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new ApiError(409, "This credential has already been used");
      }
      throw err;
    }
    return ok({}, 201);
  }

  const spentMatch = parts.join("/").match(/^campaigns\/([^/]+)\/spent$/);
  if (spentMatch && req.method === "GET") {
    const campaignId = uuid(spentMatch[1], "campaign id");
    const camp = await one<{ status: string }>(
      "SELECT status FROM campaign_public WHERE campaign_id = $1",
      [campaignId]
    );
    if (!camp || camp.status !== "closed") throw new ApiError(404, "Not available");
    const rows = await all<{ hash: Buffer }>(
      "SELECT token_hash AS hash FROM spent_tokens WHERE campaign_id = $1",
      [campaignId]
    );
    return ok({ token_hashes: rows.map((r) => Buffer.from(r.hash).toString("hex")).sort() });
  }

  return null;
}
