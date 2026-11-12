"use client";
import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export function Button({ variant = "primary", loading, className, children, disabled, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean }) {
  const v = {
    primary: "bg-navy-900 text-white hover:bg-navy-800",
    secondary: "bg-white text-navy-900 border border-line hover:bg-paper",
    danger: "bg-red-700 text-white hover:bg-red-800",
    ghost: "text-ink-soft hover:bg-white",
  }[variant];
  return (
    <button {...p} disabled={disabled || loading}
      className={cx("inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50", v, className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
    </button>
  );
}

export const Card = ({ className, children }: { className?: string; children: ReactNode }) =>
  <section className={cx("rounded-lg border border-line bg-white p-5 shadow-card", className)}>{children}</section>;

export function Field({ label, hint, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-navy-900">{label}</span>
      <input {...p} className="w-full rounded border border-line bg-white px-3 py-2 text-sm placeholder:text-ink-soft/60" />
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

export const Badge = ({ tone = "gray", children }: { tone?: "gray" | "teal" | "indigo" | "amber"; children: ReactNode }) => {
  const t = { gray: "bg-paper text-ink-soft", teal: "bg-teal-50 text-teal-600", indigo: "bg-indigo-50 text-indigo-700", amber: "bg-amber-50 text-amber-700" }[tone];
  return <span className={cx("inline-block rounded px-2 py-0.5 text-xs font-medium", t)}>{children}</span>;
};

export const Loading = ({ label = "Loading" }: { label?: string }) =>
  <div role="status" className="flex items-center gap-2 py-10 text-sm text-ink-soft"><Loader2 className="h-4 w-4 animate-spin" />{label}…</div>;

export const Empty = ({ title, body }: { title: string; body?: string }) =>
  <div className="rounded-lg border border-dashed border-line py-12 text-center">
    <p className="font-medium text-navy-900">{title}</p>{body && <p className="mt-1 text-sm text-ink-soft">{body}</p>}
  </div>;

export const ErrorState = ({ message, retry }: { message: string; retry?: () => void }) =>
  <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{message}</div>
    {retry && <button onClick={retry} className="font-medium underline">Retry</button>}
  </div>;

// ---- toasts ----
type Toast = { id: number; kind: "ok" | "err"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-50 space-y-2">
        {items.map((t) => (
          <div key={t.id} className={cx("flex items-center gap-2 rounded border bg-white px-4 py-3 text-sm shadow-card", t.kind === "ok" ? "border-teal-500" : "border-red-300")}>
            {t.kind === "ok" ? <CheckCircle2 className="h-4 w-4 text-teal-600" /> : <AlertCircle className="h-4 w-4 text-red-700" />}{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---- confirmation dialog ----
export function ConfirmButton({ label, title, body, onConfirm, variant = "danger" }:
  { label: string; title: string; body: string; onConfirm: () => Promise<void> | void; variant?: "primary" | "danger" | "secondary" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>{label}</Button>
      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-navy-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="dlg-title" className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-ink-soft">{body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant={variant} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); setOpen(false); } }}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
