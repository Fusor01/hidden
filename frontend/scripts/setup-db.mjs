import { readFileSync } from "node:fs";
import pg from "pg";
import { dbConfig, loadEnv } from "./env.mjs";

loadEnv();
const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const client = new pg.Client(dbConfig());
await client.connect();
try {
  await client.query(sql);
  console.log("Schema applied. Tables are ready.");
} finally {
  await client.end();
}
