"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { slug: "", label: "Vue d'ensemble", color: "var(--accent-3)", icon: "M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z" },
  { slug: "flashcards", label: "Flashcards", color: "var(--accent)", icon: "M4 7h12v12H4zM8 4h12v12" },
  { slug: "quiz", label: "Quiz", color: "var(--accent-4)", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-2.5 6.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" },
  { slug: "blanks", label: "Textes à trous", color: "var(--accent-2)", icon: "M3 8h5m8 0h5M3 13h3m9 0h6M3 18h9M8 8h8M6 13h9M12 18h6" },
  { slug: "notes", label: "Fiche de révision", color: "var(--accent-3)", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5" },
];

export function StudyNav({ documentId, counts }: { documentId: string; counts: Record<string, number | null> }) {
  const pathname = usePathname();
  const base = `/study/${documentId}`;

  return (
    <nav className="study-nav" aria-label="Méthodes de révision">
      <p className="nav-title">Méthodes</p>
      {ITEMS.map((item) => {
        const href = item.slug ? `${base}/${item.slug}` : base;
        const active = pathname === href;
        const count = counts[item.slug];
        return (
          <Link key={item.slug || "overview"} href={href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="nav-ico" style={{ background: item.color }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={item.icon} />
              </svg>
            </span>
            <span className="nav-label">{item.label}</span>
            {typeof count === "number" && count > 0 ? <span className="nav-count">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
