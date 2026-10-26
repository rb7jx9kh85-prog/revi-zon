"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

function callbackUrl(next: string) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}

function readableError(message: string) {
  if (/rate limit|too many/i.test(message)) return "Trop de demandes. Attends une minute avant de réessayer.";
  if (/invalid.*email/i.test(message)) return "Cette adresse e-mail n'est pas valide.";
  return "La connexion a échoué. Réessaie dans un instant.";
}

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "sending" });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: true },
    });
    setStatus(error ? { kind: "error", message: readableError(error.message) } : { kind: "sent", email: email.trim() });
  }

  if (status.kind === "sent") {
    return (
      <div className="stack">
        <p className="notice ok">
          Lien envoyé à <strong>{status.email}</strong>. Ouvre-le sur cet appareil pour te connecter.
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => setStatus({ kind: "idle" })}>
          Utiliser une autre adresse
        </button>
      </div>
    );
  }

  const busy = status.kind === "sending";

  return (
    <div className="stack">
      {/* Connexion Google désactivée pour l'instant */}
      <button type="button" className="btn btn-ghost btn-soon" disabled aria-disabled="true">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9h-4v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.3 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
        </svg>
        Continuer avec Google
        <span className="soon-pill">Arrive bientôt</span>
      </button>

      <div className="divider">ou par e-mail</div>

      <form className="stack" onSubmit={sendMagicLink}>
        <label htmlFor="email">
          Adresse e-mail
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="ton@email.ch"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Envoi…" : "Recevoir mon lien de connexion"}
        </button>
      </form>

      {status.kind === "error" && <p className="notice error">{status.message}</p>}
    </div>
  );
}
