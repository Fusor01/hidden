# H.I.D.D.E.N. — single Next.js serverless deployment

This replaces the old Vercel Services split (`frontend` + `identity` FastAPI + `ballot` FastAPI) with one Next.js project and one Neon Postgres database.

## What changed

- API is served by `src/app/api/v1/[...path]/route.ts` and stays at the same `/api/v1/...` paths, so the existing UI works unchanged.
- One Neon DB (`DATABASE_URL`) holds both identity and ballot tables. Ballot handlers never read the session cookie and never query identity tables.
- Blind RSA protocol is preserved: the browser blinds the token, the server blind-signs it, and the ballot route verifies a normal RSASSA-PSS signature and stores only a `sha256(token)` hash.
- Python backend is no longer required for deployment.

## Vercel setup

1. Set **Root Directory** to `frontend` (or keep repo root and use the root `vercel.json` I added).
2. Set Framework Preset to **Next.js**.
3. Add environment variables in Vercel (Production, and Preview if used):

```text
DATABASE_URL=postgresql://...neon.tech/hidden?sslmode=require
ELIG_HMAC_KEY=<64+ hex chars>
MASTER_KEY=<long random string>
APP_ORIGIN=https://hidden-sigma-ten.vercel.app
COOKIE_SECURE=true
CRON_SECRET=<random string>
```

Generate secrets locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # ELIG_HMAC_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" # MASTER_KEY / CRON_SECRET
```

4. Remove old vars you no longer need: `IDENTITY_DATABASE_URL`, `BALLOT_DATABASE_URL`, `ANON_ADMIN_DATABASE_URL`, `ANON_REPORTS_DATABASE_URL`, `IDENTITY_ORIGINS`, `BALLOT_ORIGINS`, `NEXT_PUBLIC_IDENTITY_API`, `NEXT_PUBLIC_BALLOT_API`.

## Database setup

After pulling env vars locally:

```bash
cd frontend
vercel env pull .env.local   # or create .env.local manually
npm run db:setup             # applies db/schema.sql
npm run db:seed -- --admin-email admin@college.edu --admin-password "StrongPass123!" --student-email student@college.edu --student-password "StudentPass123!"
```

## Smoke test

```bash
npm run smoke -- https://hidden-sigma-ten.vercel.app
```

Healthy results:

- `/api/v1/health` → `200 {"ok":true}`
- `/api/v1/auth/me` → `401 {"detail":"Not authenticated"}`
- `/api/v1/auth/definitely-not-a-route` → `404 {"detail":"Not Found"}`

## Blind signature check

Runs the browser's `@cloudflare/blindrsa-ts` suite against the server's signer and
verifier. If this fails, submissions will return `Invalid credential` even with a
correctly issued pass. Run it after changing either `src/lib/blind.ts` or
`src/server/crypto.ts`:

```bash
npm run test:blind
```

## Live presentation demo (Playwright)

`scripts/demo.mjs` drives the whole project in a real browser while you present:

1. signs in as admin and creates a fresh campaign with 5 question types (star, single choice, numeric, multiple choice, text),
2. sets a 10-student roster, opens the campaign,
3. signs in each of `student1@college.edu` … `student10@college.edu` in turn, answers the questions, claims a blind signature and submits,
4. closes the campaign and leaves the browser on the anonymous results page with charts and comments.

One-time setup on the presentation computer:

```bash
cd frontend
npm install
npm run demo:install     # downloads the Chromium browser
npm run db:demo          # ensures the 10 demo students exist in the DB
```

Then, with the app reachable at `DEMO_BASE_URL` (default: the deployed Vercel URL):

```bash
npm run demo
```

Useful options (PowerShell syntax):

```powershell
$env:DEMO_BASE_URL="http://localhost:3000"  # local dev; set APP_ORIGIN to the same value
$env:DEMO_HEADLESS="1"                      # hide the browser window
$env:DEMO_PAUSE="3000"                      # even slower between students (default 1500)
$env:DEMO_SLOWMO="600"                      # even slower Playwright actions (default 400)
npm run demo
```

The browser stays open on the results page until you press Enter. Set `DEMO_HOLD=0` to close it automatically. Each run creates a new campaign, so you can repeat it safely.

Demo accounts (all students use `StudentDemo123!`; admin is `admin@college.edu` / `AdminDemo123!`) are defined in `db/demo-data.sql`.

## Security note

This is simpler to deploy, but it intentionally gives up the two-DB/two-service isolation that the original design used to defend the anonymity claim. The code still enforces the protocol boundary: ballot submission routes do not read cookies, and responses/spent tokens have no user reference. For a stronger anonymity posture, use separate Neon databases/projects and service-scoped credentials.
