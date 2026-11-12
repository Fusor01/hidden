# Threat model

## What is guaranteed
The application databases contain no link between a student and a ballot, and neither service can create one:
the issuer signs a value it cannot read, so it cannot recognise the token later.

## What is NOT guaranteed
- **Network metadata.** The host, CDN or ISP see IPs and request times for both services. Someone with both logs can try to
  match a claim to a submission by timing. Mitigations: no access logs on ballot-api, no cookies, optional client-side random
  delay, date-only `issued_on`, no timestamps on ballots. Residual risk is real for small, quiet campaigns.
- **Free text.** Comments can identify an author by content or style. Mitigation: k-threshold for text, shuffling, optional moderation.
- **Malicious infrastructure admin** with access to both databases, both log sinks and the signing keys' master key.
- **Coercion** or a compromised student device.
- **Lost browser state after claiming.** The credential cannot be recovered (a reissue path would allow a second ballot). The same
  blinded message can be re-sent safely, so a refresh or network failure is fine.
- **Revocation after claiming.** A claimed credential cannot be revoked because nobody knows whose it is.
- **Attribute disclosure.** If every respondent gives the same answer, that answer is known. k-anonymity hides identity, not unanimity.

## Threat table
| Threat | Handling |
|---|---|
| Identity DB stolen | Contains roster, claim dates, hashed passwords. No tokens, no ballots. |
| Anonymous DB stolen | Ballots and token hashes only. No identity. |
| Admin abuse | Admin API has no path to ballots except moderation text without identity. Roster frozen at open with a published hash; invariant submitted ≤ claimed ≤ eligible is visible after close. |
| Token theft | One-shot, campaign-bound. A thief can spend it once; the victim then cannot. |
| Replay / concurrent replay | `PRIMARY KEY (campaign_id, token_hash)` in the same transaction as the ballot. Tested with 8 parallel submits. |
| Forgery | RSA-3072 signature verified before any DB write. |
| Brute force | 256-bit tokens; rate limits on login, claim and submit; account lockout. |
| CSRF | SameSite=Lax host-only cookie plus Origin allow-list on unsafe methods. |
| IDOR | Faculty/student lookups are scoped by the session user; foreign IDs return 404. Covered by tests. |
| Backups | Two separate Neon projects with separate access; keep PITR windows short. WAL order can reveal insertion order to an infrastructure insider. |
| Cross-service logging | Ballot-api: run with `--no-access-log`, ship logs elsewhere, never log tokens or answers. No per-student claim audit event exists. |
