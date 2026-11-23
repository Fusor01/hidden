import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { NextRequest, NextResponse } from "next/server";
import { b64uDecode, b64uEncode, sha256 } from "./crypto";
import { one, query } from "./db";
import { ApiError } from "./http";

export const SESSION_COOKIE = "hidden_session";
export type Role = "student" | "faculty" | "admin";
export type AuthUser = { id: string; role: Role; name: string; email: string };

// 2 = Algorithm.Argon2id (const enum cannot be referenced under isolatedModules).
const ARGON2 = {
  algorithm: 2,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const;

export const sessionTtlMinutes = () => Number(process.env.SESSION_TTL_MINUTES ?? 120);
export const maxFailedLogins = () => Number(process.env.MAX_FAILED_LOGINS ?? 5);
export const lockoutMinutes = () => Number(process.env.LOCKOUT_MINUTES ?? 15);

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

export function attachSessionCookie(res: NextResponse, raw: Uint8Array): void {
  res.cookies.set(SESSION_COOKIE, b64uEncode(raw), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    maxAge: sessionTtlMinutes() * 60,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function createSession(userId: string): Promise<Buffer> {
  const raw = randomBytes(32);
  await query(
    "INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 * interval '1 minute'))",
    [sha256(raw), userId, sessionTtlMinutes()]
  );
  return raw;
}

export async function deleteSession(req: NextRequest): Promise<void> {
  const rawCookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!rawCookie) return;
  try {
    await query("DELETE FROM sessions WHERE id_hash = $1", [sha256(b64uDecode(rawCookie, "session"))]);
  } catch {
    // Malformed cookie: nothing to delete.
  }
}

export async function currentUser(req: NextRequest): Promise<AuthUser> {
  const rawCookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!rawCookie) throw new ApiError(401, "Not authenticated");
  let raw: Buffer;
  try {
    raw = b64uDecode(rawCookie, "session");
  } catch {
    throw new ApiError(401, "Not authenticated");
  }
  const row = await one<{ user_id: string; role: Role; name: string | null; email: string }>(
    `SELECT u.id::text AS user_id, u.role, u.email,
            CASE WHEN u.role = 'student' THEN s.name
                 WHEN u.role = 'faculty' THEN f.name
                 ELSE 'Administrator' END AS name
       FROM sessions ss
       JOIN users u ON u.id = ss.user_id
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN faculty f ON f.user_id = u.id
      WHERE ss.id_hash = $1 AND ss.expires_at > now() AND u.is_active = true`,
    [sha256(raw)]
  );
  if (!row) throw new ApiError(401, "Not authenticated");
  return { id: row.user_id, role: row.role, name: row.name ?? "Administrator", email: row.email };
}

export async function requireRole(req: NextRequest, ...roles: Role[]): Promise<AuthUser> {
  const user = await currentUser(req);
  if (!roles.includes(user.role)) throw new ApiError(403, "Forbidden");
  return user;
}
