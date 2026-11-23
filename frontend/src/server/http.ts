import { NextRequest, NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: SECURITY_HEADERS });
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return ok({ detail: err.message }, err.status);
  }
  // Never leak stack traces or DB errors to the client. Log for diagnostics instead.
  console.error("[api] unhandled error", err);
  return ok({ detail: "Internal server error" }, 500);
}

export function guard(req: NextRequest, ...methods: string[]): void {
  if (!methods.includes(req.method)) throw new ApiError(405, "Method not allowed");
}

/** CSRF defence for cookie-authenticated mutations. Mirrors the old Origin middleware. */
export function assertOrigin(req: NextRequest): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
  const expected = process.env.APP_ORIGIN ?? `${proto}://${host}`;
  if ((req.headers.get("origin") ?? "") !== expected) throw new ApiError(403, "Origin not allowed");
}

export async function jsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Expected a JSON object");
  }
  return body as Record<string, unknown>;
}

// Per-instance sliding window. This is the same limitation as the old in-process
// limiter: on serverless it is not shared across instances. Use Redis/Upstash if
// strict limits matter.
const hits = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const queue = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (queue.length >= limit) {
    hits.set(key, queue);
    throw new ApiError(429, "Too many requests. Try again later.");
  }
  queue.push(now);
  hits.set(key, queue);
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
