# H.I.D.D.E.N.

**Honest Insights Delivered Discreetly, Empowering Neutrality** — anonymous course and faculty feedback where
eligibility is verified without revealing who submitted which response.

The whole application is one **Next.js 14** project. The UI and the API are served by the same deployment, and all
data lives in one **Neon Postgres** database.

```
frontend/
  src/app/          Next.js pages (student, faculty, admin, login)
  src/app/api/v1/   Catch-all route handler for the API
  src/server/       Server-only modules: DB, sessions, blind RSA, results, lifecycle
  db/schema.sql     Full database schema
  scripts/          db:setup, db:seed, smoke test
```

## How anonymity works (short)

1. A student signs in. The campaign roster says they may claim one credential (the **LLT**: an HMAC-derived
   eligibility record that cannot be reset by logging in again).
2. The browser makes a random token, **blinds** it, and asks the server to sign the blinded value. The server never
   sees the token.
3. The browser unblinds the signature and submits `(token, signature, answers)` to the ballot endpoint **without
   cookies**. The server verifies the RSA signature, then in one transaction inserts `SHA-256(token)` into
   `spent_tokens` (primary key = replay defence) and stores the anonymous ballot.
4. Ballot handlers never read the session cookie and never query identity tables. Responses and spent tokens contain
   no user reference.

The protocol boundary is enforced in code (`src/server/routes/ballot.ts`). Because identity and ballot data share one
database, this is a weaker isolation guarantee than separate databases. See
[docs/threat-model.md](docs/threat-model.md).

## Run locally

```bash
cd frontend
npm install
cp .env.example .env.local   # set DATABASE_URL, ELIG_HMAC_KEY, MASTER_KEY, APP_ORIGIN, COOKIE_SECURE=false
npm run db:setup
npm run db:seed -- --admin-email admin@college.edu --admin-password "StrongPass123!" \
  --student-email student@college.edu --student-password "StudentPass123!"
npm run dev
```

Open http://localhost:3000.

Generate the two required secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # ELIG_HMAC_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" # MASTER_KEY
```

## Deployment

See [frontend/README.serverless.md](frontend/README.serverless.md). The root `vercel.json` builds the Next.js app and
keeps the daily campaign-closure cron.

## Checks

```bash
cd frontend
npm run typecheck
npm run build
npm run smoke -- https://your-deployment.vercel.app
```
