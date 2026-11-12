"use client";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { AdminCampaign, Results } from "@/lib/types";
import { Badge, Button, Card, ConfirmButton, Empty, ErrorState, Loading, useToast } from "@/components/ui";
import { useLoad } from "@/components/use-load";
import ResultsView from "@/components/results-view";

interface Stats { status: string; eligible: number; claimed: number; submitted?: number }
interface ModItem { response_id: string; state: string; texts: string[] }

export default function ManageCampaign() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const c = useLoad(() => api<AdminCampaign>(`/admin/campaigns`).then((l) => (l as unknown as AdminCampaign[]).find((x) => x.id === id)!), [id]);
  const s = useLoad(() => api<Stats>(`/admin/campaigns/${id}/stats`), [id]);
  const closed = c.data?.status === "closed";
  const mod = useLoad(() => c.data && c.data.status !== "draft" ? api<ModItem[]>(`/admin/campaigns/${id}/moderation`) : Promise.resolve([]), [id, c.data?.status]);
  const res = useLoad(() => closed ? api<Results>(`/admin/reports/${id}`) : Promise.resolve(null), [id, closed]);
  const reloadAll = () => { c.reload(); s.reload(); mod.reload(); res.reload(); };
  const act = (path: string, ok: string, body?: unknown) => async () => {
    try { await api(`/admin/campaigns/${id}/${path}`, { method: "POST", json: body ?? {} }); toast("ok", ok); reloadAll(); }
    catch (e) { toast("err", e instanceof Error ? e.message : "Action failed"); }
  };

  if (c.loading || s.loading) return <Loading />;
  if (c.error || !c.data) return <ErrorState message={c.error ?? "Campaign not found"} retry={reloadAll} />;
  const camp = c.data, st = s.data;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{camp.name}</h1>
        <p className="mt-1 text-sm text-ink-soft">k = {camp.k_threshold}</p></div><Badge tone={camp.status === "open" ? "teal" : camp.status === "draft" ? "amber" : "gray"}>{camp.status}</Badge></div>

      {camp.status === "draft" && <Card className="space-y-3"><h2 className="font-semibold">Prepare</h2>
        <p className="text-sm text-ink-soft">Set the roster from course enrolment, then open. Opening freezes the roster and cannot be undone.</p>
        <div className="flex gap-2"><Button variant="secondary" onClick={act("eligibility", "Roster set from enrolment", { mode: "enrolled" })}>Use enrolled students</Button>
          <ConfirmButton variant="primary" label="Open campaign" title="Open this campaign?" body="The roster will be frozen and a signing key created. Students can claim credentials immediately." onConfirm={act("open", "Campaign opened")} /></div></Card>}

      {camp.status === "open" && <Card className="space-y-3"><h2 className="font-semibold">Running</h2>
        <p className="text-sm text-ink-soft">Closing stops submissions, destroys the signing key and releases results to faculty.</p>
        <ConfirmButton label="Close campaign" title="Close this campaign?" body="This is permanent. No more credentials or submissions will be accepted." onConfirm={act("close", "Campaign closed")} /></Card>}

      {st && <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-xs uppercase tracking-wide text-ink-soft">Eligible</p><p className="mt-1 text-3xl font-semibold">{st.eligible}</p></Card>
        <Card><p className="text-xs uppercase tracking-wide text-ink-soft">Started{st.status === "open" ? " (approx.)" : ""}</p><p className="mt-1 text-3xl font-semibold">{st.claimed}</p></Card>
        <Card><p className="text-xs uppercase tracking-wide text-ink-soft">Submitted</p><p className="mt-1 text-3xl font-semibold">{st.submitted ?? "–"}</p>
          {st.submitted === undefined && <p className="text-xs text-ink-soft">Shown after close</p>}</Card></div>}
      {camp.roster_hash && <p className="break-all text-xs text-ink-soft">Roster fingerprint: {camp.roster_hash}</p>}

      {camp.status !== "draft" && <Card className="space-y-3"><h2 className="font-semibold">Comment moderation</h2>
        {(mod.data ?? []).length === 0 ? <Empty title="No comments to review" /> : mod.data!.map((m) => (
          <div key={m.response_id} className="rounded border border-line p-3">
            {m.texts.map((t, i) => <p key={i} className="text-sm">{t}</p>)}
            <div className="mt-2 flex items-center gap-2"><Badge tone={m.state === "ok" ? "teal" : m.state === "hidden" ? "gray" : "amber"}>{m.state}</Badge>
              <Button variant="secondary" onClick={act("moderation", "Updated", { response_id: m.response_id, state: "ok" })}>Approve</Button>
              <Button variant="ghost" onClick={act("moderation", "Updated", { response_id: m.response_id, state: "hidden" })}>Hide</Button></div></div>))}</Card>}

      {closed && res.data && <section className="space-y-3"><h2 className="font-semibold">Results</h2><ResultsView r={res.data} /></section>}
    </div>
  );
}
