"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Results } from "@/lib/types";
import { Badge, Card } from "./ui";

export default function ResultsView({ r }: { r: Results }) {
  if (!r.released) return (
    <Card><p className="font-medium text-navy-900">Results are not available yet</p>
      <p className="mt-1 text-sm text-ink-soft">{r.reason === "campaign_not_closed"
        ? "Results are released only after the campaign closes, so nobody can watch individual responses arrive."
        : `Fewer than ${r.k} students responded, so results are withheld to protect anonymity.`}</p></Card>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-xs uppercase tracking-wide text-ink-soft">Responses</p><p className="mt-1 text-3xl font-semibold">{r.n}</p></Card>
        <Card><p className="text-xs uppercase tracking-wide text-ink-soft">Overall rating</p><p className="mt-1 text-3xl font-semibold">{r.overall_mean ?? "–"}<span className="text-base text-ink-soft"> / 5</span></p></Card>
        <Card><p className="text-xs uppercase tracking-wide text-ink-soft">Minimum group size</p><p className="mt-1 text-3xl font-semibold">{r.k}</p></Card>
      </div>
      {r.questions.map((q) => (
        <Card key={q.question_id}>
          <div className="flex items-start justify-between gap-3"><h3 className="font-medium text-navy-900">{q.prompt}</h3>
            {q.suppressed ? <Badge tone="amber">Withheld</Badge> : q.mean !== undefined ? <Badge tone="indigo">Mean {q.mean}</Badge> : null}</div>
          {q.suppressed && <p className="mt-2 text-sm text-ink-soft">Too few answers to show this safely.</p>}
          {q.distribution && <div className="mt-4 h-48"><ResponsiveContainer><BarChart data={Object.entries(q.distribution).map(([k, v]) => ({ k, v }))}>
            <CartesianGrid vertical={false} stroke="#E3E6EF" /><XAxis dataKey="k" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="v" name="Responses" fill="#4F46E5" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>}
          {q.options && <div className="mt-4 h-48"><ResponsiveContainer><BarChart data={q.options} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid horizontal={false} stroke="#E3E6EF" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="label" width={120} /><Tooltip /><Bar dataKey="count" name="Responses" fill="#0D9488" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div>}
          {q.texts && <ul className="mt-3 space-y-2">{q.texts.map((t, i) => <li key={i} className="rounded border border-line bg-paper p-3 text-sm">{t}</li>)}</ul>}
        </Card>
      ))}
    </div>
  );
}
