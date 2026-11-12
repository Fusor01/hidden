# Architecture (as built)

Two services, two databases, no foreign keys between them. The only shared value is `campaign_id`.

```
Browser ──cookie──▶ identity-api ──▶ identity DB   (users, roster, LLT, signing keys, audit)
   │                     │ publishes campaign + public key, reads aggregates
   └──no cookies──▶ ballot-api  ──▶ anonymous DB  (campaign_public, spent_tokens, responses, answers)
```

## ER diagram
```
IDENTITY DB
users 1─1 students / faculty;  users 1─< sessions, audit_logs
courses ─< course_offerings >─ semesters, faculty;  students >─< course_offerings (enrollments)
campaigns >─ course_offerings;  campaigns 1─< campaign_questions 1─< question_options
campaigns 1─< campaign_eligibility (roster)  1─1 eligibility_credentials (LLT: digest, issued_on DATE, blinded_hash)
campaigns 1─1 signing_keys (public key; private key sealed, NULL after close)
─────────── no foreign keys cross this line ───────────
ANONYMOUS DB
campaign_public 1─< questions_public 1─< options_public
campaign_public 1─< spent_tokens (PK: campaign_id, token_hash)
campaign_public 1─< responses (random UUID, moderation) 1─< response_answers
```

## Key constraints
`eligibility_credentials` PK (campaign, student) + unique `llt_digest` · `spent_tokens` PK (campaign, token_hash) ·
`CHECK k_threshold >= 3` · `CHECK` exactly one value column per `response_answers` row · anonymous tables have no
student column, no timestamps and UUID keys (all enforced by `tests/test_schema_anonymity.py`).

## Proposed vs built
| Proposal | As built |
|---|---|
| k-suppression enforced by SQL functions with a function-only DB role | Enforced in `identity_api/services/results.py`. `sql/anon_roles.sql` limits what each role can do, but the `anon_reports` role can still SELECT raw ballot rows. **SQL-function hardening is not done.** |
| Separate reports service | Reports router lives in identity-api, using the `anon_reports` role |
| Delayed live counters | Claimed count is rounded to 5 while a campaign is open; submitted count appears only after close |
| Per-process rate limiter | In-memory. Replace with Redis if you run more than one worker |
