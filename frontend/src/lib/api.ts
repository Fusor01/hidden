const IDENTITY = process.env.NEXT_PUBLIC_IDENTITY_API ?? "http://localhost:8000/api/v1";
const BALLOT = process.env.NEXT_PUBLIC_BALLOT_API ?? "http://localhost:8001/api/v1";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail;
    throw new ApiError(res.status, typeof d === "string" ? d : "Request failed");
  }
  return data as T;
}

/** Identity API: cookie session. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(IDENTITY + path, {
    ...rest,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  return parse<T>(res);
}

/** Ballot API: NEVER sends cookies. This is what keeps the ballot separate from the session. */
export async function ballot<T>(path: string, json?: unknown): Promise<T> {
  const res = await fetch(BALLOT + path, {
    method: json !== undefined ? "POST" : "GET",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  return parse<T>(res);
}
