import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth";
import { b64uDecode, b64uEncode, blindSign, constantTimeEqual, eligDigest, sha256, unseal } from "../crypto";
import { all, one, query } from "../db";
import { ApiError, clientIp, guard, jsonBody, ok, rateLimit } from "../http";
import { str, uuid } from "../validate";

type CampaignRow = {
  id: string; name: string; description: string | null; status: string;
  starts_at: Date; ends_at: Date; text_enabled: boolean;
  course_code: string; course_title: string; faculty_name: string;
  issued_on: Date | null;
};

const CAMPAIGN_SELECT = `
  SELECT c.id::text, c.name, c.description, c.status, c.starts_at, c.ends_at, c.text_enabled,
         co.code AS course_code, co.title AS course_title, f.name AS faculty_name,
         ec.issued_on
    FROM campaigns c
    JOIN eligibility_credentials ec ON ec.campaign_id = c.id
    JOIN course_offerings o ON o.id = c.offering_id
    JOIN courses co ON co.id = o.course_id
    JOIN faculty f ON f.user_id = o.faculty_id`;

function rowOut(r: CampaignRow) {
  return {
    id: r.id,
    name: r.name,
    course_code: r.course_code,
    course_title: r.course_title,
    faculty: r.faculty_name,
    ends_at: new Date(r.ends_at).toISOString(),
    status: r.status,
    state: r.issued_on ? "started" : "not_started",
  };
}

export async function handleStudent(req: NextRequest, parts: string[]): Promise<NextResponse | null> {
  const user = await requireRole(req, "student");
  const route = parts.slice(1).join("/");

  if (route === "campaigns" && req.method === "GET") {
    const rows = await all<CampaignRow>(
      `${CAMPAIGN_SELECT} WHERE ec.student_id = $1 AND c.status IN ('open','closed') ORDER BY c.ends_at`,
      [user.id]
    );
    return ok(rows.map(rowOut));
  }

  if (route === "submissions" && req.method === "GET") {
    const rows = await all<CampaignRow>(
      `${CAMPAIGN_SELECT} WHERE ec.student_id = $1 AND ec.issued_on IS NOT NULL ORDER BY c.ends_at DESC`,
      [user.id]
    );
    return ok(rows.map(rowOut));
  }

  const detail = route.match(/^campaigns\/([^/]+)$/);
  if (detail && req.method === "GET") {
    const campaignId = uuid(detail[1], "campaign id");
    const row = await one<CampaignRow>(
      `${CAMPAIGN_SELECT} WHERE ec.student_id = $1 AND c.id = $2`,
      [user.id, campaignId]
    );
    if (!row || row.status !== "open" || new Date(row.ends_at).getTime() <= Date.now()) {
      throw new ApiError(404, "Campaign not found");
    }
    const key = await one<{ key_id: string; public_key_der: Buffer }>(
      "SELECT key_id, public_key_der FROM signing_keys WHERE campaign_id = $1 AND private_key_enc IS NOT NULL",
      [campaignId]
    );
    if (!key) throw new ApiError(404, "Campaign not found");
    const questions = await all<{
      id: string; type: string; prompt: string; required: boolean;
      min_value: number | null; max_value: number | null; options: { id: string; label: string }[];
    }>(
      "SELECT id::text, type, prompt, required, min_value, max_value FROM campaign_questions WHERE campaign_id = $1 ORDER BY position",
      [campaignId]
    );
    for (const q of questions) {
      q.options = await all<{ id: string; label: string }>(
        "SELECT id::text, label FROM question_options WHERE question_id = $1 ORDER BY position",
        [q.id]
      );
    }
    return ok({
      id: row.id, name: row.name, description: row.description,
      ends_at: new Date(row.ends_at).toISOString(), text_enabled: row.text_enabled,
      state: row.issued_on ? "started" : "not_started",
      key_id: key.key_id, public_key: b64uEncode(key.public_key_der),
      questions,
    });
  }

  const claim = route.match(/^campaigns\/([^/]+)\/credential$/);
  if (claim) {
    guard(req, "POST");
    const campaignId = uuid(claim[1], "campaign id");
    const body = await jsonBody(req);
    const blindedB64 = str(body.blinded_msg, "blinded_msg", 100, 1200);
    rateLimit(`claim:${user.id}`, 10, 60_000);
    rateLimit(`claim-ip:${clientIp(req)}`, 60, 60_000);

    const cred = await one<{ llt_digest: Buffer; expires_at: Date; issued_on: Date | null; blinded_hash: Buffer | null }>(
      "SELECT llt_digest, expires_at, issued_on, blinded_hash FROM eligibility_credentials WHERE campaign_id = $1 AND student_id = $2",
      [campaignId, user.id]
    );
    const camp = await one<{ status: string; starts_at: Date; ends_at: Date }>(
      "SELECT status, starts_at, ends_at FROM campaigns WHERE id = $1",
      [campaignId]
    );
    if (!cred || !camp) throw new ApiError(404, "Campaign not found");
    const now = Date.now();
    if (camp.status !== "open" || new Date(camp.starts_at).getTime() > now || now >= new Date(camp.ends_at).getTime()
      || new Date(cred.expires_at).getTime() <= now) {
      throw new ApiError(410, "Campaign is not open");
    }
    if (!constantTimeEqual(cred.llt_digest, eligDigest(campaignId, user.id))) {
      throw new ApiError(403, "Eligibility check failed");
    }
    const key = await one<{ key_id: string; private_key_enc: Buffer | null }>(
      "SELECT key_id, private_key_enc FROM signing_keys WHERE campaign_id = $1",
      [campaignId]
    );
    if (!key?.private_key_enc) throw new ApiError(410, "Campaign is not open");

    let blinded: Buffer;
    try {
      blinded = b64uDecode(blindedB64, "blinded message");
    } catch {
      throw new ApiError(400, "Invalid blinded message");
    }
    let signature: Buffer;
    try {
      signature = blindSign(unseal(key.private_key_enc), blinded);
    } catch {
      throw new ApiError(400, "Invalid blinded message");
    }
    const response = { blind_sig: b64uEncode(signature), key_id: key.key_id };
    const hash = sha256(blinded);

    if (!cred.issued_on) {
      const res = await query(
        `UPDATE eligibility_credentials
            SET issued_on = current_date, blinded_hash = $3
          WHERE campaign_id = $1 AND student_id = $2 AND issued_on IS NULL AND expires_at > now()`,
        [campaignId, user.id, hash]
      );
      if (res.rowCount === 1) return ok(response);
    }
    const latest = await one<{ blinded_hash: Buffer | null }>(
      "SELECT blinded_hash FROM eligibility_credentials WHERE campaign_id = $1 AND student_id = $2",
      [campaignId, user.id]
    );
    if (latest?.blinded_hash && constantTimeEqual(latest.blinded_hash, hash)) return ok(response);
    throw new ApiError(409, "A credential was already issued for this campaign");
  }

  return null;
}
