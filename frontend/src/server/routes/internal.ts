import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual } from "../crypto";
import { all, query } from "../db";
import { ApiError, guard, ok } from "../http";
import { closeCampaign } from "../lifecycle";

export async function handleInternal(req: NextRequest, parts: string[]): Promise<NextResponse | null> {
  const route = parts.slice(1).join("/");
  if (route !== "close-expired") return null;
  guard(req, "GET");

  const secret = process.env.CRON_SECRET ?? "";
  const presented = req.headers.get("authorization") ?? "";
  if (!secret || !constantTimeEqual(Buffer.from(presented), Buffer.from(`Bearer ${secret}`))) {
    throw new ApiError(401, "Unauthorized");
  }

  const expired = await all<{ id: string }>(
    "SELECT id::text FROM campaigns WHERE status = 'open' AND ends_at <= now()"
  );
  let closed = 0;
  for (const c of expired) {
    await closeCampaign(c.id, null);
    closed++;
  }
  return ok({ closed });
}
