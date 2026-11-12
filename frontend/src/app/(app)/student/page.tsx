"use client";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import type { StudentCampaign } from "@/lib/types";
import { Badge, Card, Empty, ErrorState, Loading } from "@/components/ui";
import { useLoad } from "@/components/use-load";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Row({ c }: { c: StudentCampaign }) {
  return (
    <Card className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate font-medium text-navy-900">{c.name}</p>
        <p className="text-sm text-ink-soft">{c.course_code} · {c.course_title} · {c.faculty}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft"><CalendarClock className="h-3 w-3" />Closes {fmt(c.ends_at)}</p>
      </div>
      {c.status === "open"
        ? <Link href={`/student/campaign/${c.id}`} className="shrink-0 rounded bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">{c.state === "started" ? "Continue" : "Start"}</Link>
        : <Badge>Closed</Badge>}
    </Card>
  );
}

export default function StudentHome() {
  const { data, error, loading, reload } = useLoad(() => api<StudentCampaign[]>("/student/campaigns"));
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={reload} />;
  const open = (data ?? []).filter((c) => c.status === "open");
  const closed = (data ?? []).filter((c) => c.status === "closed");
  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-semibold">Your feedback</h1>
        <p className="mt-1 text-sm text-ink-soft">What you submit is not linked to your name. “Continue” means you have started; only this browser knows whether you finished.</p></div>
      <section className="space-y-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Open now</h2>
        {open.length ? open.map((c) => <Row key={c.id} c={c} />) : <Empty title="Nothing to do right now" body="New feedback campaigns will appear here." />}</section>
      {closed.length > 0 && <section className="space-y-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Closed</h2>{closed.map((c) => <Row key={c.id} c={c} />)}</section>}
    </div>
  );
}
