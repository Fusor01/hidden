import { existsSync, readFileSync } from "node:fs";

// Minimal .env loader so `npm run db:setup` works after `vercel env pull`.
// Values already present in the environment always win.
export function loadEnv(files = [".env.local", ".env"]) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const key = line.slice(0, i).trim();
      let value = line.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function dbConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DATABASE_URL (or run `vercel env pull .env.local`) first");
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  return { connectionString, ssl: local ? undefined : { rejectUnauthorized: false } };
}
