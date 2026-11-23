import { all, one, scalar } from "./db";
import type { QuestionResult, Results } from "@/lib/types";

type AnswerRow = {
  response_id: string;
  int_value: number | null;
  option_id: string | null;
  text_value: string | null;
  moderation: string;
};

type PublicQuestion = {
  id: string;
  type: "star" | "numeric" | "single" | "multi" | "text";
  prompt: string;
  min_value: number | null;
  max_value: number | null;
};

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The only code path that turns raw ballots into numbers. Suppression rules live here. */
export async function campaignResults(campaignId: string): Promise<Results> {
  const cp = await one<{ status: string; k_threshold: number }>(
    "SELECT status, k_threshold FROM campaign_public WHERE campaign_id = $1",
    [campaignId]
  );
  if (!cp || cp.status !== "closed") return { released: false, reason: "campaign_not_closed" };
  const k = cp.k_threshold;
  const n = await scalar<number>("SELECT count(*)::int AS n FROM responses WHERE campaign_id = $1", [campaignId]);
  if (n < k) return { released: false, reason: "below_threshold", k };

  const questions = await all<PublicQuestion>(
    "SELECT id, type, prompt, min_value, max_value FROM questions_public WHERE campaign_id = $1 ORDER BY position",
    [campaignId]
  );
  const out: QuestionResult[] = [];

  for (const q of questions) {
    const rows = await all<AnswerRow>(
      `SELECT ra.response_id::text, ra.int_value, ra.option_id::text, ra.text_value, r.moderation
         FROM response_answers ra
         JOIN responses r ON r.id = ra.response_id
        WHERE ra.question_id = $1 AND r.campaign_id = $2`,
      [q.id, campaignId]
    );
    const item: QuestionResult = {
      question_id: q.id,
      prompt: q.prompt,
      type: q.type,
      suppressed: false,
      n: 0,
    };

    if (q.type === "text") {
      const texts = rows.filter((r) => r.moderation === "ok" && r.text_value).map((r) => r.text_value as string);
      if (texts.length < k) {
        out.push({ ...item, suppressed: true, n: 0 });
      } else {
        out.push({ ...item, n: texts.length, texts: shuffle(texts) });
      }
      continue;
    }

    const answered = new Set(rows.map((r) => r.response_id)).size;
    if (answered < k) {
      out.push({ ...item, suppressed: true, n: 0 });
      continue;
    }

    if (q.type === "star" || q.type === "numeric") {
      const values = rows.map((r) => r.int_value ?? 0);
      const distribution: Record<string, number> = {};
      const lo = q.type === "star" ? 1 : q.min_value ?? 0;
      const hi = q.type === "star" ? 5 : q.max_value ?? lo;
      for (let v = lo; v <= hi; v++) distribution[String(v)] = values.filter((x) => x === v).length;
      out.push({
        ...item,
        n: answered,
        mean: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
        distribution,
      });
    } else {
      const counts = new Map<string, number>();
      for (const r of rows) if (r.option_id) counts.set(r.option_id, (counts.get(r.option_id) ?? 0) + 1);
      const options = await all<{ id: string; label: string }>(
        "SELECT id::text, label FROM options_public WHERE question_id = $1 ORDER BY position",
        [q.id]
      );
      out.push({
        ...item,
        n: answered,
        options: options.map((o) => ({ label: o.label, count: counts.get(o.id) ?? 0 })),
      });
    }
  }

  const means = out.filter((q) => q.type === "star" && !q.suppressed && q.mean !== undefined).map((q) => q.mean as number);
  return {
    released: true,
    n,
    k,
    overall_mean: means.length ? Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 100) / 100 : null,
    questions: out,
  };
}
