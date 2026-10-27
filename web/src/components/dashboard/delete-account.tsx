"use client";

import { useState } from "react";
import { readFunctionError } from "@/lib/fn-error";
import { createClient } from "@/lib/supabase/client";

const CONFIRM_WORD = "SUPPRIMER";

export function DeleteAccount({ isPro }: { isPro: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: fnError } = await supabase.functions.invoke("account", { body: { action: "delete" } });
    if (fnError || !data?.deleted) {
      setError(fnError ? await readFunctionError(fnError, "La suppression a échoué. Réessaie.") : "La suppression a échoué. Réessaie.");
      setBusy(false);
      return;
    }
    await supabase.auth.signOut().catch(() => {});
    window.location.href = "/login?compte=supprime";
  }

  return (
    <section className="card stack danger-zone">
      <h2 style={{ fontSize: "1.2rem" }}>Supprimer mon compte</h2>
      {!open ? (
        <>
          <p className="muted">Ton compte et toutes tes données seront effacés définitivement. Tu pourras te réinscrire plus tard avec la même adresse e-mail.</p>
          <button type="button" className="btn btn-danger-ghost btn-inline" onClick={() => setOpen(true)}>
            Supprimer mon compte
          </button>
        </>
      ) : (
        <div className="stack fade-up">
          <p>Seront supprimés définitivement :</p>
          <ul className="danger-list">
            <li>tes cours, fichiers, fiches, flashcards, quiz et résumés ;</li>
            <li>ta progression, tes sessions planifiées et tes conversations avec Revi ;</li>
            <li>ton profil et tes réponses au questionnaire d'accueil.</li>
          </ul>
          {isPro ? <p className="notice">Ton abonnement Pro sera résilié immédiatement, sans remboursement de la période en cours.</p> : null}
          <label htmlFor="delete-confirm">
            Pour confirmer, tape {CONFIRM_WORD}
            <input id="delete-confirm" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} placeholder={CONFIRM_WORD} />
          </label>
          <div className="row-center" style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className="btn btn-ghost btn-inline"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              disabled={busy}
            >
              Annuler
            </button>
            <button type="button" className="btn btn-danger btn-inline" onClick={remove} disabled={busy || typed.trim().toUpperCase() !== CONFIRM_WORD}>
              {busy ? "Suppression…" : "Supprimer définitivement"}
            </button>
          </div>
          {error && <p className="notice error">{error}</p>}
        </div>
      )}
    </section>
  );
}
