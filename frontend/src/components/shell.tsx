"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, ClipboardList, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Me, Role } from "@/lib/types";
import { Loading, ToastProvider, cx } from "./ui";

const NAV: Record<Role, { href: string; label: string; icon: typeof LayoutDashboard }[]> = {
  student: [{ href: "/student", label: "My feedback", icon: ClipboardList }],
  faculty: [{ href: "/faculty", label: "Results", icon: BarChart3 }],
  admin: [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/campaigns", label: "Campaigns", icon: ClipboardList },
    { href: "/admin/setup", label: "People & courses", icon: Settings },
  ],
};

export default function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<Me>("/auth/me").then((m) => {
      setMe(m);
      if (!path.startsWith(`/${m.role}`)) router.replace(`/${m.role}`);
    }).catch(() => router.replace("/login"));
  }, [path, router]);

  if (!me) return <Loading label="Checking your session" />;
  const links = NAV[me.role];
  const sidebar = (
    <nav className="flex h-full flex-col bg-navy-900 p-4 text-white">
      <div className="mb-8 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight"><ShieldCheck className="h-5 w-5 text-teal-500" />H.I.D.D.E.N.</div>
      <ul className="space-y-1">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} onClick={() => setOpen(false)}
              className={cx("flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors", path === href ? "bg-navy-700" : "text-white/70 hover:bg-navy-800 hover:text-white")}>
              <Icon className="h-4 w-4" />{label}
            </Link>
          </li>
        ))}
      </ul>
      <button className="mt-auto flex items-center gap-3 rounded px-3 py-2 text-sm text-white/70 hover:bg-navy-800 hover:text-white"
        onClick={async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); router.replace("/login"); }}>
        <LogOut className="h-4 w-4" />Sign out
      </button>
    </nav>
  );
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 md:block">{sidebar}</aside>
        {open && <div className="fixed inset-0 z-30 md:hidden"><div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} /><aside className="relative h-full w-64">{sidebar}</aside></div>}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-line bg-white px-4 md:px-8">
            <button className="md:hidden" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
            <span className="hidden text-sm text-ink-soft md:block capitalize">{me.role} workspace</span>
            <span className="text-sm font-medium">{me.name}</span>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
