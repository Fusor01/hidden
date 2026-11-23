import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPublicKey,
  constants,
  generateKeyPairSync,
  randomBytes,
  timingSafeEqual,
  verify as nodeVerify,
} from "node:crypto";

// RFC 9474, RSABSSA-SHA384-PSS-Deterministic. The browser uses blindrsa-ts;
// this module implements only the server side (issuer sign + verifier verify).
// That suite uses a PSS salt of hLen = 48 bytes (SHA-384), NOT the PSSZERO
// variant's zero salt. This must stay in sync with src/lib/blind.ts.
const PSS_SALT_LENGTH = 48;

export const b64uEncode = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

export function b64uDecode(value: string, label = "value"): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${label} encoding`);
  }
  return Buffer.from(value, "base64url");
}

export const sha256 = (data: Uint8Array): Buffer => createHash("sha256").update(data).digest();

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function eligDigest(campaignId: string, studentId: string): Buffer {
  const keyHex = process.env.ELIG_HMAC_KEY ?? "";
  if (!/^[0-9a-fA-F]{64,}$/.test(keyHex)) {
    throw new Error("ELIG_HMAC_KEY must be at least 32 bytes of hex (64 hex characters)");
  }
  const idA = Buffer.from(campaignId.replace(/-/g, ""), "hex");
  const idB = Buffer.from(studentId.replace(/-/g, ""), "hex");
  return createHmac("sha256", Buffer.from(keyHex, "hex")).update(Buffer.concat([idA, idB])).digest();
}

/** token_message() must match common/blindrsa.py and frontend/src/lib/blind.ts. */
export function tokenMessage(campaignId: string, token: Uint8Array): Buffer {
  return Buffer.concat([Buffer.from("hidden/v1|", "utf8"), Buffer.from(campaignId.replace(/-/g, ""), "hex"), Buffer.from(token)]);
}

function masterKey(): Buffer {
  const value = process.env.MASTER_KEY ?? "";
  if (!value) throw new Error("MASTER_KEY is not configured");
  return createHash("sha256").update(value, "utf8").digest();
}

/** AES-256-GCM: 12-byte nonce || 16-byte tag || ciphertext. Replaces Python Fernet. */
export function seal(plaintext: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function unseal(blob: Uint8Array): Buffer {
  const buf = Buffer.from(blob);
  if (buf.length < 28) throw new Error("Invalid sealed key");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}

// --- minimal DER reader (enough for PKCS#8 RSA private keys) ---

type Tlv = { tag: number; content: Buffer; next: number };
function tlv(buf: Buffer, offset: number): Tlv {
  if (offset + 2 > buf.length) throw new Error("Malformed DER");
  const tag = buf[offset++];
  let len = buf[offset++];
  if (len & 0x80) {
    const bytes = len & 0x7f;
    if (bytes === 0 || bytes > 4 || offset + bytes > buf.length) throw new Error("Malformed DER length");
    len = 0;
    for (let i = 0; i < bytes; i++) len = len * 256 + buf[offset++];
  }
  if (offset + len > buf.length) throw new Error("Malformed DER length");
  return { tag, content: buf.subarray(offset, offset + len), next: offset + len };
}

const toBig = (buf: Buffer): bigint => BigInt("0x" + (buf.toString("hex") || "0"));

function fromBig(value: bigint, length: number): Buffer {
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const out = Buffer.from(hex, "hex");
  if (out.length > length) throw new Error("Integer too large");
  return Buffer.concat([Buffer.alloc(length - out.length), out]);
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

function rsaNumbers(privateDer: Uint8Array): { n: bigint; e: bigint; d: bigint; k: number } {
  const pkcs8 = tlv(Buffer.from(privateDer), 0);
  let p = 0;
  tlv(pkcs8.content, p); p = tlv(pkcs8.content, p).next; // version
  tlv(pkcs8.content, p); p = tlv(pkcs8.content, p).next; // algorithm
  const wrapper = tlv(pkcs8.content, p); p = wrapper.next; // OCTET STRING
  const rsa = tlv(wrapper.content, 0);
  let q = 0;
  tlv(rsa.content, q); q = tlv(rsa.content, q).next; // version
  const n = toBig(tlv(rsa.content, q).content); q = tlv(rsa.content, q).next;
  const e = toBig(tlv(rsa.content, q).content); q = tlv(rsa.content, q).next;
  const d = toBig(tlv(rsa.content, q).content);
  return { n, e, d, k: Math.ceil(n.toString(2).length / 8) };
}

export function generateSigningKey(bits = 3072): {
  keyId: string;
  publicKeyDer: Buffer;
  privateKeyDer: Buffer;
} {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: bits,
    publicExponent: 65537,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  const publicKeyDer = publicKey as Buffer;
  return {
    keyId: sha256(publicKeyDer).toString("hex").slice(0, 16),
    publicKeyDer,
    privateKeyDer: privateKey as Buffer,
  };
}

/** Raw RSA private operation: m^d mod n. Fault-checked before returning. */
export function blindSign(privateDer: Uint8Array, blinded: Uint8Array): Buffer {
  const { n, e, d, k } = rsaNumbers(privateDer);
  if (blinded.length !== k) throw new Error("Invalid blinded message length");
  const z = toBig(Buffer.from(blinded));
  if (z <= 0n || z >= n) throw new Error("Invalid blinded message");
  const s = modPow(z, d, n);
  if (modPow(s, e, n) !== z) throw new Error("Signing fault");
  return fromBig(s, k);
}

export function verifySignature(publicDer: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicDer), format: "der", type: "spki" });
    return nodeVerify(
      "sha384",
      Buffer.from(message),
      { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: PSS_SALT_LENGTH },
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}
