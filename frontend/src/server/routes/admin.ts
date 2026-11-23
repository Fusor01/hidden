import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { hashPassword, requireRole } from "../auth";
import { all, one, query, scalar, transaction } from "../db";
import { ApiError, guard, jsonBody, ok } from "../http";
import { campaignOutput, closeCampaign, openCampaign } from "../lifecycle";
import { campaignResults } from "../results";
import {
  bool, dateOnly, int, iso, oneOf, optStr, questions, str, uuid, uuidList, type QuestionInput,
} from "../validate";

const DUPLICATE = "23505";
const conflict = (err: unknown): never => {
  if ((err as { code?: string }).code === DUPLICATE) throw new ApiError(409, "Conflicts with an existing record");
  throw err;
};

function campaignBody(body: Record<string, unknown>) {
  const offeringId = uuid(body.offering_id, "offering_id");
  const name = str(body.name, "name", 3, 160);
  const description = optStr(body.description, "description", 2000);
  const startsAt = iso(body.starts_at, "starts_at");
  const endsAt = iso(body.ends_at, "ends_at");
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new ApiError(400, "ends_at must be after starts_at");
  }
  const k = int(body.k_threshold ?? 5, "k_threshold", 3, 50);
  const textEnabled = bool(body.text_enabled, "text_enabled", true);
  const moderationEnabled = bool(body.moderation_enabled, "moderation_enabled", true);
  const qs = questions(body.questions);
  if (!textEnabled && qs.some((q) => q.type === "text")) {
    throw new ApiError(400, "Text questions require text_enabled");
  }
  return { offeringId, name, description, startsAt, endsAt, k, textEnabled, moderationEnabled, qs };
}

async function insertQuestions(client: Pick<PoolClient, "query">, campaignId: string, qs: QuestionInput[]) {
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const r = await client.query<{ id: string }>(
      `INSERT INTO campaign_questions (campaign_id, position, type, prompt, required, min_value, max_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`,
      [campaignId, i, q.type, q.prompt, q.required, q.min_value, q.max_value]
    );
    const qid = (r as { rows: { id: string }[] }).rows[0].id;
    for (let j = 0; j < q.options.length; j++) {
      await client.query(
        "INSERT INTO question_options (question_id, position, label) VALUES ($1,$2,$3)",
        [qid, j, q.options[j]]
      );
    }
  }
}

export async function handleAdmin(req: NextRequest, parts: string[]): Promise<NextResponse | null> {
  const actor = await requireRole(req, "admin");
  const route = parts.slice(1).join("/");

  if (route === "dashboard" && req.method === "GET") {
    const [students, faculty, courses, active, completed, draft] = await Promise.all([
      scalar<number>("SELECT count(*)::int AS n FROM students"),
      scalar<number>("SELECT count(*)::int AS n FROM faculty"),
      scalar<number>("SELECT count(*)::int AS n FROM courses"),
      scalar<number>("SELECT count(*)::int AS n FROM campaigns WHERE status = 'open'"),
      scalar<number>("SELECT count(*)::int AS n FROM campaigns WHERE status = 'closed'"),
      scalar<number>("SELECT count(*)::int AS n FROM campaigns WHERE status = 'draft'"),
    ]);
    return ok({ students, faculty, courses, active_campaigns: active, completed_campaigns: completed, draft_campaigns: draft });
  }

  // ---- people & academics ----
  if (route === "students") {
    if (req.method === "GET") {
      const rows = await all<{ id: string; name: string; roll_no: string; department: string | null; email: string }>(
        `SELECT s.user_id::text AS id, s.name, s.roll_no, s.department, u.email
           FROM students s JOIN users u ON u.id = s.user_id ORDER BY s.roll_no`
      );
      return ok(rows);
    }
    guard(req, "POST");
    const b = await jsonBody(req);
    const email = str(b.email, "email", 1, 254).trim().toLowerCase();
    const name = str(b.name, "name", 1, 120);
    const rollNo = str(b.roll_no, "roll_no", 1, 40);
    const department = optStr(b.department, "department", 80);
    const batchYear = b.batch_year === undefined || b.batch_year === null || b.batch_year === "" ? null : int(b.batch_year, "batch_year");
    const password = b.password ? str(b.password, "password", 10, 200) : null;
    const temp = password ?? randomBytes(9).toString("base64url");
    try {
      const id = await transaction(async (client) => {
        const u = await client.query<{ id: string }>(
          "INSERT INTO users (email, password_hash, role) VALUES ($1,$2,'student') RETURNING id::text",
          [email, await hashPassword(temp)]
        );
        const userId = u.rows[0].id;
        await client.query(
          "INSERT INTO students (user_id, roll_no, name, department, batch_year) VALUES ($1,$2,$3,$4,$5)",
          [userId, rollNo, name, department, batchYear]
        );
        await client.query(
          "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES ($1,'student.create','student',$2)",
          [actor.id, userId]
        );
        return userId;
      });
      return ok({ id, temporary_password: password ? null : temp }, 201);
    } catch (err) {
      if ((err as { code?: string }).code === DUPLICATE) throw new ApiError(409, "Email or roll number already exists");
      throw err;
    }
  }

  if (route === "faculty") {
    if (req.method === "GET") {
      return ok(await all(
        "SELECT user_id::text AS id, name, employee_no, department FROM faculty ORDER BY name"
      ));
    }
    guard(req, "POST");
    const b = await jsonBody(req);
    const email = str(b.email, "email", 1, 254).trim().toLowerCase();
    const name = str(b.name, "name", 1, 120);
    const employeeNo = str(b.employee_no, "employee_no", 1, 40);
    const department = optStr(b.department, "department", 80);
    const password = b.password ? str(b.password, "password", 10, 200) : null;
    const temp = password ?? randomBytes(9).toString("base64url");
    try {
      const id = await transaction(async (client) => {
        const u = await client.query<{ id: string }>(
          "INSERT INTO users (email, password_hash, role) VALUES ($1,$2,'faculty') RETURNING id::text",
          [email, await hashPassword(temp)]
        );
        const userId = u.rows[0].id;
        await client.query(
          "INSERT INTO faculty (user_id, employee_no, name, department) VALUES ($1,$2,$3,$4)",
          [userId, employeeNo, name, department]
        );
        await client.query(
          "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES ($1,'faculty.create','faculty',$2)",
          [actor.id, userId]
        );
        return userId;
      });
      return ok({ id, temporary_password: password ? null : temp }, 201);
    } catch (err) {
      if ((err as { code?: string }).code === DUPLICATE) throw new ApiError(409, "Email or employee number already exists");
      throw err;
    }
  }

  if (route === "semesters") {
    if (req.method === "GET") {
      return ok(await all(
        "SELECT id::text, name, start_date::text, end_date::text FROM semesters ORDER BY start_date DESC"
      ));
    }
    guard(req, "POST");
    const b = await jsonBody(req);
    const name = str(b.name, "name", 1, 60);
    const startDate = dateOnly(b.start_date, "start_date");
    const endDate = dateOnly(b.end_date, "end_date");
    if (endDate <= startDate) throw new ApiError(400, "end_date must be after start_date");
    try {
      const r = await query<{ id: string }>(
        "INSERT INTO semesters (name, start_date, end_date) VALUES ($1,$2,$3) RETURNING id::text",
        [name, startDate, endDate]
      );
      await query("INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES ($1,'semester.create','semester',$2)", [actor.id, r.rows[0].id]);
      return ok({ id: r.rows[0].id }, 201);
    } catch (err) { conflict(err); }
  }

  if (route === "courses") {
    if (req.method === "GET") {
      return ok(await all("SELECT id::text, code, title, department FROM courses ORDER BY code"));
    }
    guard(req, "POST");
    const b = await jsonBody(req);
    const code = str(b.code, "code", 1, 30);
    const title = str(b.title, "title", 1, 160);
    const department = optStr(b.department, "department", 80);
    try {
      const r = await query<{ id: string }>(
        "INSERT INTO courses (code, title, department) VALUES ($1,$2,$3) RETURNING id::text",
        [code, title, department]
      );
      await query("INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES ($1,'course.create','course',$2)", [actor.id, r.rows[0].id]);
      return ok({ id: r.rows[0].id }, 201);
    } catch (err) { conflict(err); }
  }

  if (route === "offerings") {
    if (req.method === "GET") {
      const rows = await all<{ id: string; course: string; semester: string; faculty: string; section: string }>(
        `SELECT o.id::text, co.code || ' ' || co.title AS course, s.name AS semester, f.name AS faculty, o.section
           FROM course_offerings o
           JOIN courses co ON co.id = o.course_id
           JOIN semesters s ON s.id = o.semester_id
           JOIN faculty f ON f.user_id = o.faculty_id
          ORDER BY s.start_date DESC, co.code`
      );
      return ok(rows);
    }
    guard(req, "POST");
    const b = await jsonBody(req);
    const courseId = uuid(b.course_id, "course_id");
    const semesterId = uuid(b.semester_id, "semester_id");
    const facultyId = uuid(b.faculty_id, "faculty_id");
    const section = b.section === undefined || b.section === null || b.section === "" ? "A" : str(b.section, "section", 1, 10);
    try {
      const r = await query<{ id: string }>(
        "INSERT INTO course_offerings (course_id, semester_id, faculty_id, section) VALUES ($1,$2,$3,$4) RETURNING id::text",
        [courseId, semesterId, facultyId, section]
      );
      await query("INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES ($1,'offering.create','offering',$2)", [actor.id, r.rows[0].id]);
      return ok({ id: r.rows[0].id }, 201);
    } catch (err) { conflict(err); }
  }

  if (route === "enrollments") {
    guard(req, "POST");
    const b = await jsonBody(req);
    const offeringId = uuid(b.offering_id, "offering_id");
    const studentIds = uuidList(b.student_ids, "student_ids");
    if (!studentIds.length) throw new ApiError(400, "student_ids must not be empty");
    if (!(await one("SELECT 1 FROM course_offerings WHERE id = $1", [offeringId]))) {
      throw new ApiError(404, "Offering not found");
    }
    const result = await transaction(async (client) => {
      const before = await client.query("SELECT count(*)::int AS n FROM enrollments WHERE offering_id = $1", [offeringId]);
      await client.query(
        `INSERT INTO enrollments (student_id, offering_id)
         SELECT s.user_id, $2 FROM students s WHERE s.user_id = ANY($1::uuid[])
         ON CONFLICT DO NOTHING`,
        [studentIds, offeringId]
      );
      const after = await client.query("SELECT count(*)::int AS n FROM enrollments WHERE offering_id = $1", [offeringId]);
      const added = after.rows[0].n - before.rows[0].n;
      await client.query(
        "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, meta) VALUES ($1,'enrollment.add','offering',$2,$3)",
        [actor.id, offeringId, JSON.stringify({ added })]
      );
      return { added, ignored: studentIds.length - added };
    });
    return ok(result, 201);
  }

  // ---- campaigns ----
  if (route === "campaigns" && req.method === "GET") {
    const rows = await all("SELECT id::text FROM campaigns ORDER BY starts_at DESC");
    const out = [];
    for (const r of rows) out.push(await campaignOutput(r.id));
    return ok(out);
  }

  if (route === "campaigns" && req.method === "POST") {
    const b = await jsonBody(req);
    const v = campaignBody(b);
    if (!(await one("SELECT 1 FROM course_offerings WHERE id = $1", [v.offeringId]))) {
      throw new ApiError(404, "Offering not found");
    }
    try {
      const id = await transaction(async (client) => {
        const r = await client.query<{ id: string }>(
          `INSERT INTO campaigns (offering_id, name, description, status, starts_at, ends_at, k_threshold,
                                   text_enabled, moderation_enabled, created_by)
           VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9) RETURNING id::text`,
          [v.offeringId, v.name, v.description, v.startsAt, v.endsAt, v.k, v.textEnabled, v.moderationEnabled, actor.id]
        );
        const campaignId = r.rows[0].id;
        await insertQuestions(client, campaignId, v.qs);
        await client.query(
          "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES ($1,'campaign.create','campaign',$2)",
          [actor.id, campaignId]
        );
        return campaignId;
      });
      return ok(await campaignOutput(id), 201);
    } catch (err) { conflict(err); }
  }

  const cId = route.match(/^campaigns\/([^/]+)(?:\/(.*))?$/);
  if (!cId) {
    if (route === "reports" && req.method === "GET") {
      const rows = await all<{ id: string; name: string; code: string; semester: string; faculty: string }>(
        `SELECT c.id::text, c.name, co.code, s.name AS semester, f.name AS faculty
           FROM campaigns c
           JOIN course_offerings o ON o.id = c.offering_id
           JOIN courses co ON co.id = o.course_id
           JOIN semesters s ON s.id = o.semester_id
           JOIN faculty f ON f.user_id = o.faculty_id
          WHERE c.status = 'closed' ORDER BY s.start_date DESC`
      );
      const out = [];
      for (const r of rows) {
        const results = await campaignResults(r.id);
        out.push({
          campaign_id: r.id, campaign: r.name, course: r.code, semester: r.semester, faculty: r.faculty,
          released: results.released,
          n: "n" in results ? results.n : null,
          overall_mean: "overall_mean" in results ? results.overall_mean : null,
        });
      }
      return ok(out);
    }
    const reportMatch = route.match(/^reports\/([^/]+)$/);
    if (reportMatch && req.method === "GET") {
      const campaignId = uuid(reportMatch[1], "campaign id");
      const c = await one<{ name: string }>("SELECT name FROM campaigns WHERE id = $1", [campaignId]);
      if (!c) throw new ApiError(404, "Campaign not found");
      return ok({ campaign: c.name, ...(await campaignResults(campaignId)) });
    }
    return null;
  }

  const campaignId = uuid(cId[1], "campaign id");
  const sub = cId[2] ?? "";
  const getCampaign = async () => {
    const c = await one<{ status: string; offering_id: string; moderation_enabled: boolean }>(
      "SELECT status, offering_id::text, moderation_enabled FROM campaigns WHERE id = $1",
      [campaignId]
    );
    if (!c) throw new ApiError(404, "Campaign not found");
    return c;
  };

  if (sub === "" && req.method === "PUT") {
    const b = await jsonBody(req);
    const v = campaignBody(b);
    const c = await getCampaign();
    if (c.status !== "draft") throw new ApiError(409, "Only draft campaigns can be edited");
    try {
      await transaction(async (client) => {
        await client.query(
          `UPDATE campaigns SET offering_id=$2, name=$3, description=$4, starts_at=$5, ends_at=$6,
                                k_threshold=$7, text_enabled=$8, moderation_enabled=$9 WHERE id=$1`,
          [campaignId, v.offeringId, v.name, v.description, v.startsAt, v.endsAt, v.k, v.textEnabled, v.moderationEnabled]
        );
        await client.query("DELETE FROM campaign_questions WHERE campaign_id = $1", [campaignId]);
        await insertQuestions(client, campaignId, v.qs);
        await client.query(
          "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id) VALUES ($1,'campaign.update','campaign',$2)",
          [actor.id, campaignId]
        );
      });
    } catch (err) { conflict(err); }
    return ok(await campaignOutput(campaignId));
  }

  if (sub === "stats" && req.method === "GET") {
    const c = await getCampaign();
    const eligible = await scalar<number>("SELECT count(*)::int AS n FROM campaign_eligibility WHERE campaign_id = $1", [campaignId]);
    const claimed = await scalar<number>("SELECT count(*)::int AS n FROM eligibility_credentials WHERE campaign_id = $1 AND issued_on IS NOT NULL", [campaignId]);
    const out: Record<string, unknown> = {
      status: c.status, eligible,
      claimed: c.status === "open" ? Math.round(claimed / 5) * 5 : claimed,
    };
    if (c.status === "closed") {
      out.submitted = await scalar<number>("SELECT count(*)::int AS n FROM responses WHERE campaign_id = $1", [campaignId]);
    }
    return ok(out);
  }

  if (sub === "eligibility") {
    guard(req, "POST");
    const b = await jsonBody(req);
    const mode = oneOf(b.mode ?? "enrolled", "mode", ["enrolled", "explicit"] as const);
    const c = await getCampaign();
    if (c.status !== "draft") throw new ApiError(409, "The roster is frozen once a campaign opens");
    const ids = mode === "enrolled"
      ? (await all<{ student_id: string }>("SELECT student_id::text FROM enrollments WHERE offering_id = $1", [c.offering_id])).map((r) => r.student_id)
      : uuidList(b.student_ids ?? [], "student_ids");
    if (mode === "explicit" && ids.length) {
      const valid = new Set((await all<{ id: string }>(
        `SELECT user_id::text AS id FROM students WHERE user_id = ANY($1::uuid[])`, [ids]
      )).map((r) => r.id));
      const filtered = ids.filter((id) => valid.has(id));
      if (filtered.length !== ids.length) throw new ApiError(400, "Unknown student in roster");
    }
    await transaction(async (client) => {
      await client.query("DELETE FROM campaign_eligibility WHERE campaign_id = $1", [campaignId]);
      for (const id of [...new Set(ids)]) {
        await client.query("INSERT INTO campaign_eligibility (campaign_id, student_id) VALUES ($1,$2)", [campaignId, id]);
      }
      await client.query(
        "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, meta) VALUES ($1,'campaign.roster','campaign',$2,$3)",
        [actor.id, campaignId, JSON.stringify({ size: new Set(ids).size, mode })]
      );
    });
    return ok({ eligible: new Set(ids).size });
  }

  if (sub === "open") {
    guard(req, "POST");
    await getCampaign();
    await openCampaign(campaignId, actor.id);
    return ok(await campaignOutput(campaignId));
  }

  if (sub === "close") {
    guard(req, "POST");
    await getCampaign();
    await closeCampaign(campaignId, actor.id);
    return ok(await campaignOutput(campaignId));
  }

  if (sub === "moderation") {
    const c = await getCampaign();
    if (req.method === "GET") {
      if (!c.moderation_enabled) return ok([]);
      const rows = await all<{ response_id: string; state: string; text: string }>(
        `SELECT r.id::text AS response_id, r.moderation AS state, ra.text_value AS text
           FROM responses r JOIN response_answers ra ON ra.response_id = r.id
          WHERE r.campaign_id = $1 AND ra.text_value IS NOT NULL`,
        [campaignId]
      );
      const grouped = new Map<string, { response_id: string; state: string; texts: string[] }>();
      for (const r of rows) {
        const item = grouped.get(r.response_id) ?? { response_id: r.response_id, state: r.state, texts: [] };
        item.texts.push(r.text);
        grouped.set(r.response_id, item);
      }
      // Shuffle so moderation order carries no information.
      return ok([...grouped.values()].sort(() => Math.random() - 0.5));
    }
    guard(req, "POST");
    const b = await jsonBody(req);
    const responseId = uuid(b.response_id, "response_id");
    const state = oneOf(b.state, "state", ["ok", "hidden"] as const);
    const r = await one<{ campaign_id: string }>("SELECT campaign_id::text FROM responses WHERE id = $1", [responseId]);
    if (!r || r.campaign_id !== campaignId) throw new ApiError(404, "Response not found");
    await query("UPDATE responses SET moderation = $2 WHERE id = $1", [responseId, state]);
    await query(
      "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, meta) VALUES ($1,'moderation.set','campaign',$2,$3)",
      [actor.id, campaignId, JSON.stringify({ state })]
    );
    return ok({ ok: true });
  }

  return null;
}
