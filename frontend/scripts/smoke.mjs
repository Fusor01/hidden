const base = (process.argv[2] ?? "https://hidden-sigma-ten.vercel.app").replace(/\/$/, "");

const checks = [
  ["/api/v1/health", 200],
  ["/api/v1/auth/me", 401],
  ["/api/v1/auth/definitely-not-a-route", 404],
  ["/api/v1/campaigns/definitely-not-a-route", 404],
];

let failed = false;
for (const [path, expected] of checks) {
  const res = await fetch(base + path);
  const body = await res.text();
  const pass = res.status === expected && !res.headers.get("x-vercel-error");
  console.log(`${pass ? "PASS" : "FAIL"} ${path} -> ${res.status} (expected ${expected}) ${body.slice(0, 120)}`);
  if (!pass) failed = true;
}
process.exit(failed ? 1 : 0);
