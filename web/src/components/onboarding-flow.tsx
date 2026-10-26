"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { burstConfetti } from "@/lib/confetti";
import { readFunctionError } from "@/lib/fn-error";
import { createClient } from "@/lib/supabase/client";

type Option = { value: string; label: string; emoji?: string };
type Question =
  | { kind: "text"; key: "name"; title: string; subtitle?: string; placeholder: string }
  | { kind: "single"; key: string; title: string; subtitle?: string; options: Option[] }
  | { kind: "multi"; key: string; title: string; subtitle?: string; options: Option[] }
  | { kind: "fact"; key: string; title: string; text: string; emoji: string };

const QUESTIONS: Question[] = [
  { kind: "text", key: "name", title: "Comment tu t'appelles ?", subtitle: "Revi aime bien savoir à qui il parle.", placeholder: "Ton prénom" },
  {
    kind: "single",
    key: "age",
    title: "Quel âge as-tu ?",
    subtitle: "Pour adapter les explications à ton niveau.",
    options: [
      { value: "-13", label: "Moins de 13 ans", emoji: "🧒" },
      { value: "13-15", label: "13 – 15 ans", emoji: "🎒" },
      { value: "16-18", label: "16 – 18 ans", emoji: "📚" },
      { value: "19-22", label: "19 – 22 ans", emoji: "🎓" },
      { value: "23+", label: "23 ans ou plus", emoji: "💼" },
    ],
  },
  {
    kind: "single",
    key: "level",
    title: "Tu es en…",
    options: [
      { value: "Collège", label: "Collège / Secondaire I", emoji: "🏫" },
      { value: "Lycée / Gymnase", label: "Lycée / Gymnase", emoji: "📐" },
      { value: "Prépa", label: "Prépa", emoji: "🔥" },
      { value: "Université / Haute école", label: "Université / Haute école", emoji: "🎓" },
      { value: "Formation pro", label: "Formation pro / Apprentissage", emoji: "🛠️" },
      { value: "Autre", label: "Autre", emoji: "✨" },
    ],
  },
  {
    kind: "single",
    key: "goal",
    title: "Quel est ton objectif principal ?",
    options: [
      { value: "exam", label: "Réussir un examen précis", emoji: "🎯" },
      { value: "grades", label: "Avoir de meilleures notes", emoji: "📈" },
      { value: "catchup", label: "Rattraper mon retard", emoji: "🏃" },
      { value: "stress", label: "Réviser sans stresser", emoji: "🧘" },
      { value: "faster", label: "Apprendre plus vite", emoji: "⚡" },
    ],
  },
  {
    kind: "single",
    key: "exam",
    title: "C'est quand, ton prochain examen ?",
    options: [
      { value: "week", label: "Cette semaine", emoji: "😰" },
      { value: "month", label: "Ce mois-ci", emoji: "📅" },
      { value: "quarter", label: "Dans 1 à 3 mois", emoji: "🗓️" },
      { value: "none", label: "Pas d'examen prévu", emoji: "😎" },
    ],
  },
  {
    kind: "fact",
    key: "fact-spacing",
    emoji: "🧠",
    title: "Bonne nouvelle : tu n'as pas besoin de réviser plus, mais mieux.",
    text: "La répétition espacée et le fait de se tester sont parmi les techniques de révision les plus efficaces selon la recherche en sciences cognitives. C'est exactement ce que Revizuno fait pour toi, automatiquement.",
  },
  {
    kind: "single",
    key: "minutes",
    title: "Combien de temps peux-tu réviser par jour ?",
    subtitle: "Sois honnête, on construit ton rythme là-dessus.",
    options: [
      { value: "10", label: "10 minutes", emoji: "☕" },
      { value: "20", label: "20 minutes", emoji: "⏱️" },
      { value: "40", label: "40 minutes", emoji: "💪" },
      { value: "60", label: "1 heure ou plus", emoji: "🚀" },
    ],
  },
  {
    kind: "multi",
    key: "methods",
    title: "Comment tu révises aujourd'hui ?",
    subtitle: "Plusieurs réponses possibles.",
    options: [
      { value: "reread", label: "Je relis mes cours", emoji: "👀" },
      { value: "sheets", label: "Je fais des fiches", emoji: "📝" },
      { value: "cards", label: "Flashcards", emoji: "🃏" },
      { value: "exercises", label: "Exercices / annales", emoji: "✍️" },
      { value: "last-minute", label: "La veille, en panique", emoji: "🙈" },
    ],
  },
  {
    kind: "single",
    key: "struggle",
    title: "Qu'est-ce qui te bloque le plus ?",
    options: [
      { value: "procrastination", label: "Je procrastine", emoji: "📱" },
      { value: "forget", label: "J'oublie vite ce que j'apprends", emoji: "🫠" },
      { value: "start", label: "Je ne sais pas par où commencer", emoji: "🧭" },
      { value: "time", label: "Je manque de temps", emoji: "⌛" },
      { value: "stress", label: "Le stress avant les examens", emoji: "😵" },
    ],
  },
  {
    kind: "multi",
    key: "subjects",
    title: "Quelles matières veux-tu réviser ?",
    options: [
      { value: "Maths", label: "Maths", emoji: "➗" },
      { value: "Français", label: "Français", emoji: "📖" },
      { value: "Langues", label: "Langues", emoji: "🌍" },
      { value: "Histoire-Géo", label: "Histoire-Géo", emoji: "🏛️" },
      { value: "Biologie", label: "Biologie", emoji: "🧬" },
      { value: "Chimie", label: "Chimie", emoji: "⚗️" },
      { value: "Physique", label: "Physique", emoji: "🔭" },
      { value: "Économie", label: "Économie / Droit", emoji: "⚖️" },
      { value: "Médecine", label: "Médecine / Santé", emoji: "🩺" },
      { value: "Informatique", label: "Informatique", emoji: "💻" },
      { value: "Autre", label: "Autre", emoji: "✨" },
    ],
  },
];

const LABELS: Record<string, Record<string, string>> = Object.fromEntries(
  QUESTIONS.filter((q) => q.kind === "single" || q.kind === "multi").map((q) => [q.key, Object.fromEntries((q as { options: Option[] }).options.map((o) => [o.value, o.label]))]),
);

const LOADING_STEPS = ["Analyse de tes réponses", "Choix des méthodes adaptées à ton profil", "Calcul de ton rythme de révision idéal", "Préparation de ton programme personnalisé"];

type Answers = Record<string, string | string[]>;

export function OnboardingFlow({
  initialName,
  isPro,
  priceLabel,
  pricePeriod,
  limits,
}: {
  initialName: string;
  isPro: boolean;
  priceLabel: string;
  pricePeriod: string;
  limits: { freeDocs: number; proDocs: number; freeMb: number; proMb: number };
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initialName ? { name: initialName } : {});
  const [phase, setPhase] = useState<"questions" | "loading" | "paywall">("questions");
  const [progress, setProgress] = useState(0);
  const [checkout, setCheckout] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const q = QUESTIONS[index];
  const name = String(answers.name ?? "").trim();
  const minutes = Number(answers.minutes ?? 20);

  async function save(final: Answers) {
    const { name: displayName, level, ...rest } = final;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({
        display_name: String(displayName ?? "").slice(0, 60) || null,
        school_level: (level as string) || null,
        onboarding_answers: { ...rest, completed_at: new Date().toISOString() },
        onboarding_completed: true,
      })
      .eq("id", user.id);
  }

  function next(update?: Answers) {
    const merged = { ...answers, ...update };
    setAnswers(merged);
    if (index + 1 < QUESTIONS.length) {
      setIndex(index + 1);
      return;
    }
    save(merged);
    setPhase("loading");
  }

  // Préparation du programme (animation)
  useEffect(() => {
    if (phase !== "loading") return;
    const start = Date.now();
    const total = 7200;
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / total);
      // Progression irrégulière, plus naturelle
      setProgress(Math.round(100 * (t < 0.6 ? t * 1.15 : 0.69 + (t - 0.6) * 0.775)));
      if (t >= 1) {
        clearInterval(timer);
        if (isPro) {
          router.push("/dashboard");
          return;
        }
        setPhase("paywall");
        burstConfetti(80);
      }
    }, 80);
    return () => clearInterval(timer);
  }, [phase, isPro, router]);

  const plan = useMemo(() => {
    const perWeek = minutes >= 40 ? 6 : 5;
    const subjects = (answers.subjects as string[] | undefined) ?? [];
    return {
      rhythm: `${minutes >= 60 ? "1 h" : `${minutes} min`} par jour, ${perWeek} jours sur 7`,
      goal: LABELS.goal?.[answers.goal as string] ?? "Progresser",
      exam: LABELS.exam?.[answers.exam as string] ?? "",
      subjects: subjects.length ? subjects.slice(0, 4).join(", ") + (subjects.length > 4 ? "…" : "") : "Tes matières",
      method:
        answers.struggle === "forget"
          ? "Répétition espacée : Revi te fait revoir chaque notion juste avant que tu l'oublies."
          : answers.struggle === "procrastination"
            ? "Sessions courtes planifiées dans ton agenda, avec rappels, pour ne plus repousser."
            : answers.struggle === "start"
              ? "Importe ton cours : Revi le transforme en fiche, flashcards et quiz, dans le bon ordre."
              : answers.struggle === "time"
                ? `Des sessions de ${Math.min(minutes, 20)} min pile, centrées sur ce que tu ne maîtrises pas encore.`
                : "Des quiz réguliers pour arriver à l'examen en confiance, sans bachotage de dernière minute.",
    };
  }, [answers, minutes]);

  const perDay = useMemo(() => {
    const amount = Number((priceLabel.match(/[\d.,]+/)?.[0] ?? "").replace(",", "."));
    const currency = priceLabel.replace(/[\d.,\s]+/g, "").trim();
    return amount ? `${(amount / 30).toFixed(2)} ${currency}` : null;
  }, [priceLabel]);

  async function goPro() {
    setCheckout("busy");
    setError(null);
    const { data, error: fnError } = await createClient().functions.invoke("billing", { body: { action: "checkout" } });
    if (fnError || !data?.url) {
      setError(fnError ? await readFunctionError(fnError, "Le paiement n'est pas disponible pour le moment.") : "Le paiement n'est pas disponible pour le moment.");
      setCheckout("idle");
      return;
    }
    window.location.href = data.url;
  }

  if (phase === "loading") {
    const stepDone = Math.floor((progress / 100) * LOADING_STEPS.length);
    return (
      <div className="ob-center fade-up">
        <div className="ob-ring" style={{ "--p": progress } as React.CSSProperties} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span>{progress}%</span>
        </div>
        <h1 className="ob-title">{name ? `${name}, on prépare ton programme…` : "On prépare ton programme…"}</h1>
        <ul className="ob-steps">
          {LOADING_STEPS.map((s, i) => (
            <li key={s} className={i < stepDone ? "done" : i === stepDone ? "current" : ""}>
              <span className="ob-check" aria-hidden="true">
                {i < stepDone ? "✓" : ""}
              </span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (phase === "paywall") {
    const faq = [
      { q: "Je peux arrêter quand je veux ?", a: "Oui. Tu résilies en deux clics depuis ton tableau de bord, sans engagement. Tu gardes Pro jusqu'à la fin de la période déjà payée." },
      { q: `Qu'est-ce que je garde en gratuit ?`, a: `Tous les outils, avec ${limits.freeDocs} cours importés par mois et des fichiers jusqu'à ${limits.freeMb} Mo.` },
      { q: "Le paiement est-il sécurisé ?", a: "Le paiement est géré par Stripe, utilisé par des millions d'entreprises. Nous ne voyons jamais ton numéro de carte." },
      { q: "Et mes données ?", a: "Tes cours restent privés et ne sont jamais revendus. Tout est expliqué dans notre politique de confidentialité." },
    ];
    return (
      <div className="paywall fade-up">
        <div className="stack" style={{ gap: 8, textAlign: "center", justifyItems: "center" }}>
          <span className="pill">Programme prêt</span>
          <h1 className="ob-title">{name ? `${name}, ton programme est prêt !` : "Ton programme est prêt !"}</h1>
          <p className="muted">Débloque Revizuno Pro pour le suivre sans limite.</p>
        </div>

        <section className="card stack ob-plan">
          <h2>Ton programme Revizuno</h2>
          <ul>
            <li>
              <span>🎯</span>
              <span>
                <strong>Objectif</strong> {plan.goal}
                {plan.exam ? ` · ${plan.exam.toLowerCase()}` : ""}
              </span>
            </li>
            <li>
              <span>⏱️</span>
              <span>
                <strong>Rythme</strong> {plan.rhythm}
              </span>
            </li>
            <li>
              <span>📚</span>
              <span>
                <strong>Matières</strong> {plan.subjects}
              </span>
            </li>
            <li>
              <span>🧠</span>
              <span>
                <strong>Méthode</strong> {plan.method}
              </span>
            </li>
          </ul>
        </section>

        <h2 className="pw-h2">Choisis ton plan.</h2>
        <div className="pw-plan on" aria-label="Revizuno Pro, sélectionné">
          <span className="pw-badge">Recommandé pour toi</span>
          <span className="pw-radio" aria-hidden="true">
            ✓
          </span>
          <div className="pw-plan-main">
            <strong>Revizuno Pro</strong>
            <span>
              {priceLabel} <span className="muted">/ {pricePeriod.replace(/^par /, "")}</span>
            </span>
            <span className="pw-tag">Sans engagement · résiliable à tout moment</span>
          </div>
          {perDay ? (
            <div className="pw-perday">
              <strong>{perDay}</strong>
              <span className="muted">/ jour</span>
            </div>
          ) : null}
        </div>

        <button type="button" className="pw-cta" onClick={goPro} disabled={checkout === "busy"}>
          {checkout === "busy" ? "Ouverture du paiement…" : "Continuer"}
        </button>
        {error && <p className="notice error">{error}</p>}
        <p className="pw-secure">🔒 Paiement sécurisé par Stripe</p>

        <h2 className="pw-h2">Ce que tu débloques</h2>
        <ul className="pw-list">
          <li>
            <span className="pw-ok">✓</span>
            <strong>{limits.proDocs} cours par mois</strong> au lieu de {limits.freeDocs}
          </li>
          <li>
            <span className="pw-ok">✓</span>
            <strong>Fichiers jusqu'à {limits.proMb} Mo</strong> au lieu de {limits.freeMb}
          </li>
          <li>
            <span className="pw-ok">✓</span>Fiches, flashcards, quiz et textes à trous générés par l'IA
          </li>
          <li>
            <span className="pw-ok">✓</span>« Explique avec tes mots », corrigé et noté par Revi
          </li>
          <li>
            <span className="pw-ok">✓</span>Studio Revi : ton tuteur IA, 24h/24
          </li>
          <li>
            <span className="pw-ok">✓</span>Résumés, export PDF stylé et calendrier de révision
          </li>
        </ul>

        <h2 className="pw-h2">Les questions qu'on nous pose</h2>
        <div className="pw-faq">
          {faq.map((f, i) => (
            <div key={f.q} className={`pw-faq-item ${openFaq === i ? "open" : ""}`}>
              <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                {f.q}
                <span aria-hidden="true">{openFaq === i ? "−" : "+"}</span>
              </button>
              {openFaq === i ? (
                <p>
                  {f.a}
                  {i === 3 ? (
                    <>
                      {" "}
                      <a href="/confidentialite">Lire la politique</a>.
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <button type="button" className="pw-cta" onClick={goPro} disabled={checkout === "busy"}>
          {checkout === "busy" ? "Ouverture du paiement…" : "Passer à Pro"}
        </button>

        <button type="button" className="pw-skip" onClick={() => router.push("/dashboard")}>
          Continuer avec la version gratuite
        </button>
      </div>
    );
  }

  const progressPct = Math.round((index / QUESTIONS.length) * 100);
  const value = answers[q.key];

  return (
    <div className="ob">
      <div className="ob-top">
        <button type="button" className="ob-back" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} aria-label="Question précédente">
          ‹
        </button>
        <div className="progress" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.max(4, progressPct)}%` }} />
        </div>
      </div>

      <div className="ob-q fade-up" key={q.key}>
        {q.kind === "fact" ? <span className="ob-emoji">{q.emoji}</span> : null}
        <h1 className="ob-title">{q.title}</h1>
        {"subtitle" in q && q.subtitle ? <p className="muted">{q.subtitle}</p> : null}

        {q.kind === "text" && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (String(value ?? "").trim()) next();
            }}
          >
            <input
              autoFocus
              id="ob-name"
              className="ob-input"
              value={String(value ?? "")}
              maxLength={40}
              placeholder={q.placeholder}
              onChange={(e) => setAnswers({ ...answers, name: e.target.value })}
            />
            <button type="submit" className="btn btn-primary" disabled={!String(value ?? "").trim()}>
              Continuer
            </button>
          </form>
        )}

        {q.kind === "single" && (
          <div className="ob-options stagger">
            {q.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`ob-option ${value === o.value ? "on" : ""}`}
                onClick={() => {
                  setAnswers({ ...answers, [q.key]: o.value });
                  setTimeout(() => next({ [q.key]: o.value }), 220);
                }}
              >
                {o.emoji ? <span className="ob-opt-emoji">{o.emoji}</span> : null}
                {o.label}
              </button>
            ))}
          </div>
        )}

        {q.kind === "multi" && (
          <>
            <div className="ob-options multi stagger">
              {q.options.map((o) => {
                const list = (value as string[] | undefined) ?? [];
                const on = list.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    className={`ob-option ${on ? "on" : ""}`}
                    aria-pressed={on}
                    onClick={() => setAnswers({ ...answers, [q.key]: on ? list.filter((x) => x !== o.value) : [...list, o.value] })}
                  >
                    {o.emoji ? <span className="ob-opt-emoji">{o.emoji}</span> : null}
                    {o.label}
                  </button>
                );
              })}
            </div>
            <button type="button" className="btn btn-primary" disabled={!((value as string[] | undefined)?.length)} onClick={() => next()}>
              Continuer
            </button>
          </>
        )}

        {q.kind === "fact" && (
          <>
            <p className="ob-fact">{q.text}</p>
            <button type="button" className="btn btn-primary" onClick={() => next()}>
              Super, on continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
