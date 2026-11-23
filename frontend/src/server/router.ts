import { NextRequest, NextResponse } from "next/server";
import { query } from "./db";
import { ApiError, assertOrigin, errorResponse, guard, ok } from "./http";
import { handleAdmin } from "./routes/admin";
import { handleAuth } from "./routes/auth";
import { handleBallot } from "./routes/ballot";
import { handleFaculty } from "./routes/faculty";
import { handleInternal } from "./routes/internal";
import { handleStudent } from "./routes/student";

/**
 * One catch-all route replaces the old identity + ballot services. All paths stay
 * exactly the same (/api/v1/...) so the frontend API client needed no changes.
 */
export async function handleApi(req: NextRequest): Promise<NextResponse> {
  try {
    assertOrigin(req);
    const parts = new URL(req.url).pathname.replace(/^\/api\/v1\/?/, "").split("/").filter(Boolean);

    // DB-free-ish readiness probe. Useful for deployment smoke tests.
    if (parts[0] === "health") {
      guard(req, "GET");
      try {
        await query("SELECT 1");
        return ok({ ok: true });
      } catch {
        return ok({ ok: false }, 503);
      }
    }

    // Ballot routes deliberately run before any session lookup: no cookies are read.
    const result =
      parts[0] === "campaigns" ? await handleBallot(req, parts)
        : parts[0] === "auth" ? await handleAuth(req, parts)
          : parts[0] === "student" ? await handleStudent(req, parts)
            : parts[0] === "faculty" ? await handleFaculty(req, parts)
              : parts[0] === "admin" ? await handleAdmin(req, parts)
                : parts[0] === "internal" ? await handleInternal(req, parts)
                  : null;
    if (!result) throw new ApiError(404, "Not Found");
    return result;
  } catch (err) {
    return errorResponse(err);
  }
}
