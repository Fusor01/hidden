-- H.I.D.D.E.N. single-database schema.
-- One Neon Postgres database; identity tables and ballot tables coexist in public.
-- The ballot tables are never read by session-authenticated routes except through
-- the explicit results/moderation code paths, and never contain a user reference.
-- Apply with: npm run db:setup

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  role varchar(10) NOT NULL CHECK (role IN ('student','faculty','admin')),
  is_active boolean NOT NULL DEFAULT true,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  roll_no varchar(40) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  department varchar(80),
  batch_year integer
);

CREATE TABLE IF NOT EXISTS faculty (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_no varchar(40) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  department varchar(80)
);

CREATE TABLE IF NOT EXISTS semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(60) NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date > start_date)
);

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  title varchar(160) NOT NULL,
  department varchar(80)
);

CREATE TABLE IF NOT EXISTS course_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  faculty_id uuid NOT NULL REFERENCES faculty(user_id) ON DELETE RESTRICT,
  section varchar(10) NOT NULL DEFAULT 'A',
  UNIQUE (course_id, semester_id, faculty_id, section)
);

CREATE TABLE IF NOT EXISTS enrollments (
  student_id uuid NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, offering_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES course_offerings(id) ON DELETE RESTRICT,
  name varchar(160) NOT NULL,
  description text,
  status varchar(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  k_threshold integer NOT NULL DEFAULT 5 CHECK (k_threshold >= 3),
  text_enabled boolean NOT NULL DEFAULT true,
  moderation_enabled boolean NOT NULL DEFAULT true,
  roster_hash varchar(64),
  roster_frozen_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_offering_idx ON campaigns(offering_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);

CREATE TABLE IF NOT EXISTS campaign_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  position integer NOT NULL,
  type varchar(10) NOT NULL CHECK (type IN ('star','numeric','single','multi','text')),
  prompt varchar(500) NOT NULL,
  required boolean NOT NULL DEFAULT true,
  min_value integer,
  max_value integer
);
CREATE INDEX IF NOT EXISTS campaign_questions_campaign_idx ON campaign_questions(campaign_id, position);

CREATE TABLE IF NOT EXISTS question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES campaign_questions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  label varchar(200) NOT NULL
);
CREATE INDEX IF NOT EXISTS question_options_question_idx ON question_options(question_id, position);

CREATE TABLE IF NOT EXISTS campaign_eligibility (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, student_id)
);

CREATE TABLE IF NOT EXISTS eligibility_credentials (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  llt_digest bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  issued_on date,
  blinded_hash bytea,
  PRIMARY KEY (campaign_id, student_id)
);

CREATE TABLE IF NOT EXISTS signing_keys (
  campaign_id uuid PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  key_id varchar(32) NOT NULL,
  public_key_der bytea NOT NULL,
  private_key_enc bytea,
  destroyed_at timestamptz
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash bytea PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action varchar(60) NOT NULL,
  target_type varchar(40),
  target_id varchar(64),
  at timestamptz NOT NULL DEFAULT now(),
  meta jsonb
);

-- ---------------------------------------------------------------------------
-- Anonymous / ballot side. No user_id, no timestamps on responses, random ids.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaign_public (
  campaign_id uuid PRIMARY KEY,
  course_id uuid NOT NULL,
  faculty_id uuid NOT NULL,
  semester_id uuid NOT NULL,
  status varchar(10) NOT NULL,
  opens_at_iso varchar(40) NOT NULL,
  closes_at_iso varchar(40) NOT NULL,
  k_threshold integer NOT NULL,
  text_enabled boolean NOT NULL,
  moderation_enabled boolean NOT NULL,
  key_id varchar(32) NOT NULL,
  public_key_der bytea NOT NULL
);

CREATE TABLE IF NOT EXISTS questions_public (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES campaign_public(campaign_id) ON DELETE CASCADE,
  position integer NOT NULL,
  type varchar(10) NOT NULL,
  prompt varchar(500) NOT NULL,
  required boolean NOT NULL,
  min_value integer,
  max_value integer
);
CREATE INDEX IF NOT EXISTS questions_public_campaign_idx ON questions_public(campaign_id, position);

CREATE TABLE IF NOT EXISTS options_public (
  id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions_public(id) ON DELETE CASCADE,
  position integer NOT NULL,
  label varchar(200) NOT NULL
);
CREATE INDEX IF NOT EXISTS options_public_question_idx ON options_public(question_id, position);

CREATE TABLE IF NOT EXISTS spent_tokens (
  campaign_id uuid NOT NULL REFERENCES campaign_public(campaign_id) ON DELETE CASCADE,
  token_hash bytea NOT NULL,
  PRIMARY KEY (campaign_id, token_hash)
);

CREATE TABLE IF NOT EXISTS responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaign_public(campaign_id) ON DELETE CASCADE,
  moderation varchar(8) NOT NULL DEFAULT 'ok' CHECK (moderation IN ('pending','ok','hidden'))
);
CREATE INDEX IF NOT EXISTS responses_campaign_idx ON responses(campaign_id);

CREATE TABLE IF NOT EXISTS response_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions_public(id) ON DELETE CASCADE,
  int_value integer,
  option_id uuid REFERENCES options_public(id) ON DELETE CASCADE,
  text_value text,
  CHECK (
    (CASE WHEN int_value IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN option_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN text_value IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);
CREATE INDEX IF NOT EXISTS response_answers_response_idx ON response_answers(response_id);
CREATE INDEX IF NOT EXISTS response_answers_question_idx ON response_answers(question_id);
