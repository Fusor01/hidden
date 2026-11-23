-- H.I.D.D.E.N. demo data for a single Neon Postgres database.
-- Paste into the Neon SQL editor and run. Requires db/schema.sql to be applied first.
-- Re-runnable: all inserts use ON CONFLICT DO NOTHING.
--
-- Demo logins (passwords are Argon2id hashes generated with the app's settings):
--   admin@college.edu     / AdminDemo123!
--   faculty@college.edu   / FacultyDemo123!
--   student1@college.edu  / StudentDemo123!
--   student2@college.edu  / StudentDemo123!
--   student3@college.edu  / StudentDemo123!
--   student4@college.edu  / StudentDemo123!
--   student5@college.edu  / StudentDemo123!  (through student10@college.edu)
--
-- User IDs are looked up by email, so this works even if those accounts already exist.
-- The campaign is created as a draft. After running this, log in as admin and open it
-- from Admin > Campaigns so the roster is frozen and the signing key is generated.

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
INSERT INTO users (email, password_hash, role) VALUES
  ('admin@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$91yqSBdjHFl0sZ02srSjQQ$6Ud9uiL5LNVjJ3CbbxiW682jeGyBpIhsFwVfOP4BOm0', 'admin'),
  ('faculty@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$EuixXCXNyDQHfIDIfTBozQ$Ucy4AsWSw5z3udZVLjOEgMLLuSLMdQc2zu1uEp0QhKg', 'faculty'),
  ('student1@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$cS2GhktcbnOBdMff+DT9UQ$PwJH+qG/y5cEo9lX7uuX5nHhkntuHBcMdcCUUcfKxDU', 'student'),
  ('student2@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$PQsq69BDk+sgRbYlrx8LrA$Y3YodvWxIE5hUwxZnlS59KQY3UodUbl11CQ7+VLjq2o', 'student'),
  ('student3@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$+3st8xq1AvyL+8WcmLLnBg$e0Ne99V83cJEyW5VLBH2uSfCef6mSPK7t0nPQVOSxVI', 'student'),
  ('student4@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$hXTvcexmXksnSyxRNv92dQ$iGlBmMoTJju2Lnq4ot8/OzIprL2t1O8nLn0S/vE8LGU', 'student'),
  ('student5@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$kNqjPDZfx0wskwKkvy+BFg$kpU4bQcLWM8D/PQo5UI8q74iUcsSxZqxbuR6t5IZfYI', 'student'),
  ('student6@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$bScTW1gi4VGChuAbrjv37w$ezZ+HnTu1+cfTXIL0KOlyajpACbQ4AZ6CF1RlYGYjZo', 'student'),
  ('student7@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$F6AiLGWur38RrrTDQPtkbw$icPZAg0tcAmAX+Ir4TRaaMD5GDwTca44PUn9sCr4QvY', 'student'),
  ('student8@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$5Rt3WhZW3pog14098ghTSQ$Ea1fLGlw8HH/5aNhX/CibTokSOotO5hIQbSoNG95XLg', 'student'),
  ('student9@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$ydglWM+4RoJZWw6ktpzWVw$c2adcQgDLW0PnnquSdVB4NnXCZ+cudbGIhiSDoAy+ig', 'student'),
  ('student10@college.edu',
   '$argon2id$v=19$m=65536,t=3,p=4$q03CJTp7Ru1PjCzt6+iBZw$vOoGLFpfyHuvPDlqW2joxWivTWr8FXT4gLQteRF1dtI', 'student')
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = true,
    failed_logins = 0,
    locked_until = NULL;

INSERT INTO faculty (user_id, employee_no, name, department)
SELECT id, 'FAC001', 'Dr. Ademo Faculty', 'Computer Science'
FROM users WHERE email = 'faculty@college.edu'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO students (user_id, roll_no, name, department, batch_year)
SELECT id,
       CASE email
         WHEN 'student1@college.edu' THEN '2024001'
         WHEN 'student2@college.edu' THEN '2024002'
         WHEN 'student3@college.edu' THEN '2024003'
         WHEN 'student4@college.edu' THEN '2024004'
         WHEN 'student5@college.edu' THEN '2024005'
         WHEN 'student6@college.edu' THEN '2024006'
         WHEN 'student7@college.edu' THEN '2024007'
         WHEN 'student8@college.edu' THEN '2024008'
         WHEN 'student9@college.edu' THEN '2024009'
         WHEN 'student10@college.edu' THEN '2024010'
       END,
       CASE email
         WHEN 'student1@college.edu' THEN 'Alice Student'
         WHEN 'student2@college.edu' THEN 'Bob Student'
         WHEN 'student3@college.edu' THEN 'Carol Student'
         WHEN 'student4@college.edu' THEN 'Dave Student'
         WHEN 'student5@college.edu' THEN 'Eve Student'
         WHEN 'student6@college.edu' THEN 'Frank Student'
         WHEN 'student7@college.edu' THEN 'Grace Student'
         WHEN 'student8@college.edu' THEN 'Heidi Student'
         WHEN 'student9@college.edu' THEN 'Ivan Student'
         WHEN 'student10@college.edu' THEN 'Judy Student'
       END,
       'Computer Science', 2026
FROM users
WHERE email IN ('student1@college.edu','student2@college.edu','student3@college.edu','student4@college.edu',
                'student5@college.edu','student6@college.edu','student7@college.edu','student8@college.edu',
                'student9@college.edu','student10@college.edu')
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Academics
-- ---------------------------------------------------------------------------
INSERT INTO semesters (id, name, start_date, end_date) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'Fall 2026', DATE '2026-08-01', DATE '2026-12-20')
ON CONFLICT (name) DO NOTHING;

INSERT INTO courses (id, code, title, department) VALUES
  ('c0000000-0000-4000-8000-000000000002', 'CS101', 'Introduction to Computer Science', 'Computer Science')
ON CONFLICT (code) DO NOTHING;

INSERT INTO course_offerings (id, course_id, semester_id, faculty_id, section)
SELECT 'c0000000-0000-4000-8000-000000000003'::uuid,
       (SELECT id FROM courses WHERE code = 'CS101'),
       (SELECT id FROM semesters WHERE name = 'Fall 2026'),
       (SELECT id FROM users WHERE email = 'faculty@college.edu'),
       'A'
ON CONFLICT DO NOTHING;

-- Resolve the offering by its natural key so it works if the rows already existed.
INSERT INTO enrollments (student_id, offering_id)
SELECT u.id,
       (SELECT o.id
          FROM course_offerings o
          JOIN courses c ON c.id = o.course_id
          JOIN semesters s ON s.id = o.semester_id
          JOIN faculty f ON f.user_id = o.faculty_id
         WHERE c.code = 'CS101' AND s.name = 'Fall 2026'
           AND f.employee_no = 'FAC001' AND o.section = 'A')
FROM users u
WHERE u.email IN ('student1@college.edu','student2@college.edu','student3@college.edu','student4@college.edu')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Draft campaign with questions
-- ---------------------------------------------------------------------------
INSERT INTO campaigns
  (id, offering_id, name, description, status, starts_at, ends_at,
   k_threshold, text_enabled, moderation_enabled, created_by)
SELECT 'd0000000-0000-4000-8000-000000000001'::uuid,
       (SELECT o.id
          FROM course_offerings o
          JOIN courses c ON c.id = o.course_id
          JOIN semesters s ON s.id = o.semester_id
          JOIN faculty f ON f.user_id = o.faculty_id
         WHERE c.code = 'CS101' AND s.name = 'Fall 2026'
           AND f.employee_no = 'FAC001' AND o.section = 'A'),
       'Demo Course Feedback',
       'Sample feedback campaign generated by db/demo-data.sql.',
       'draft', now(), now() + INTERVAL '30 days',
       3, true, true,
       (SELECT id FROM users WHERE email = 'admin@college.edu')
ON CONFLICT (id) DO NOTHING;

INSERT INTO campaign_questions (id, campaign_id, position, type, prompt, required, min_value, max_value) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   0, 'star', 'How would you rate the overall course quality?', true, 1, 5),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   1, 'single', 'Was the workload appropriate?', true, NULL, NULL),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001',
   2, 'numeric', 'About how many hours per week did you spend on this course?', false, 1, 40),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001',
   3, 'text', 'What could be improved?', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO question_options (id, question_id, position, label) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 0, 'Too low'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 1, 'About right'),
  ('f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002', 2, 'Too high')
ON CONFLICT (id) DO NOTHING;

INSERT INTO campaign_eligibility (campaign_id, student_id)
SELECT 'd0000000-0000-4000-8000-000000000001'::uuid, id
FROM users WHERE email IN ('student1@college.edu','student2@college.edu','student3@college.edu','student4@college.edu',
                'student5@college.edu','student6@college.edu','student7@college.edu','student8@college.edu',
                'student9@college.edu','student10@college.edu')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Optional cleanup (uncomment to remove ALL demo data and start over)
-- ---------------------------------------------------------------------------
-- DELETE FROM campaign_public WHERE campaign_id = 'd0000000-0000-4000-8000-000000000001';
-- DELETE FROM campaigns WHERE id = 'd0000000-0000-4000-8000-000000000001';
-- DELETE FROM enrollments WHERE offering_id IN (
--   SELECT o.id FROM course_offerings o
--   JOIN courses c ON c.id = o.course_id
--   JOIN semesters s ON s.id = o.semester_id
--   WHERE c.code = 'CS101' AND s.name = 'Fall 2026');
-- DELETE FROM course_offerings WHERE id IN (
--   SELECT o.id FROM course_offerings o
--   JOIN courses c ON c.id = o.course_id
--   JOIN semesters s ON s.id = o.semester_id
--   WHERE c.code = 'CS101' AND s.name = 'Fall 2026');
-- DELETE FROM courses WHERE code = 'CS101';
-- DELETE FROM semesters WHERE name = 'Fall 2026';
-- DELETE FROM faculty WHERE user_id IN (SELECT id FROM users WHERE email = 'faculty@college.edu');
-- DELETE FROM students WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'student%@college.edu');
-- DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@college.edu');
-- DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email LIKE '%@college.edu');
-- DELETE FROM users WHERE email IN (
--   'admin@college.edu','faculty@college.edu',
--   'student1@college.edu','student2@college.edu','student3@college.edu','student4@college.edu',
--   'student5@college.edu','student6@college.edu','student7@college.edu','student8@college.edu',
--   'student9@college.edu','student10@college.edu');
