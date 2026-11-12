# Deployment
1. **Neon:** create two projects (identity, ballot). Run `sql/anon_roles.sql` on the ballot project. Use separate roles per service.
2. **Secrets:** generate `ELIG_HMAC_KEY` and `MASTER_KEY` (commands in `backend/.env.example`). Store them in the host's secret manager,
   not in the repo. Losing `MASTER_KEY` makes open campaigns unable to issue credentials.
3. **Backend host** (Render, Fly.io or Railway; not serverless): two services from `backend/`
   - identity: `uvicorn identity_api.main:app --host 0.0.0.0 --port $PORT --proxy-headers`
   - ballot:   `uvicorn ballot_api.main:app --host 0.0.0.0 --port $PORT --proxy-headers --no-access-log`
   Put them on different hostnames (e.g. `api.` and `ballot.`) and different log sinks. Run with a single worker per service until the
   rate limiter is moved to Redis.
4. **Migrations:** `alembic -c alembic_identity.ini upgrade head` and `alembic -c alembic_ballot.ini upgrade head`.
5. **Frontend on Vercel:** set `NEXT_PUBLIC_IDENTITY_API` and `NEXT_PUBLIC_BALLOT_API`. Set `IDENTITY_ORIGINS` / `BALLOT_ORIGINS` on the backends
   to the exact frontend origin. Keep the identity cookie host-only: the API and frontend must be same-site (same registrable domain).
6. **Scheduler:** run `python -m scripts.close_expired` every few minutes so expired campaigns close and their keys are destroyed.
7. **First admin:** `python -m scripts.create_admin you@college.edu`.
