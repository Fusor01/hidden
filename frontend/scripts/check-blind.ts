// Regression check for the blind-signature wire format.
// Generates a key, runs the browser suite (RSABSSA-SHA384-PSS-Deterministic),
// signs it with the server issuer, and verifies with the server verifier.
// A mismatch here means every ballot submission would be rejected as
// "Invalid credential" even though the browser did nothing wrong.

import { webcrypto } from "node:crypto";

if (!(globalThis as { crypto?: Crypto }).crypto) {
  (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

async function main() {
  const {
    generateSigningKey, blindSign, verifySignature, tokenMessage, b64uDecode, b64uEncode,
  } = await import("../src/server/crypto");
  const { importPublicKey, prepare, unblind } = await import("../src/lib/blind");
  const { RSABSSA } = await import("@cloudflare/blindrsa-ts");

  const campaignId = "d0000000-0000-4000-8000-000000000001";
  const key = generateSigningKey(2048);
  const publicKey = await importPublicKey(b64uEncode(key.publicKeyDer));
  const suite = RSABSSA.SHA384.PSS.Deterministic();

  const prepared = await prepare(campaignId, publicKey);
  const blinded = b64uDecode(prepared.blindedMsg, "blinded message");
  const blindSignature = blindSign(key.privateKeyDer, blinded);
  const signatureB64 = await unblind(campaignId, publicKey, prepared, b64uEncode(blindSignature));

  const signature = b64uDecode(signatureB64, "signature");
  const token = b64uDecode(prepared.token, "token");
  const message = tokenMessage(campaignId, token);

  if (token.length !== 32) throw new Error("Expected a 32-byte token");
  if (signature.length !== 256) throw new Error("Expected a 256-byte signature");
  // Copy out of Node's shared Buffer pool: Web Crypto requires an exact BufferSource.
  if (!(await suite.verify(
    publicKey,
    new Uint8Array(signature),
    new Uint8Array(message)
  ))) {
    throw new Error("Browser suite rejected the signature");
  }
  if (!verifySignature(key.publicKeyDer, message, signature)) {
    throw new Error("Server verifier rejected a valid browser signature (salt mismatch?)");
  }
  console.log("Blind signature round-trip OK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
