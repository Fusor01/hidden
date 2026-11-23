import pg from "pg";
import { hash } from "@node-rs/argon2";
import { parseArgs } from "./args.mjs";
import { dbConfig, loadEnv } from "./env.mjs";

loadEnv();

const args = parseArgs(process.argv.slice(2));

const adminEmail = (args["admin-email"] ?? "admin@college.edu").trim().toLowerCase();
const adminPassword = args["admin-password"] ?? "ChangeMe123!";
const studentEmail = (args["student-email"] ?? "student@college.edu").trim().toLowerCase();
const studentPassword = args["student-password"] ?? "StudentPass123!";
const rollNo = args["roll-no"] ?? "STU001";
const name = args["student-name"] ?? "Test Student";
const department = args.department ?? "Computer Science";
const batchYear = Number(args["batch-year"] ?? 2026);

if (adminPassword.length < 12 || studentPassword.length < 12) {
  throw new Error("Passwords must be at least 12 characters");
}

// 2 = Argon2id
const opts = { algorithm: 2, memoryCost: 65_536, timeCost: 3, parallelism: 4, outputLen: 32 };
const client = new pg.Client(dbConfig());
await client.connect();
try {
  await client.query("BEGIN");
  const admin = await client.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', is_active = true, failed_logins = 0, locked_until = NULL
     RETURNING id::text AS id`,
    [adminEmail, await hash(adminPassword, opts)]
  );
  const student = await client.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'student')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'student', is_active = true, failed_logins = 0, locked_until = NULL
     RETURNING id::text AS id`,
    [studentEmail, await hash(studentPassword, opts)]
  );
  const sid = student.rows[0].id;
  await client.query(
    `INSERT INTO students (user_id, roll_no, name, department, batch_year)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET roll_no = EXCLUDED.roll_no, name = EXCLUDED.name,
       department = EXCLUDED.department, batch_year = EXCLUDED.batch_year`,
    [sid, rollNo, name, department, batchYear]
  );
  await client.query("COMMIT");
  console.log(`Admin:   ${adminEmail}`);
  console.log(`Student: ${studentEmail} (${rollNo})`);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}
