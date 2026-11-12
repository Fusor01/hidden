# Deploy H.I.D.D.E.N. with Vercel Services

The repository-root `vercel.json` defines one Vercel project with three independently built services:

| Service | Root | Entrypoint | Public path |
|---|---|---|---|
| `frontend` | `frontend/` | Next.js | `/` (catch-all after API rewrites) |
| `identity` | `backend/` | `identity_api.main:app` | `/api/v1/auth/*`, `/student/*`, `/faculty/*`, `/admin/*`, `/internal/*` |
| `ballot` | `backend/` | `ballot_api.main:app` | `/api/v1/campaigns/*` |

The two FastAPI services intentionally share the `backend/` root so they can import the same `common/` package and dependency file. Their distinct ASGI entrypoints select the app for each service. Public rewrites preserve the original request path, which matches the FastAPI route prefixes already present in the code.

## Before deploying

1. Import this repository into Vercel as **one project**.
2. Set the project's **Framework Preset** to **Services**. A `services` block in `vercel.json` alone is not sufficient; Vercel's project framework must also be Services.
3. Set the project root directory to the repository root (the directory containing this `vercel.json`). Do not set it to `frontend/` or `backend/`.
4. Configure the production domain and environment variables, then deploy.

## Environment variables

Create two Neon databases (identity and ballot) and apply `backend/sql/anon_roles.sql` to the ballot database. Configure the variables below in Vercel. Never commit actual values.

**Identity runtime needs:**

- `IDENTITY_DATABASE_URL`
- `ANON_ADMIN_DATABASE_URL`
- `ANON_REPORTS_DATABASE_URL`
- `ELIG_HMAC_KEY` (at least 32 random bytes, hex encoded)
- `MASTER_KEY` (Fernet key)
- `IDENTITY_ORIGINS` (JSON array containing the exact deployed frontend origin, e.g. `["https://feedback.example.com"]`)
- `CRON_SECRET` (long random secret used to authorize the daily cron)
- `COOKIE_SECURE=true`
- `DOCS_ENABLED=false`

**Ballot runtime needs:**

- `BALLOT_DATABASE_URL` (use the `ballot_rw` role)
- `BALLOT_ORIGINS` (JSON array containing the exact deployed frontend origin)
- `DOCS_ENABLED=false`

**Important security limitation of a single Vercel project:** Vercel project environment variables are project-scoped, not documented as per-service secrets. Assume every service in this project can read every project environment variable. Therefore, placing identity DB credentials, `ELIG_HMAC_KEY`, or `MASTER_KEY` in this project also makes them available to the ballot service's runtime. That weakens the intended identity/ballot isolation even though the code imports separate apps and uses separate DB roles. Do not treat this one-project layout as preserving secret isolation. For the strongest H.I.D.D.E.N. anonymity boundary, deploy identity and ballot in separate Vercel projects (or use a hosting platform with service-scoped secret injection). This repository configuration implements the requested one-project routing, but production use requires an explicit security decision about this trade-off.

The `IDENTITY_ORIGINS` and `BALLOT_ORIGINS` settings are used by the backend's origin/CSRF middleware. For preview deployments, configure the corresponding exact preview origins as appropriate; do not replace them with `*`.

The frontend API client defaults to same-origin `/api/v1` paths. Leave `NEXT_PUBLIC_IDENTITY_API` and `NEXT_PUBLIC_BALLOT_API` unset in Vercel. They remain in `frontend/.env.example` only for standalone local development on ports 8000 and 8001.

## Routing

- `/api/v1/campaigns/*` → `ballot`
- `/api/v1/auth/*`, `/api/v1/student/*`, `/api/v1/faculty/*`, `/api/v1/admin/*`, `/api/v1/internal/*` → `identity`
- all other paths → `frontend`

The ballot API is public only under `/api/v1/campaigns/*`. Its docs and other paths are not exposed by the top-level rewrites. The identity API is exposed only under the listed prefixes. The cron endpoint is part of the identity API and requires `Authorization: Bearer $CRON_SECRET`.

## Daily campaign closure cron

The root `vercel.json` preserves the existing daily schedule:

- Path: `/api/v1/internal/close-expired`
- Schedule: `0 3 * * *` (03:00 UTC daily)

Vercel Cron invokes this route with the `CRON_SECRET` bearer token. The daily job marks expired campaigns closed and destroys signing keys; requests and ballot submission are independently rejected once a campaign's end time has passed. On plans where daily cron frequency is the minimum, results may not be published until the next scheduled run unless an administrator closes the campaign manually.

## Database migrations and initial admin

Run migrations from the repository locally or in a trusted one-off environment, not as part of a public request:

```bash
cd backend
alembic -c alembic_identity.ini upgrade head
alembic -c alembic_ballot.ini upgrade head
python -m scripts.create_admin admin@college.edu
```

Apply `sql/anon_roles.sql` to the ballot database before deployment. Never give the ballot service identity database credentials or identity signing secrets in a deployment architecture that claims strong service isolation.

## Local development

For the existing two-port local setup, copy `frontend/.env.example` to `frontend/.env.local`, then run:

```bash
# terminal 1
cd backend
uvicorn identity_api.main:app --port 8000

# terminal 2
cd backend
uvicorn ballot_api.main:app --port 8001 --no-access-log

# terminal 3
cd frontend
npm install
npm run dev
```

To exercise Vercel's multi-service routing locally, install the Vercel CLI and run `vercel dev` from the repository root. The Vercel project framework must be set to Services for cloud deployments.
