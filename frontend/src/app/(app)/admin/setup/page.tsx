"use client";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Button, Card, Field, useToast } from "@/components/ui";
import { useLoad } from "@/components/use-load";

interface Id { id: string; name?: string; code?: string; title?: string; roll_no?: string; course?: string; semester?: string }

function Form({ title, fields, path, onDone, children }: { title: string; fields: [string, string, string?][]; path: string; onDone?: () => void; children?: ReactNode }) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Card className="space-y-3"><h2 className="font-semibold">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">{fields.map(([k, label, type]) => <Field key={k} label={label} type={type ?? "text"} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />)}</div>
      {children}
      <Button loading={busy} onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ temporary_password?: string }>(path, { method: "POST", json: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "").map(([k, x]) => [k, k === "batch_year" ? Number(x) : x])) });
          toast("ok", r.temporary_password ? `Created. Temporary password: ${r.temporary_password} (shown once)` : "Created"); setV({}); onDone?.();
        } catch (e) { toast("err", e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
      }}>Create</Button></Card>
  );
}

export default function Setup() {
  const toast = useToast();
  const students = useLoad(() => api<Id[]>("/admin/students"));
  const faculty = useLoad(() => api<Id[]>("/admin/faculty"));
  const courses = useLoad(() => api<Id[]>("/admin/courses"));
  const semesters = useLoad(() => api<Id[]>("/admin/semesters"));
  const offerings = useLoad(() => api<Id[]>("/admin/offerings"));
  const [off, setOff] = useState({ course_id: "", semester_id: "", faculty_id: "", section: "A" });
  const [enr, setEnr] = useState({ offering_id: "", ids: [] as string[] });
  const sel = (label: string, val: string, set: (x: string) => void, opts: [string, string][]) => (
    <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>
      <select className="w-full rounded border border-line bg-white px-3 py-2" value={val} onChange={(e) => set(e.target.value)}><option value="">Select…</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">People &amp; courses</h1>
      <Form title="Add student" path="/admin/students" onDone={students.reload} fields={[["email", "Email", "email"], ["name", "Name"], ["roll_no", "Roll number"], ["department", "Department"], ["batch_year", "Batch year", "number"]]} />
      <Form title="Add faculty" path="/admin/faculty" onDone={faculty.reload} fields={[["email", "Email", "email"], ["name", "Name"], ["employee_no", "Employee number"], ["department", "Department"]]} />
      <Form title="Add semester" path="/admin/semesters" onDone={semesters.reload} fields={[["name", "Name"], ["start_date", "Start", "date"], ["end_date", "End", "date"]]} />
      <Form title="Add course" path="/admin/courses" onDone={courses.reload} fields={[["code", "Code"], ["title", "Title"], ["department", "Department"]]} />
      <Card className="space-y-3"><h2 className="font-semibold">Create course offering</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {sel("Course", off.course_id, (x) => setOff({ ...off, course_id: x }), (courses.data ?? []).map((c) => [c.id, `${c.code} ${c.title}`]))}
          {sel("Semester", off.semester_id, (x) => setOff({ ...off, semester_id: x }), (semesters.data ?? []).map((s) => [s.id, s.name ?? ""]))}
          {sel("Faculty", off.faculty_id, (x) => setOff({ ...off, faculty_id: x }), (faculty.data ?? []).map((f) => [f.id, f.name ?? ""]))}
          <Field label="Section" value={off.section} onChange={(e) => setOff({ ...off, section: e.target.value })} /></div>
        <Button onClick={async () => { try { await api("/admin/offerings", { method: "POST", json: off }); toast("ok", "Offering created"); offerings.reload(); } catch (e) { toast("err", e instanceof Error ? e.message : "Failed"); } }}>Create</Button></Card>
      <Card className="space-y-3"><h2 className="font-semibold">Enrol students</h2>
        {sel("Offering", enr.offering_id, (x) => setEnr({ ...enr, offering_id: x }), (offerings.data ?? []).map((o) => [o.id, `${o.course} · ${o.semester}`]))}
        <select multiple className="h-40 w-full rounded border border-line p-2 text-sm" aria-label="Students" onChange={(e) => setEnr({ ...enr, ids: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
          {(students.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.roll_no} — {s.name}</option>)}</select>
        <Button disabled={!enr.offering_id || !enr.ids.length} onClick={async () => { try { const r = await api<{ added: number }>("/admin/enrollments", { method: "POST", json: { offering_id: enr.offering_id, student_ids: enr.ids } }); toast("ok", `${r.added} enrolled`); } catch (e) { toast("err", e instanceof Error ? e.message : "Failed"); } }}>Enrol selected</Button></Card>
    </div>
  );
}
