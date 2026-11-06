"use client";

import { useState } from "react";
import { GoogleButton } from "@/components/google-button";
import { callbackUrl, readableAuthError, signInWithGoogle } from "@/lib/auth-client";
import { createClient } from "@/lib/supabase/client";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

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
    setStatus(error ? { kind: "error", message: readableAuthError(error.message, error.code) } : { kind: "sent", email: email.trim() });
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
      <GoogleButton
        disabled={busy}
        onClick={async () => {
          setStatus({ kind: "sending" });
          const message = await signInWithGoogle(next);
          if (message) setStatus({ kind: "error", message });
        }}
      />

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
