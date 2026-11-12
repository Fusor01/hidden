"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { api, ApiError, ballot } from "@/lib/api";
import { importPublicKey, prepare, unblind } from "@/lib/blind";
import { loadLocal, saveLocal, type LocalCred } from "@/lib/local-state";
import type { CampaignDetail } from "@/lib/types";
import { Button, Card, ErrorState, Loading, cx, useToast } from "@/components/ui";
import { useLoad } from "@/components/use-load";

type Ans = { value?: number; option_ids?: string[]; text?: string };
type SubmissionAnswer =
  | { question_id: string; text: string }
  | { question_id: string; option_ids: string[] }
  | { question_id: string; value: number };

export default function Submit() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data: c, error, loading } = useLoad(() => api<CampaignDetail>(`/student/campaigns/${id}`), [id]);
  const [local, setLocal] = useState<LocalCred | null>(null);
  const [ans, setAns] = useState<Record<string, Ans>>({});
  const [delay, setDelay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => { void loadLocal(id).then(setLocal); }, [id]);
  if (loading || !local) return <Loading />;
  if (error || !c) return <ErrorState message={error ?? "This campaign is not available."} />;

  if (local.submitted) return (
    <Card className="mx-auto max-w-lg text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-teal-600" />
      <h1 className="mt-3 text-xl font-semibold">Thank you. Your feedback was submitted.</h1>
      <p className="mt-2 text-sm text-ink-soft">It cannot be linked to you. You can close this page.</p>
      <Link href="/student" className="mt-5 inline-block text-sm font-medium text-indigo-700 underline">Back to your feedback</Link>
    </Card>
  );

  const set = (qid: string, patch: Ans) => setAns((a) => ({ ...a, [qid]: { ...a[qid], ...patch } }));

  async function send() {
    if (!c) return;
    setFormErr(null);
    const answers = c.questions.flatMap<SubmissionAnswer>((q): SubmissionAnswer[] => {
      const a = ans[q.id];
      if (q.type === "text") {
        return a?.text?.trim()
          ? [{ question_id: q.id, text: a.text.trim() }]
          : [];
      }
      if (q.type === "single" || q.type === "multi") {
        return a?.option_ids?.length
          ? [{ question_id: q.id, option_ids: a.option_ids }]
          : [];
      }
      return a?.value !== undefined
        ? [{ question_id: q.id, value: a.value }]
        : [];
    });
    const missing = c.questions.filter((q) => q.required && !answers.some((x) => x.question_id === q.id));
    if (missing.length) { setFormErr(`Please answer: ${missing.map((q) => q.prompt).join("; ")}`); return; }

    setBusy(true);
    try {
      const pub = await importPublicKey(c.public_key);
      let cur: LocalCred = local ?? {};
      // 1. Obtain the credential. Prepared state is saved BEFORE the request so a retry reuses it.
      if (!cur.signature) {
        if (!cur.prepared) { cur = { ...cur, prepared: await prepare(c.id, pub) }; await saveLocal(c.id, cur); }
        setMsg("Getting your anonymous pass…");
        const r = await api<{ blind_sig: string }>(`/student/campaigns/${c.id}/credential`, { method: "POST", json: { blinded_msg: cur.prepared!.blindedMsg } });
        cur = { ...cur, signature: await unblind(c.id, pub, cur.prepared!, r.blind_sig) };
        await saveLocal(c.id, cur); setLocal(cur);
      }
      // 2. Optional random wait so submission time is less tied to the moment you claimed the pass.
      if (delay) { const s = 20 + Math.floor(Math.random() * 100); for (let i = s; i > 0; i--) { setMsg(`Submitting in ${i}s. Keep this page open.`); await new Promise((r) => setTimeout(r, 1000)); } }
      // 3. Submit to the ballot service. No cookies. No identity.
      setMsg("Submitting…");
      try {
        await ballot(`/campaigns/${c.id}/submit`, { key_id: c.key_id, token: cur.prepared!.token, signature: cur.signature, answers });
      } catch (e) { if (!(e instanceof ApiError && e.status === 409)) throw e; }
      const done = { ...cur, submitted: true };
      await saveLocal(c.id, done); setLocal(done);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : "Submission failed");
      setFormErr(e instanceof ApiError && e.status === 409 && !local?.signature
        ? "A pass was already issued to you for this campaign, but this browser no longer holds it. It cannot be recovered."
        : e instanceof Error ? e.message : "Submission failed");
    } finally { setBusy(false); setMsg(null); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div><h1 className="text-2xl font-semibold">{c.name}</h1>
        {c.description && <p className="mt-1 text-sm text-ink-soft">{c.description}</p>}
        <p className="mt-3 rounded border border-teal-500/30 bg-teal-50 p-3 text-sm text-teal-700">Your answers are submitted separately from your sign-in. Avoid details in comments that could identify you.</p></div>
      {c.questions.map((q) => (
        <Card key={q.id}>
          <p className="font-medium text-navy-900">{q.prompt}{!q.required && <span className="ml-2 text-xs font-normal text-ink-soft">optional</span>}</p>
          <div className="mt-3">
            {q.type === "star" && <div className="flex gap-1" role="radiogroup" aria-label={q.prompt}>{[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={ans[q.id]?.value === n} aria-label={`${n} stars`} onClick={() => set(q.id, { value: n })}>
                <Star className={cx("h-7 w-7", (ans[q.id]?.value ?? 0) >= n ? "fill-indigo-600 text-indigo-600" : "text-line")} /></button>))}</div>}
            {q.type === "numeric" && <input type="number" min={q.min_value ?? undefined} max={q.max_value ?? undefined} className="w-32 rounded border border-line px-3 py-2 text-sm" aria-label={q.prompt} onChange={(e) => set(q.id, { value: Number(e.target.value) })} />}
            {(q.type === "single" || q.type === "multi") && <div className="space-y-2">{q.options.map((o) => {
              const sel = ans[q.id]?.option_ids ?? [];
              return <label key={o.id} className="flex items-center gap-2 text-sm"><input type={q.type === "single" ? "radio" : "checkbox"} name={q.id} checked={sel.includes(o.id)}
                onChange={(e) => set(q.id, { option_ids: q.type === "single" ? [o.id] : e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id) })} />{o.label}</label>;
            })}</div>}
            {q.type === "text" && <textarea rows={4} maxLength={2000} className="w-full rounded border border-line px-3 py-2 text-sm" aria-label={q.prompt} onChange={(e) => set(q.id, { text: e.target.value })} />}
          </div>
        </Card>
      ))}
      {formErr && <ErrorState message={formErr} />}
      <label className="flex items-start gap-2 text-sm text-ink-soft"><input type="checkbox" className="mt-1" checked={delay} onChange={(e) => setDelay(e.target.checked)} />
        Wait a random 20–120 seconds before submitting (recommended: makes it harder to match your submission to when you signed in).</label>
      <Button onClick={send} loading={busy} className="w-full md:w-auto">{msg ?? "Submit feedback"}</Button>
    </div>
  );
}
