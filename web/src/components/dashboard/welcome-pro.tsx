"use client";

import { useEffect, useState } from "react";
import { burstConfetti } from "@/lib/confetti";

// Bannière de bienvenue après le passage à Pro (tableau de bord ?welcome=pro).
export function WelcomePro() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    burstConfetti(140);
    const url = new URL(window.location.href);
    url.searchParams.delete("welcome");
    window.history.replaceState(null, "", url);
  }, []);
  if (!visible) return null;
  return (
    <section className="welcome-pro pop-in" role="status">
      <div className="stack" style={{ gap: 4 }}>
        <strong>Bienvenue dans Revi-zon Pro !</strong>
        <span>Plus de cours chaque mois et des fichiers plus lourds : tout est débloqué. Bonnes révisions !</span>
      </div>
      <button type="button" className="icon-btn" style={{ display: "block" }} onClick={() => setVisible(false)} aria-label="Fermer">
        ×
      </button>
    </section>
  );
}
