# H.I.D.D.E.N.
**Honest Insights Delivered Discreetly, Empowering Neutrality** — anonymous course and faculty feedback where
eligibility is verified without revealing who submitted which response.

```
frontend/   Next.js 14 · TypeScript · Tailwind · Recharts   (Vercel)
backend/
  common/        RFC 9474 blind RSA, config, security helpers
  identity_api/  auth, RBAC, roster, campaigns, blind credential issuance, reports   → identity DB
  ballot_api/    verify credential, consume token, store anonymous ballot            → ballot DB
  tests/         crypto, auth/RBAC, anonymity flow, schema guarantees, suppression
```

## How anonymity works (short)
1. Student signs in to **identity-api**. The roster says they may claim one credential for the campaign (the **LLT**:
   an HMAC-derived eligibility record that cannot be reset by logging in again).
2. The browser makes a random token, **blinds** it, and identity-api signs the blinded value. It never sees the token.
3. The browser unblinds the signature and submits `(token, signature, answers)` to **ballot-api** with no cookies.
   ballot-api verifies the signature, then in ONE transaction inserts `SHA-256(token)` into `spent_tokens`
   (primary key = replay defence) and stores the ballot. This pair is the **SLT**.
4. No table, API or log joins a student to a ballot. See `docs/threat-model.md` for what that does and does not cover.

## Run locally
```bash
# backend (Python 3.11+)
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
cp .env.example .env   # fill ELIG_HMAC_KEY and MASTER_KEY (commands are in the file); use sqlite:///... URLs for local dev
python -m scripts.init_db
python -m scripts.create_admin admin@college.edu
uvicorn identity_api.main:app --port 8000
uvicorn ballot_api.main:app --port 8001 --no-access-log     # separate process, separate log sink

# frontend
cd frontend && npm install && cp .env.example .env.local && npm run dev
```
For local SQLite, set `COOKIE_SECURE=false`.

## Tests
```bash
cd backend && pytest -q      # TEST_KEY_BITS / KEY_BITS=2048 is set automatically for speed
```

## Production
See `docs/deployment.md`. Use Alembic (`alembic -c alembic_identity.ini revision --autogenerate -m init`, then
`upgrade head`; same for `alembic_ballot.ini`) instead of `init_db`, and apply `backend/sql/anon_roles.sql`.
# hidden
