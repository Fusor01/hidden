"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, ErrorState, Field } from "@/components/ui";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api<{ role: string }>("/auth/login", { method: "POST", json: { email, password } }); router.replace(`/${r.role}`); }
    catch (x) { setErr(x instanceof Error ? x.message : "Sign-in failed"); }
    finally { setBusy(false); }
  }
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold text-navy-900"><ShieldCheck className="h-5 w-5 text-teal-600" />H.I.D.D.E.N.</Link>
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <h1 className="text-xl font-semibold">Sign in</h1>
            {err && <ErrorState message={err} />}
            <Field label="Institutional email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" loading={busy} className="w-full">Sign in</Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-ink-soft">Signing in proves you are eligible. It is never attached to what you submit.</p>
      </div>
    </main>
  );
}
