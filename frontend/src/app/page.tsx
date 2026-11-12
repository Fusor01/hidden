import Link from "next/link";
import { BarChart3, EyeOff, KeyRound, Lock, ShieldCheck, Users } from "lucide-react";

const STEPS = [
  ["You sign in", "Your institution confirms you are on the roster for this course. That is all the sign-in is used for."],
  ["You get a sealed pass", "Your browser creates a secret and has the server stamp it without reading it. The stamp proves eligibility; the secret is yours alone."],
  ["You submit, unattached", "Your feedback and pass go to a separate service that never sees who you are. Each pass works once."],
];
const FEATURES = [
  [KeyRound, "One voice per student", "Every eligible student can submit once per campaign, enforced atomically."],
  [EyeOff, "No hidden mapping", "There is no table, log or API that connects a student to a response."],
  [BarChart3, "Aggregates only", "Faculty see averages and distributions, and only once enough people have responded."],
  [Users, "Built for institutions", "Courses, semesters, rosters and campaigns, with reports per course and term."],
  [Lock, "Defence in depth", "Argon2id passwords, CSRF checks, rate limits, strict headers, and isolated services."],
  [ShieldCheck, "Honest about limits", "We document what the system cannot protect against instead of overpromising."],
] as const;

export default function Landing() {
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 font-semibold text-navy-900"><ShieldCheck className="h-5 w-5 text-teal-600" />H.I.D.D.E.N.</span>
        <nav className="flex items-center gap-6 text-sm text-ink-soft">
          <a href="#how" className="hover:text-navy-900">How it works</a>
          <a href="#privacy" className="hover:text-navy-900">Privacy</a>
          <Link href="/login" className="rounded bg-navy-900 px-4 py-2 font-medium text-white hover:bg-navy-800">Sign in</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-teal-600">Anonymous course feedback</p>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">Say it honestly. It cannot be traced back to you.</h1>
          <p className="mt-5 max-w-lg text-lg text-ink-soft">
            H.I.D.D.E.N. lets an institution verify that you are eligible to give feedback without ever learning which response is yours.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/login" className="rounded bg-navy-900 px-5 py-3 text-sm font-medium text-white hover:bg-navy-800">Give feedback</Link>
            <a href="#privacy" className="rounded border border-line px-5 py-3 text-sm font-medium text-navy-900 hover:bg-paper">How anonymity works</a>
          </div>
        </div>
        <figure aria-label="Two separate systems with no link between them" className="rounded-lg border border-line bg-paper p-6">
          <svg viewBox="0 0 420 250" className="w-full" role="img">
            <rect x="10" y="20" width="170" height="200" rx="6" fill="#fff" stroke="#E3E6EF" />
            <rect x="240" y="20" width="170" height="200" rx="6" fill="#fff" stroke="#E3E6EF" />
            <text x="95" y="52" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0B1B3A">Who you are</text>
            <text x="325" y="52" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0B1B3A">What you said</text>
            {["Eligible? yes", "Pass issued: once", "No ballot data"].map((t, i) => <text key={t} x="95" y={95 + i * 30} textAnchor="middle" fontSize="12" fill="#55607A">{t}</text>)}
            {["Valid pass? yes", "Pass spent: once", "No identity data"].map((t, i) => <text key={t} x="325" y={95 + i * 30} textAnchor="middle" fontSize="12" fill="#55607A">{t}</text>)}
            <line x1="188" y1="120" x2="232" y2="120" stroke="#0D9488" strokeWidth="2" strokeDasharray="4 4" />
            <text x="210" y="240" textAnchor="middle" fontSize="11" fill="#0D9488">no link between them</text>
          </svg>
        </figure>
      </section>

      <section id="how" className="border-t border-line bg-paper py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-semibold">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="rounded-lg border border-line bg-white p-6">
                <span className="text-sm font-semibold text-indigo-600">0{i + 1}</span>
                <h3 className="mt-2 text-lg font-semibold">{t}</h3><p className="mt-2 text-sm text-ink-soft">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="privacy" className="py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold">What anonymous means here</h2>
            <p className="mt-4 text-ink-soft">
              The pass your browser holds is blind-signed: the server vouches for it without seeing it. When you submit, the
              ballot service can check the stamp is genuine, but it has no way to tell whose pass it is. The two services use
              separate databases and credentials, and ballots carry no timestamps.
            </p>
            <p className="mt-4 text-ink-soft">Faculty see results only after a campaign closes, and only when enough students responded to hide any single person.</p>
          </div>
          <div className="rounded-lg border border-line bg-paper p-6">
            <h3 className="font-semibold text-navy-900">What we do not promise</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-soft">
              <li>Hosting providers and networks can see IP addresses and request times. Matching them is hard but not impossible.</li>
              <li>Free-text comments can identify you through details or writing style. Write accordingly.</li>
              <li>Very small classes may never reach the threshold, so no results are shown.</li>
              <li>If you lose your browser data after claiming your pass, it cannot be recovered. That is the cost of not keeping a copy.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-paper py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-semibold">Platform features</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {FEATURES.map(([Icon, t, d]) => (
              <div key={t}><Icon className="h-5 w-5 text-indigo-600" /><h3 className="mt-3 font-semibold">{t}</h3><p className="mt-1 text-sm text-ink-soft">{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-sm text-ink-soft">
        H.I.D.D.E.N. — Honest Insights Delivered Discreetly, Empowering Neutrality
      </footer>
    </div>
  );
}
