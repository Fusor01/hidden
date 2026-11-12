# Deploy: Netlify (frontend) + Vercel (two backend projects)

Hostnames on ONE registrable domain (needed for the SameSite=Lax login cookie):
`feedback.example.com` -> Netlify, `api.example.com` -> Vercel project "hidden-identity", `ballot.example.com` -> Vercel project "hidden-ballot".

1. Neon: two projects. Use the pooled host (`-pooler`) in every URL, prefix `postgresql+psycopg://`.
2. Locally with owner URLs in backend/.env: `python -m scripts.init_db`, `python -m scripts.create_admin you@college.edu`, then run sql/anon_roles.sql on the ballot project.
3. Vercel: import the repo TWICE. Root Directory `backend`, Framework "Other", no build command.
   - hidden-identity env: HIDDEN_SERVICE=identity, IDENTITY_DATABASE_URL, ANON_ADMIN_DATABASE_URL, ANON_REPORTS_DATABASE_URL,
     ELIG_HMAC_KEY, MASTER_KEY, KEY_BITS=3072, COOKIE_SECURE=true, IDENTITY_ORIGINS=["https://feedback.example.com"], CRON_SECRET, DOCS_ENABLED=false
   - hidden-ballot env: HIDDEN_SERVICE=ballot, BALLOT_DATABASE_URL (ballot_rw), BALLOT_ORIGINS=["https://feedback.example.com"], DOCS_ENABLED=false
   Never put identity credentials or the two secrets in the ballot project.
4. Netlify: base directory `frontend`, env NEXT_PUBLIC_IDENTITY_API=https://api.example.com/api/v1 and NEXT_PUBLIC_BALLOT_API=https://ballot.example.com/api/v1 (set BEFORE the first build).
5. Vercel Firewall: add rate-limit rules for POST /api/v1/auth/login and POST /api/v1/campaigns/*/submit. The in-app limiter is per instance and does not hold on serverless.
6. Hobby cron runs once a day (03:00 UTC). Campaigns still stop accepting claims and ballots at their end time; the daily job only flips status and destroys the key, and results appear after that. Close manually in the admin UI for same-day results, or use Pro for a faster schedule.
