# Deployment

H.I.D.D.E.N. deploys as a single Next.js project on Vercel with one Neon Postgres database. There are no separate
services and no Python runtime.

- Root `vercel.json` builds `frontend/` and registers the daily campaign-closure cron.
- Framework preset: **Next.js**.
- Set the Vercel project root to the repository root (or to `frontend/` and use `frontend/vercel.json`).

Environment variables:

```text
DATABASE_URL      Neon pooled connection string
ELIG_HMAC_KEY     64+ hex characters
MASTER_KEY        long random string (AES-256-GCM key material)
APP_ORIGIN        exact deployed origin, e.g. https://feedback.example.com
COOKIE_SECURE     true in production
CRON_SECRET       random string used by the daily cron
```

Run `frontend/db/schema.sql` once (via `npm run db:setup`) and create the first admin (via `npm run db:seed`).

Full instructions, including database setup, seeding and the smoke test, are in
[frontend/README.serverless.md](../frontend/README.serverless.md).

**Security note:** one project and one database means one `DATABASE_URL` can read both identity and ballot tables.
The code keeps the protocol boundary (ballot handlers never read cookies and never query identity tables), but it does
not provide the architectural secret isolation of separate databases. For a stronger anonymity posture, split identity
and ballot into separate Neon projects. See [threat-model.md](threat-model.md).
