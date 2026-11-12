"use client";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { Badge, Card, Empty, ErrorState, Loading } from "@/components/ui";
import { useLoad } from "@/components/use-load";

interface Row { campaign_id: string; campaign: string; course: string; semester: string; released: boolean; n: number | null; overall_mean: number | null }
interface Course { campaign_id: string; name: string; course_code: string; course_title: string; semester: string; status: string }

export default function FacultyHome() {
  const dash = useLoad(() => api<{ campaigns: number; open: number; closed: number }>("/faculty/dashboard"));
  const courses = useLoad(() => api<Course[]>("/faculty/courses"));
  const an = useLoad(() => api<Row[]>("/faculty/analytics"));
  if (dash.loading || courses.loading || an.loading) return <Loading />;
  if (dash.error || courses.error || an.error) return <ErrorState message={(dash.error || courses.error || an.error)!} retry={() => { dash.reload(); courses.reload(); an.reload(); }} />;
  const trend = (an.data ?? []).filter((r) => r.released && r.overall_mean !== null).map((r) => ({ label: `${r.course} · ${r.semester}`, mean: r.overall_mean }));
  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-semibold">Your feedback results</h1>
        <p className="mt-1 text-sm text-ink-soft">Aggregates only, released after each campaign closes and only with enough responses.</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        {([["Campaigns", dash.data?.campaigns], ["Open", dash.data?.open], ["Closed", dash.data?.closed]] as const).map(([l, v]) =>
          <Card key={l}><p className="text-xs uppercase tracking-wide text-ink-soft">{l}</p><p className="mt-1 text-3xl font-semibold">{v}</p></Card>)}
      </div>
      <Card>
        <h2 className="font-semibold">Rating by course and semester</h2>
        {trend.length ? <div className="mt-4 h-64"><ResponsiveContainer><BarChart data={trend}><CartesianGrid vertical={false} stroke="#E3E6EF" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis domain={[0, 5]} /><Tooltip /><Bar dataKey="mean" name="Overall rating" fill="#4F46E5" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
          : <p className="mt-2 text-sm text-ink-soft">No released results yet.</p>}
      </Card>
      <section className="space-y-3"><h2 className="font-semibold">Campaigns</h2>
        {(courses.data ?? []).length === 0 ? <Empty title="No campaigns yet" /> : courses.data!.map((c) => (
          <Card key={c.campaign_id} className="flex items-center justify-between">
            <div><p className="font-medium text-navy-900">{c.name}</p><p className="text-sm text-ink-soft">{c.course_code} · {c.course_title} · {c.semester}</p></div>
            <div className="flex items-center gap-3"><Badge tone={c.status === "open" ? "teal" : "gray"}>{c.status}</Badge>
              <Link href={`/faculty/results/${c.campaign_id}`} className="text-sm font-medium text-indigo-700 underline">View</Link></div>
          </Card>))}
      </section>
    </div>
  );
}
