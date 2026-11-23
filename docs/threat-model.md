# Threat model

## What is guaranteed

The application does not store a link between a student and a ballot, and the blind-signature flow prevents the issuer
from recognising a token later: the browser blinds the token before signing, and the server verifies the unblinded
signature without learning which student it came from. Ballot handlers never read the session cookie and never query
identity tables.

## What is NOT guaranteed

- **A compromised `DATABASE_URL`.** Identity and ballot tables share one database in this deployment, so anyone with the
  database credential can read both sides. The separation is procedural and code-level, not architectural. Use separate
  databases/projects if you need the stronger guarantee.
- **Network metadata.** The host or CDN sees IPs and request times for claims and submissions. Someone with access to the
  request logs can try to match a claim to a submission by timing. Mitigations: no cookies or referrer on ballot
  requests, date-only `issued_on`, no timestamps on ballots. Residual risk is real for small, quiet campaigns.
- **Free text.** Comments can identify an author by content or style. Mitigation: k-threshold for text, shuffling,
  optional moderation.
- **Malicious infrastructure admin** with access to the database, request logs and the signing keys' master key.
- **Coercion** or a compromised student device.
- **Lost browser state after claiming.** The credential cannot be recovered (a reissue path would allow a second ballot).
  The same blinded message can be re-sent safely, so a refresh or network failure is fine.
- **Revocation after claiming.** A claimed credential cannot be revoked because nobody knows whose it is.
- **Attribute disclosure.** If every respondent gives the same answer, that answer is known. k-anonymity hides identity,
  not unanimity.

## Threat table

| Threat | Handling |
|---|---|
| Database stolen | One database contains roster, claim dates, hashed passwords, ballots and token hashes. There is no row-level link between a student and a ballot, but the reader can see both data sets. This is the main trade-off of the single-DB deployment. |
| Admin abuse | Admin API has no path to a named ballot. Roster frozen at open with a published hash; invariant submitted ≤ claimed ≤ eligible is visible after close. |
| Token theft | One-shot, campaign-bound. A thief can spend it once; the victim then cannot. |
| Replay / concurrent replay | `PRIMARY KEY (campaign_id, token_hash)` in the same transaction as the ballot. |
| Forgery | RSA-3072 signature verified before any DB write. |
| Brute force | 256-bit tokens; rate limits on login, claim and submit; account lockout. |
| CSRF | SameSite=Lax host-only cookie plus Origin allow-list on unsafe methods. |
| IDOR | Faculty/student lookups are scoped by the session user; foreign IDs return 404. |
| Logs | Never log tokens or answers. Ballot requests are made without cookies or referrer. |
