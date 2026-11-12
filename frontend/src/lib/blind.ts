// Browser side of the blind-signature protocol (RFC 9474, RSABSSA-SHA384-PSS-Deterministic).
// The token never leaves this browser until it is submitted, unblinded, to the ballot API.
import { RSABSSA } from "@cloudflare/blindrsa-ts";

const suite = RSABSSA.SHA384.PSS.Deterministic();

export const b64uEncode = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const b64uDecode = (s: string): Uint8Array => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
};

const uuidBytes = (id: string): Uint8Array => {
  const hex = id.replace(/-/g, "");
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
};

/** Must match common/blindrsa.py token_message(): b"hidden/v1|" + campaign uuid bytes + token. */
export function tokenMessage(campaignId: string, token: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode("hidden/v1|");
  const id = uuidBytes(campaignId);
  const out = new Uint8Array(prefix.length + id.length + token.length);
  out.set(prefix, 0); out.set(id, prefix.length); out.set(token, prefix.length + id.length);
  return out;
}

export async function importPublicKey(spkiB64u: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", b64uDecode(spkiB64u), { name: "RSA-PSS", hash: "SHA-384" }, true, ["verify"]);
}

export interface Prepared { token: string; blindedMsg: string; inv: string }

export async function prepare(campaignId: string, publicKey: CryptoKey): Promise<Prepared> {
  const token = crypto.getRandomValues(new Uint8Array(32));
  const { blindedMsg, inv } = await suite.blind(publicKey, tokenMessage(campaignId, token));
  return { token: b64uEncode(token), blindedMsg: b64uEncode(blindedMsg), inv: b64uEncode(inv) };
}

export async function unblind(campaignId: string, publicKey: CryptoKey, p: Prepared, blindSig: string): Promise<string> {
  const sig = await suite.finalize(publicKey, tokenMessage(campaignId, b64uDecode(p.token)), b64uDecode(blindSig), b64uDecode(p.inv));
  return b64uEncode(sig);
}
