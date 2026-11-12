-- Run once on the ANONYMOUS (ballot) database, as the owner. Replace passwords.
-- Goal: even a stolen credential for one service cannot do what another service does.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;

-- ballot-api: may read the public campaign schema and ONLY append ballots. Cannot read ballots back.
CREATE ROLE ballot_rw LOGIN PASSWORD 'CHANGE';
GRANT SELECT ON campaign_public, questions_public, options_public TO ballot_rw;
GRANT SELECT, INSERT ON spent_tokens TO ballot_rw;         -- hashes only; SELECT serves /spent after close
GRANT INSERT ON responses, response_answers TO ballot_rw;

-- identity-api, publishing and moderation. Never used to look up a student.
CREATE ROLE anon_admin LOGIN PASSWORD 'CHANGE';
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_public, questions_public, options_public TO anon_admin;
GRANT SELECT ON responses, response_answers TO anon_admin;
GRANT UPDATE (moderation) ON responses TO anon_admin;

-- identity-api, aggregates (read only). Raw rows are only touched by identity_api/services/results.py.
CREATE ROLE anon_reports LOGIN PASSWORD 'CHANGE';
GRANT SELECT ON campaign_public, questions_public, options_public, responses, response_answers TO anon_reports;

-- HARDENING NOT YET DONE: replace the anon_reports table grants with SECURITY DEFINER functions that
-- enforce the k-threshold in SQL, so even a compromised identity-api could not read raw rows.
