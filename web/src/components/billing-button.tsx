"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

async function readError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // réponse non JSON
    }
  }
  return "Le paiement n'est pas disponible pour le moment. Réessaie dans un instant.";
}

// Ouvre la page de paiement Stripe ("checkout") ou le portail d'abonnement ("portal").
export function BillingButton({
  action,
  label,
  className = "btn btn-primary",
}: {
  action: "checkout" | "portal";
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const { data, error: fnError } = await createClient().functions.invoke("billing", { body: { action } });
    if (fnError || !data?.url) {
      setError(fnError ? await readError(fnError) : "Le paiement n'est pas disponible pour le moment.");
      setBusy(false);
      return;
    }
    window.location.assign(String(data.url));
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <button type="button" className={className} onClick={go} disabled={busy}>
        {busy ? "Redirection…" : label}
      </button>
      {error && <p className="notice error">{error}</p>}
    </div>
  );
}
