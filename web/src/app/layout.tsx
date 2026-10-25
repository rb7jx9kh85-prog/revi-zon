import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--f-display", weight: ["600", "800"] });
const body = Figtree({ subsets: ["latin"], variable: "--f-body" });

export const metadata: Metadata = {
  title: { default: "Revi-zon", template: "%s · Revi-zon" },
  description: "Importe tes cours, l'IA génère flashcards, textes à trous, quiz et fiches de révision à ton niveau.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
