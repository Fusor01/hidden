// Presentation demo driver.
//
// Creates a fresh campaign as admin, then signs in as each demo student in a real
// browser, answers the questions, submits, and finally closes the campaign so the
// anonymous results appear. Run with:  npm run demo
//
// Useful environment variables:
//   DEMO_BASE_URL=https://hidden-sigma-ten.vercel.app
//   DEMO_HEADLESS=1        hide the browser window
//   DEMO_SLOWMO=1500        slow down Playwright actions (ms) so the audience can follow
//   DEMO_PAUSE=600         pause between students (ms)
//   DEMO_HOLD=0            close the browser as soon as the demo finishes

import { chromium } from "playwright";

const base = (process.env.DEMO_BASE_URL ?? "https://hidden-sigma-ten.vercel.app").replace(/\/$/, "");
const headless = /^(1|true|yes)$/i.test(process.env.DEMO_HEADLESS ?? "");
// Deliberately slow defaults so a live audience can follow every click.
const slowMo = Number(process.env.DEMO_SLOWMO ?? 400);
const pause = Number(process.env.DEMO_PAUSE ?? 1500);
const hold = !/^(0|false|no)$/i.test(process.env.DEMO_HOLD ?? "1");
const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@college.edu";
const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? "AdminDemo123!";
const studentPassword = process.env.DEMO_STUDENT_PASSWORD ?? "StudentDemo123!";
const studentEmails = Array.from(
  { length: Number(process.env.DEMO_COUNT ?? 10) },
  (_, i) => `student${i + 1}@college.edu`
);

const api = (context, path, options = {}) =>
  context.request.fetch(`${base}/api/v1${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Origin: base, ...(options.headers ?? {}) },
  });

async function json(response, label) {
  const body = await response.text();
  let parsed;
  try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { detail: body }; }
  if (!response.ok()) {
    throw new Error(`${label} failed (${response.status()}): ${parsed?.detail ?? body}`);
  }
  return parsed;
}

const QUESTIONS = [
  { type: "star", prompt: "How would you rate the overall teaching quality?", required: true, options: [] },
  { type: "single", prompt: "Was the workload appropriate?", required: true, options: ["Too low", "About right", "Too high"] },
  { type: "numeric", prompt: "About how many hours per week did you spend on this course?", required: true, min_value: 1, max_value: 40, options: [] },
  { type: "multi", prompt: "Which resources helped most?", required: true, options: ["Lectures", "Notes", "Practice problems", "Discussions"] },
  { type: "text", prompt: "What could be improved?", required: true, options: [] },
];

const COMMENTS = [
  "Clear explanations and helpful examples throughout the semester.",
  "More practice problems before the exams would help.",
  "The project work was the best part of the course.",
  "I would like more time for questions at the end of each class.",
  "The weekly summaries were very useful, please keep them.",
  "A few topics felt rushed towards the end.",
  "Interactive sessions made difficult ideas much easier to understand.",
  "More feedback on assignments would be appreciated.",
  "Good balance of theory and practical work.",
  "The reading list was excellent and well chosen.",
];

async function setup(context) {
  console.log("Setting up the presentation campaign…");
  await json(await api(context, "/auth/login", {
    method: "POST", data: { email: adminEmail, password: adminPassword },
  }), "Admin sign-in");

  const offerings = await json(await api(context, "/admin/offerings"), "List offerings");
  if (!offerings.length) throw new Error("No course offering exists. Run npm run db:demo first.");
  const offeringId = offerings[0].id;

  const people = await json(await api(context, "/admin/students"), "List students");
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p.id]));
  const studentIds = studentEmails.map((email) => {
    const id = byEmail.get(email.toLowerCase());
    if (!id) throw new Error(`Missing student ${email}. Run npm run db:demo first.`);
    return id;
  });

  const stamp = new Date().toLocaleString();
  const campaign = await json(await api(context, "/admin/campaigns", {
    method: "POST",
    data: {
      offering_id: offeringId,
      name: `Live Presentation Feedback — ${stamp}`,
      description: "Automated demonstration campaign created by scripts/demo.mjs.",
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      k_threshold: 3,
      text_enabled: true,
      // Set false so approved-by-default comments appear in the final results immediately.
      moderation_enabled: false,
      questions: QUESTIONS,
    },
  }), "Create campaign");

  await json(await api(context, `/admin/campaigns/${campaign.id}/eligibility`, {
    method: "POST", data: { mode: "explicit", student_ids: studentIds },
  }), "Set roster");
  await json(await api(context, `/admin/campaigns/${campaign.id}/open`, {
    method: "POST", data: {},
  }), "Open campaign");

  console.log(`Campaign ready: ${campaign.name}\n`);
  return campaign.id;
}

async function signIn(page, email, password) {
  await page.goto(`${base}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/student$|\/admin$|\/faculty$/);
}

async function signOut(page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login$/);
}

async function answerQuestions(page, index) {
  const stars = page.locator('button[aria-label$=" stars"]');
  if (await stars.count()) await stars.nth(index % 5).click();

  const numbers = page.locator('input[type="number"]');
  for (let i = 0; i < await numbers.count(); i++) {
    await numbers.nth(i).fill(String(6 + ((index + i) % 15)));
  }

  const radioGroups = await page.locator("input[type=radio][name]").evaluateAll(
    (els) => [...new Set(els.map((el) => el.name))]
  );
  for (const name of radioGroups) {
    await page.locator(`input[type=radio][name="${name}"]`).nth(index % 3).check();
  }

  const checkGroups = await page.locator("input[type=checkbox][name]").evaluateAll(
    (els) => [...new Set(els.map((el) => el.name))]
  );
  for (const name of checkGroups) {
    await page.locator(`input[type=checkbox][name="${name}"]`).nth(index % 2).check();
  }

  const textareas = page.locator("textarea");
  for (let i = 0; i < await textareas.count(); i++) {
    await textareas.nth(i).fill(COMMENTS[index % COMMENTS.length]);
  }
}

async function submitFeedback(page, campaignId, index, email) {
  console.log(`  ${String(index + 1).padStart(2)}/${studentEmails.length} ${email} — submitting…`);
  await page.goto(`${base}/student/campaign/${campaignId}`);
  await page.getByRole("button", { name: "Submit feedback" }).waitFor();
  await answerQuestions(page, index);
  await page.getByRole("button", { name: "Submit feedback" }).click();
  await page.getByText("Thank you. Your feedback was submitted.").waitFor({ timeout: 30_000 });
  if (pause) await page.waitForTimeout(pause);
}

async function main() {
  const browser = await chromium.launch({ headless, slowMo });
  try {
    const context = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const campaignId = await setup(context);

    for (let i = 0; i < studentEmails.length; i++) {
      await signIn(page, studentEmails[i], studentPassword);
      await submitFeedback(page, campaignId, i, studentEmails[i]);
      await signOut(page);
    }

    console.log(`\nAll ${studentEmails.length} students submitted. Closing campaign and revealing results…`);
    await signIn(page, adminEmail, adminPassword);
    await json(await api(context, `/admin/campaigns/${campaignId}/close`, {
      method: "POST", data: {},
    }), "Close campaign");
    await page.goto(`${base}/admin/campaigns/${campaignId}`);
    await page.getByText("Overall rating").waitFor({ timeout: 30_000 });

    console.log("\nDemo complete — the browser is on the anonymous results page.");
    if (hold) {
      process.stdout.write("Press Enter to close the browser… ");
      await new Promise((resolve) => process.stdin.once("data", resolve));
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("\nDemo failed:", e.message);
  process.exitCode = 1;
});
