import { NextRequest, NextResponse } from "next/server";
import {
  attachSessionCookie, clearSessionCookie, createSession, currentUser, deleteSession,
  lockoutMinutes, maxFailedLogins, verifyPassword,
} from "../auth";
import { one, query } from "../db";
import { ApiError, clientIp, guard, jsonBody, noContent, ok, rateLimit } from "../http";
import { str } from "../validate";

export async function handleAuth(req: NextRequest, parts: string[]): Promise<NextResponse | null> {
  const route = parts.slice(1).join("/");

  if (route === "login") {
    guard(req, "POST");
    const body = await jsonBody(req);
    const email = str(body.email, "email", 1, 254).trim().toLowerCase();
    const password = str(body.password, "password", 1, 200);
    rateLimit(`login-ip:${clientIp(req)}`, 20, 60_000);
    rateLimit(`login-acct:${email}`, 8, 60_000);

    const user = await one<{
      id: string; password_hash: string; role: "student" | "faculty" | "admin";
      is_active: boolean; locked_until: Date | null;
    }>(
      "SELECT id::text, password_hash, role, is_active, locked_until FROM users WHERE email = $1",
      [email]
    );
    const generic = () => new ApiError(401, "Invalid credentials");
    if (!user) throw generic();
    if (!user.is_active || (user.locked_until && new Date(user.locked_until).getTime() > Date.now())) throw generic();

    if (!(await verifyPassword(user.password_hash, password))) {
      const failed = Number((await one<{ n: number }>(
        "SELECT failed_logins AS n FROM users WHERE id = $1", [user.id]
      ))?.n ?? 0) + 1;
      if (failed >= maxFailedLogins()) {
        await query(
          "UPDATE users SET failed_logins = 0, locked_until = now() + ($2 * interval '1 minute') WHERE id = $1",
          [user.id, lockoutMinutes()]
        );
      } else {
        await query("UPDATE users SET failed_logins = $2 WHERE id = $1", [user.id, failed]);
      }
      throw generic();
    }

    await query("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1", [user.id]);
    const nameRow = await one<{ name: string | null }>(
      `SELECT CASE WHEN u.role = 'student' THEN s.name
                   WHEN u.role = 'faculty' THEN f.name
                   ELSE 'Administrator' END AS name
         FROM users u
         LEFT JOIN students s ON s.user_id = u.id
         LEFT JOIN faculty f ON f.user_id = u.id
        WHERE u.id = $1`,
      [user.id]
    );
    const raw = await createSession(user.id);
    const res = ok({ role: user.role, name: nameRow?.name ?? "Administrator" });
    attachSessionCookie(res, raw);
    return res;
  }

  if (route === "logout") {
    guard(req, "POST");
    await deleteSession(req);
    const res = noContent();
    clearSessionCookie(res);
    return res;
  }

  if (route === "me") {
    guard(req, "GET");
    const user = await currentUser(req);
    return ok({ id: user.id, role: user.role, name: user.name });
  }

  return null;
}
