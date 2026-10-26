"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Recharge la page pendant ~1 minute, le temps que Stripe confirme l'abonnement.
export function PlanWatcher() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (ticks > 30) {
        clearInterval(timer);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [router]);

  return timedOut ? (
    <p className="notice">L'activation prend plus de temps que prévu. Recharge la page dans une minute ; ton paiement est bien enregistré.</p>
  ) : (
    <div className="spinner" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
