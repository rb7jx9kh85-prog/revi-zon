import { SiteFooter } from "@/components/site-footer";
import type { Metadata } from "next";
import { safeNextPath } from "@/lib/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  otp_expired: "Ce lien a expiré. Demande un nouveau lien ci-dessous.",
  lien_invalide: "Ce lien de connexion n'est plus valide. Demande un nouveau lien ci-dessous.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="shell">
      <div className="stack" style={{ width: "min(100%, 420px)" }}>
        <a href="/" className="brand" style={{ justifySelf: "center" }}>
          <img src="/logo-mark.png" alt="" width={40} height={36} />
          Revizuno
        </a>
        <section className="card stack">
          <div className="stack" style={{ gap: 8 }}>
            <h1 style={{ fontSize: "1.9rem" }}>
              Connecte-toi pour <span className="mark">réviser.</span>
            </h1>
            <p className="muted">Pas de compte ? Il est créé automatiquement à ta première connexion.</p>
          </div>
          {error && <p className="notice error">{ERRORS[error] ?? ERRORS.lien_invalide}</p>}
          <LoginForm next={safeNextPath(next)} />
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
