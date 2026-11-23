import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth";
import { all, one } from "../db";
import { ApiError, guard, ok } from "../http";
import { campaignResults } from "../results";
import { uuid } from "../validate";

type OwnCampaign = {
  id: string; name: string; status: string; code: string; title: string; semester: string;
};

const OWN = `
  SELECT c.id::text, c.name, c.status, co.code, co.title, s.name AS semester
    FROM campaigns c
    JOIN course_offerings o ON o.id = c.offering_id
    JOIN courses co ON co.id = o.course_id
    JOIN semesters s ON s.id = o.semester_id`;

async function ownCampaign(userId: string, campaignId?: string): Promise<OwnCampaign[]> {
  return all<OwnCampaign>(
    `${OWN} WHERE o.faculty_id = $1 AND c.status != 'draft' ${campaignId ? "AND c.id = $2" : ""}
      ORDER BY s.start_date DESC, co.code`,
    campaignId ? [userId, campaignId] : [userId]
  );
}

export async function handleFaculty(req: NextRequest, parts: string[]): Promise<NextResponse | null> {
  const user = await requireRole(req, "faculty");
  const route = parts.slice(1).join("/");
  guard(req, "GET");

  if (route === "dashboard") {
    const rows = await ownCampaign(user.id);
    return ok({
      campaigns: rows.length,
      open: rows.filter((r) => r.status === "open").length,
      closed: rows.filter((r) => r.status === "closed").length,
    });
  }

  if (route === "courses") {
    const rows = await ownCampaign(user.id);
    return ok(rows.map((r) => ({
      campaign_id: r.id, name: r.name, course_code: r.code,
      course_title: r.title, semester: r.semester, status: r.status,
    })));
  }

  if (route === "analytics") {
    const rows = await ownCampaign(user.id);
    const out = [];
    for (const r of rows.filter((x) => x.status === "closed")) {
      const results = await campaignResults(r.id);
      out.push({
        campaign_id: r.id, campaign: r.name, course: r.code, semester: r.semester,
        released: results.released,
        n: "n" in results ? results.n : null,
        overall_mean: "overall_mean" in results ? results.overall_mean : null,
      });
    }
    return ok(out);
  }

  const resultMatch = route.match(/^campaigns\/([^/]+)\/results$/);
  if (resultMatch) {
    const campaignId = uuid(resultMatch[1], "campaign id");
    const rows = await ownCampaign(user.id, campaignId);
    if (!rows.length) throw new ApiError(404, "Campaign not found");
    const r = rows[0];
    return ok({
      campaign: r.name, course: `${r.code} ${r.title}`, semester: r.semester,
      ...(await campaignResults(campaignId)),
    });
  }

  const reportMatch = route.match(/^reports\/([^/]+)$/);
  if (reportMatch) {
    const campaignId = uuid(reportMatch[1], "campaign id");
    const rows = await ownCampaign(user.id, campaignId);
    if (!rows.length) throw new ApiError(404, "Campaign not found");
    const r = rows[0];
    const fac = await one<{ name: string }>("SELECT name FROM faculty WHERE user_id = $1", [user.id]);
    return ok({
      title: r.name, faculty: fac?.name ?? "", course: `${r.code} ${r.title}`, semester: r.semester,
      ...(await campaignResults(campaignId)),
    });
  }

  return null;
}
