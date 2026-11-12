"use client";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { api } from "@/lib/api";
import type { Results } from "@/lib/types";
import { Button, ErrorState, Loading } from "@/components/ui";
import { useLoad } from "@/components/use-load";
import ResultsView from "@/components/results-view";

export default function FacultyResults() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useLoad(() => api<{ campaign: string; course: string; semester: string } & Results>(`/faculty/campaigns/${id}/results`), [id]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Not found"} retry={reload} />;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{data.campaign}</h1>
        <p className="text-sm text-ink-soft">{data.course} · {data.semester}</p></div>
        <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print report</Button></div>
      <ResultsView r={data} />
    </div>
  );
}
