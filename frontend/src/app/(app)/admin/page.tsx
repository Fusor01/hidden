"use client";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { Card, Empty, ErrorState, Loading } from "@/components/ui";
import { useLoad } from "@/components/use-load";

interface Dash { students: number; faculty: number; courses: number; active_campaigns: number; completed_campaigns: number; draft_campaigns: number }
interface Rep { campaign_id: string; campaign: string; course: string; semester: string; faculty: string; released: boolean; n: number | null; overall_mean: number | null }

export default function AdminHome() {
  const d = useLoad(() => api<Dash>("/admin/dashboard"));
  const r = useLoad(() => api<Rep[]>("/admin/reports"));
  if (d.loading || r.loading) return <Loading />;
  if (d.error || r.error) return <ErrorState message={(d.error || r.error)!} retry={() => { d.reload(); r.reload(); }} />;
  const stats: [string, number][] = [["Students", d.data!.students], ["Faculty", d.data!.faculty], ["Courses", d.data!.courses],
    ["Active campaigns", d.data!.active_campaigns], ["Completed", d.data!.completed_campaigns], ["Drafts", d.data!.draft_campaigns]];
  const rows = (r.data ?? []).filter((x) => x.released && x.overall_mean !== null).map((x) => ({ label: `${x.course} · ${x.semester}`, mean: x.overall_mean }));
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Overview</h1>
        <Link href="/admin/campaigns" className="rounded bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">Manage campaigns</Link></div>
      <div className="grid gap-4 sm:grid-cols-3">{stats.map(([l, v]) => <Card key={l}><p className="text-xs uppercase tracking-wide text-ink-soft">{l}</p><p className="mt-1 text-3xl font-semibold">{v}</p></Card>)}</div>
      <Card><h2 className="font-semibold">Course comparison</h2>
        {rows.length ? <div className="mt-4 h-64"><ResponsiveContainer><BarChart data={rows}><CartesianGrid vertical={false} stroke="#E3E6EF" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis domain={[0, 5]} /><Tooltip />
          <Bar dataKey="mean" name="Overall rating" fill="#0D9488" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div> : <Empty title="No released results yet" body="Courses appear here once a closed campaign reaches its minimum group size." />}
      </Card>
    </div>
  );
}
