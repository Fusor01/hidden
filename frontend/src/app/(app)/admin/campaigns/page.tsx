"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminCampaign } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorState, Field, Loading, useToast } from "@/components/ui";
import { useLoad } from "@/components/use-load";

interface Offering { id: string; course: string; semester: string; faculty: string; section: string }
type Q = { type: string; prompt: string; required: boolean; min_value?: number; max_value?: number; options: string };

const blank = (): Q => ({ type: "star", prompt: "", required: true, options: "" });
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function Campaigns() {
  const toast = useToast();
  const list = useLoad(() => api<AdminCampaign[]>("/admin/campaigns"));
  const offs = useLoad(() => api<Offering[]>("/admin/offerings"));
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", description: "", offering_id: "", k: 5, text: true, mod: true,
    starts: local(new Date()), ends: local(new Date(Date.now() + 14 * 864e5)) });
  const [qs, setQs] = useState<Q[]>([{ ...blank(), prompt: "Overall teaching quality" }]);

  async function create() {
    setBusy(true);
    try {
      await api("/admin/campaigns", { method: "POST", json: {
        offering_id: f.offering_id, name: f.name, description: f.description || null, k_threshold: f.k,
        text_enabled: f.text, moderation_enabled: f.mod,
        starts_at: new Date(f.starts).toISOString(), ends_at: new Date(f.ends).toISOString(),
        questions: qs.map((q) => ({ type: q.type, prompt: q.prompt, required: q.required,
          min_value: q.type === "numeric" ? q.min_value ?? 0 : null, max_value: q.type === "numeric" ? q.max_value ?? 10 : null,
          options: q.type === "single" || q.type === "multi" ? q.options.split("\n").map((s) => s.trim()).filter(Boolean) : [] })) } });
      toast("ok", "Draft campaign created"); setCreating(false); list.reload();
    } catch (e) { toast("err", e instanceof Error ? e.message : "Could not create campaign"); } finally { setBusy(false); }
  }

  if (list.loading || offs.loading) return <Loading />;
  if (list.error) return <ErrorState message={list.error} retry={list.reload} />;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Campaigns</h1>
        <Button onClick={() => setCreating(!creating)}><Plus className="h-4 w-4" />New campaign</Button></div>

      {creating && (
        <Card className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <label className="block text-sm"><span className="mb-1 block font-medium">Course offering</span>
              <select className="w-full rounded border border-line bg-white px-3 py-2" value={f.offering_id} onChange={(e) => setF({ ...f, offering_id: e.target.value })}>
                <option value="">Select…</option>{(offs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.course} · {o.semester} · {o.faculty} ({o.section})</option>)}</select></label>
            <Field label="Opens" type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} />
            <Field label="Closes" type="datetime-local" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} />
            <Field label="Minimum group size (k)" type="number" min={3} value={f.k} onChange={(e) => setF({ ...f, k: Number(e.target.value) })} hint="Results are withheld below this many responses. Minimum 3." />
            <Field label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.text} onChange={(e) => setF({ ...f, text: e.target.checked })} />Allow free-text comments</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.mod} onChange={(e) => setF({ ...f, mod: e.target.checked })} />Moderate comments before faculty see them</label>
          </div>
          <div className="space-y-3">
            {qs.map((q, i) => (
              <div key={i} className="rounded border border-line p-3">
                <div className="grid gap-3 md:grid-cols-[140px_1fr_auto]">
                  <select className="rounded border border-line px-2 py-2 text-sm" value={q.type} onChange={(e) => setQs(qs.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
                    {["star", "numeric", "single", "multi", "text"].map((t) => <option key={t}>{t}</option>)}</select>
                  <input aria-label="Question" placeholder="Question text" className="rounded border border-line px-3 py-2 text-sm" value={q.prompt} onChange={(e) => setQs(qs.map((x, j) => j === i ? { ...x, prompt: e.target.value } : x))} />
                  <button aria-label="Remove question" onClick={() => setQs(qs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-ink-soft" /></button>
                </div>
                {(q.type === "single" || q.type === "multi") && <textarea placeholder="One option per line" rows={3} className="mt-2 w-full rounded border border-line px-3 py-2 text-sm" value={q.options} onChange={(e) => setQs(qs.map((x, j) => j === i ? { ...x, options: e.target.value } : x))} />}
                {q.type === "numeric" && <div className="mt-2 flex gap-2"><input type="number" placeholder="min" className="w-24 rounded border border-line px-2 py-1 text-sm" onChange={(e) => setQs(qs.map((x, j) => j === i ? { ...x, min_value: Number(e.target.value) } : x))} />
                  <input type="number" placeholder="max" className="w-24 rounded border border-line px-2 py-1 text-sm" onChange={(e) => setQs(qs.map((x, j) => j === i ? { ...x, max_value: Number(e.target.value) } : x))} /></div>}
                <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={q.required} onChange={(e) => setQs(qs.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} />Required</label>
              </div>))}
            <Button variant="secondary" onClick={() => setQs([...qs, blank()])}><Plus className="h-4 w-4" />Add question</Button>
          </div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button loading={busy} disabled={!f.name || !f.offering_id || qs.some((q) => !q.prompt)} onClick={create}>Create draft</Button></div>
        </Card>)}

      {(list.data ?? []).length === 0 ? <Empty title="No campaigns yet" body="Create a draft, set its roster, then open it." /> :
        list.data!.map((c) => (
          <Card key={c.id} className="flex items-center justify-between">
            <div><p className="font-medium text-navy-900">{c.name}</p><p className="text-sm text-ink-soft">{c.questions.length} questions · k = {c.k_threshold}</p></div>
            <div className="flex items-center gap-3"><Badge tone={c.status === "open" ? "teal" : c.status === "draft" ? "amber" : "gray"}>{c.status}</Badge>
              <Link href={`/admin/campaigns/${c.id}`} className="text-sm font-medium text-indigo-700 underline">Manage</Link></div>
          </Card>))}
    </div>
  );
}
