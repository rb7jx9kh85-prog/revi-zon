import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>
        © {new Date().getFullYear()} Revi-zon · {LEGAL.operator}
      </span>
      <nav aria-label="Liens légaux">
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/pricing">Offre Pro</Link>
        <a href={`mailto:${LEGAL.email}`}>Contact</a>
      </nav>
    </footer>
  );
}
