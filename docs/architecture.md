# Architecture (as built)

One Next.js application and one Postgres database. The identity/ballot separation is enforced by code and by the blind
signature protocol, not by separate services or separate database credentials.

```
Browser ──cookie──▶ Next.js API routes ──▶ Postgres   (users, roster, LLT, signing keys, audit)
   │                      │
   └──no cookies──▶ same API, ballot handlers ──▶ Postgres   (campaign_public, spent_tokens, responses, answers)
```

Both handler groups live in `frontend/src/server/routes/` and are dispatched by `frontend/src/server/router.ts`.
Ballot routes (`routes/ballot.ts`) never read the session cookie and never query identity tables. Identity routes never
read ballot answers except the moderation and aggregate report paths.

## ER diagram

```
users 1─1 students / faculty;  users 1─< sessions, audit_logs
courses ─< course_offerings >─ semesters, faculty;  students >─< course_offerings (enrollments)
campaigns >─ course_offerings;  campaigns 1─< campaign_questions 1─< question_options
campaigns 1─< campaign_eligibility (roster)  1─1 eligibility_credentials (LLT: digest, issued_on DATE, blinded_hash)
campaigns 1─1 signing_keys (public key; private key sealed, NULL after close)
campaign_public 1─< questions_public 1─< options_public
campaign_public 1─< spent_tokens (PK: campaign_id, token_hash)
campaign_public 1─< responses (random UUID, moderation) 1─< response_answers
```

All tables are in one database. There are no foreign keys from ballot tables to identity tables.

## Key constraints

`eligibility_credentials` PK (campaign, student) + unique `llt_digest` · `spent_tokens` PK (campaign, token_hash) ·
`CHECK k_threshold >= 3` · `CHECK` exactly one value column per `response_answers` row · anonymous tables have no
student column and no timestamps, and use UUID keys. These are defined in `frontend/db/schema.sql`.

## Design decisions

| Decision | As built |
|---|---|
| k-suppression | Enforced in `frontend/src/server/results.ts`. |
| Delayed live counters | Claimed count is rounded to 5 while a campaign is open; submitted count appears only after close. |
| Per-process rate limiter | In-memory in `frontend/src/server/http.ts`. Replace with Redis/Upstash if strict limits matter. |
| Signing-key storage | RSA private key sealed with AES-256-GCM under `MASTER_KEY`; destroyed on close. |
| Sessions | Random 32-byte cookie; only its SHA-256 hash is stored in `sessions`. |
