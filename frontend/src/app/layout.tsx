import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const metadata: Metadata = {
  title: "H.I.D.D.E.N. — Honest Insights Delivered Discreetly, Empowering Neutrality",
  description: "Anonymous course and faculty feedback where eligibility can be verified without revealing who said what.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={inter.variable}><body className="font-sans">{children}</body></html>;
}
