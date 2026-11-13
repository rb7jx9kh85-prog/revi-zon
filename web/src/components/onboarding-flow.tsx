"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { callbackUrl, readableAuthError, signInWithGoogle } from "@/lib/auth-client";
import { GoogleButton } from "./google-button";
import { burstConfetti } from "@/lib/confetti";
import { readFunctionError } from "@/lib/fn-error";
import { DEFAULT_PLAN, PLANS, planMath, type Currency, type PlanId } from "@/lib/pricing";
import { buzz, isMuted, play, setMuted } from "@/lib/sfx";
import { createClient } from "@/lib/supabase/client";

type Option = { value: string; label: string; emoji?: string };
type Question =
  | { kind: "text"; key: "name"; title: string; subtitle?: string; placeholder: string }
  | { kind: "single"; key: string; title: string; subtitle?: string; options: Option[] }
  | { kind: "multi"; key: string; title: string; subtitle?: string; options: Option[] }
  | { kind: "fact"; key: string; title: string; text: string; emoji: string }
  | { kind: "date"; key: "exam_date"; title: string; subtitle?: string }
  | { kind: "slider"; key: "minutes"; title: string; subtitle?: string; min: number; max: number; step: number }
  | { kind: "hold"; key: "commit"; title: string; subtitle?: string };

const QUESTIONS: Question[] = [
  { kind: "text", key: "name", title: "Comment tu t'appelles ?", subtitle: "Revi aime bien savoir à qui il parle.", placeholder: "Ton prénom" },
  {
    kind: "single",
    key: "age",
    title: "Enchanté {name} ! Quel âge as-tu ?",
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
    kind: "date",
    key: "exam_date",
    title: "C'est quand, ton prochain examen ?",
    subtitle: "On cale ton programme sur cette date.",
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
    key: "stress",
    title: "Comment tu te sens avant un examen ?",
    options: [
      { value: "calm", label: "Serein·e", emoji: "😌" },
      { value: "bit", label: "Un peu stressé·e", emoji: "😬" },
      { value: "very", label: "Très stressé·e", emoji: "😰" },
      { value: "panic", label: "C'est la panique totale", emoji: "🫨" },
    ],
  },
  {
    kind: "single",
    key: "load",
    title: "Combien de chapitres dois-tu réviser en ce moment ?",
    options: [
      { value: "1-2", label: "1 ou 2", emoji: "📄" },
      { value: "3-5", label: "3 à 5", emoji: "📚" },
      { value: "6-10", label: "6 à 10", emoji: "🗂️" },
      { value: "10+", label: "Plus de 10", emoji: "🏔️" },
    ],
  },
  {
    kind: "slider",
    key: "minutes",
    title: "Combien de temps peux-tu réviser par jour ?",
    subtitle: "Sois honnête, on construit ton rythme là-dessus.",
    min: 5,
    max: 90,
    step: 5,
  },
  {
    kind: "single",
    key: "when",
    title: "Quand préfères-tu réviser ?",
    options: [
      { value: "morning", label: "Le matin", emoji: "🌅" },
      { value: "afternoon", label: "Après les cours", emoji: "🎒" },
      { value: "evening", label: "Le soir", emoji: "🌙" },
      { value: "weekend", label: "Surtout le week-end", emoji: "🛋️" },
    ],
  },
  {
    kind: "single",
    key: "device",
    title: "Tu révises plutôt sur…",
    options: [
      { value: "phone", label: "Mon téléphone", emoji: "📱" },
      { value: "computer", label: "Mon ordinateur", emoji: "💻" },
      { value: "both", label: "Les deux", emoji: "🔁" },
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
    kind: "fact",
    key: "fact-daily",
    emoji: "⏱️",
    title: "Un peu chaque jour vaut mieux que tout la veille.",
    text: "Réviser par petites sessions régulières aide à retenir plus longtemps qu'une longue session de dernière minute. Revizuno te dit chaque jour quoi revoir, pour que chaque minute compte.",
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
  {
    kind: "single",
    key: "source",
    title: "Comment as-tu connu Revizuno ?",
    options: [
      { value: "tiktok", label: "TikTok", emoji: "🎵" },
      { value: "instagram", label: "Instagram", emoji: "📸" },
      { value: "youtube", label: "YouTube", emoji: "▶️" },
      { value: "friend", label: "Un·e ami·e", emoji: "🤝" },
      { value: "search", label: "Google", emoji: "🔎" },
      { value: "other", label: "Autre", emoji: "✨" },
    ],
  },
  {
    kind: "hold",
    key: "commit",
    title: "{name}, prêt·e à t'y mettre pendant 2 semaines ?",
    subtitle: "C'est le temps qu'il faut pour sentir la différence. Maintiens le bouton pour t'engager.",
  },
];

const LABELS: Record<string, Record<string, string>> = Object.fromEntries(
  QUESTIONS.filter((q) => q.kind === "single" || q.kind === "multi").map((q) => [q.key, Object.fromEntries((q as { options: Option[] }).options.map((o) => [o.value, o.label]))]),
);

const EXAM_LABELS: Record<string, string> = {
  week: "Cette semaine",
  month: "Ce mois-ci",
  quarter: "Dans 1 à 3 mois",
  later: "Dans plus de 3 mois",
  none: "Pas d'examen prévu",
};

const DAY_MS = 86_400_000;

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

// Jours entre aujourd'hui et une date « AAAA-MM-JJ » (null si pas de date valable)
function daysUntil(iso: unknown): number | null {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const days = Math.round((new Date(y, m - 1, d).getTime() - today().getTime()) / DAY_MS);
  return days >= 0 ? days : null;
}

function examBucket(days: number | null) {
  if (days === null) return "none";
  if (days <= 7) return "week";
  if (days <= 31) return "month";
  if (days <= 92) return "quarter";
  return "later";
}

function longDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" });
}

function fmtMinutes(m: number) {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}`;
}

function minutesEmoji(min: number) {
  return min <= 10 ? "☕" : min <= 20 ? "⏱️" : min <= 40 ? "💪" : min <= 60 ? "🔥" : "🚀";
}

// Nombre qui défile jusqu'à sa nouvelle valeur, avec un petit tic sonore
function useCountUp(target: number, sound = true) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const t0 = performance.now();
    const dur = Math.min(650, 160 + Math.abs(target - start) * 6);
    let last = start;
    let lastSound = 0;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const v = Math.round(start + (target - start) * (1 - Math.pow(1 - t, 3)));
      if (v !== last) {
        last = v;
        setShown(v);
        if (sound && now - lastSound > 40) {
          lastSound = now;
          play("tick", 0.9 + t * 0.4);
        }
      }
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = last;
    };
  }, [target, sound]);
  return shown;
}

const HOLD_MS = 1500;

// Bouton « maintenir pour s'engager » : l'anneau se remplit, le son monte, puis confettis
function HoldButton({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef(0);
  const t0 = useRef(0);
  const ticks = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function begin() {
    if (done) return;
    cancelAnimationFrame(raf.current);
    t0.current = performance.now();
    ticks.current = 0;
    play("tap");
    buzz(8);
    const loop = (now: number) => {
      const t = Math.min(1, (now - t0.current) / HOLD_MS);
      setP(t);
      const k = Math.floor(t * 12);
      if (k > ticks.current) {
        ticks.current = k;
        play("tick", 1 + k * 0.1);
        buzz(4);
      }
      if (t >= 1) {
        setDone(true);
        play("success");
        buzz([20, 40, 30]);
        burstConfetti(90);
        setTimeout(onDone, 900);
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }

  function end() {
    if (done) return;
    cancelAnimationFrame(raf.current);
    setP(0);
  }

  return (
    <button
      type="button"
      className={`ob-hold ${done ? "done" : p > 0 ? "holding" : ""}`}
      style={{ "--p": p } as React.CSSProperties}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") end();
      }}
      aria-label="Maintiens pour t'engager"
    >
      <span className="ob-hold-ring" aria-hidden="true">
        <span>{done ? "✓" : "💪"}</span>
      </span>
      <span className="ob-hold-label">{done ? "C'est parti !" : p > 0 ? "Continue d'appuyer…" : "Maintiens pour t'engager"}</span>
    </button>
  );
}

const LOADING_STEPS = ["Analyse de tes réponses", "Choix des méthodes adaptées à ton profil", "Calcul de ton rythme de révision idéal", "Préparation de ton programme personnalisé"];

type Answers = Record<string, string | string[]>;
type Phase = "init" | "questions" | "loading" | "signup" | "sent" | "paywall" | "redirect";
type Choice = PlanId | "free";

// Réponses gardées dans le navigateur entre le questionnaire public et l'inscription
const STORAGE_KEY = "revizuno.onboarding";

function readStored(): Answers | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Answers) : null;
  } catch {
    return null;
  }
}

function writeStored(answers: Answers | null) {
  try {
    if (answers) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // stockage indisponible (navigation privée) : les réponses passent aussi par le compte
  }
}

export function OnboardingFlow({
  mode,
  initialAnswers,
  initialName,
  isPro,
  currency,
  limits,
}: {
  // public : avant l'inscription (/commencer) ; app : connecté (/onboarding)
  mode: "public" | "app";
  initialAnswers: Answers | null;
  initialName: string;
  isPro: boolean;
  currency: Currency;
  limits: { freeDocs: number; proDocs: number; freeMb: number; proMb: number };
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initialName ? { name: initialName } : {});
  const [phase, setPhase] = useState<Phase>(mode === "app" ? "init" : "questions");
  const [loadingMs, setLoadingMs] = useState(7200);
  const [email, setEmail] = useState("");
  const [signupBusy, setSignupBusy] = useState(false);
  const [planId, setPlanId] = useState<PlanId>(DEFAULT_PLAN);
  // Offre choisie avant la création du compte (parcours public)
  const [choice, setChoice] = useState<Choice | null>(null);
  const [progress, setProgress] = useState(0);
  const [checkout, setCheckout] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // Animation de transition entre les questions, son coupé ou non, petit message d'encouragement
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [soundOff, setSoundOff] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const advancing = useRef(false);
  useEffect(() => setSoundOff(isMuted()), []);

  const q = QUESTIONS[index];
  const name = String(answers.name ?? "").trim();
  const minutes = Number(answers.minutes ?? 20) || 20;
  const examDays = daysUntil(answers.exam_date);
  const shownDays = useCountUp(examDays ?? 0, phase === "questions" && q.kind === "date");

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

  // Connecté : si les réponses ont été données avant l'inscription, on les reprend
  useEffect(() => {
    if (mode !== "app" || phase !== "init") return;
    const stored = initialAnswers ?? readStored();
    if (stored && Object.keys(stored).length >= 3) {
      const merged = { ...stored, ...(stored.name ? {} : answers) };
      setAnswers(merged);
      writeStored(null);
      const chosen = merged.plan_choice as string | undefined;
      const chosenCurrency = merged.plan_currency === "chf" || merged.plan_currency === "eur" ? (merged.plan_currency as Currency) : currency;
      // Offre déjà choisie avant l'inscription : paiement directement (ou tableau de bord si gratuit)
      if (chosen === "free" || (chosen && isPro)) {
        setPhase("redirect");
        save(merged).finally(() => router.push("/dashboard"));
      } else if (chosen && PLANS.some((p) => p.id === chosen)) {
        setPlanId(chosen as PlanId);
        setPhase("redirect");
        save(merged).finally(() => goPro(chosen as PlanId, chosenCurrency));
      } else {
        save(merged);
        setLoadingMs(2600);
        setPhase("loading");
      }
    } else {
      setPhase("questions");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, initialAnswers]);

  function next(update?: Answers) {
    const merged = { ...answers, ...update };
    setAnswers(merged);
    setDir("fwd");
    if (index + 1 < QUESTIONS.length) {
      const to = index + 1;
      setIndex(to);
      if (to === Math.floor(QUESTIONS.length / 2)) {
        play("milestone");
        buzz([10, 30, 10]);
        setToast(name ? `À mi-chemin, ${name} 🔥` : "À mi-chemin 🔥");
        setTimeout(() => setToast(null), 1800);
      } else {
        play("next", 1 + (to / QUESTIONS.length) * 0.5);
      }
      return;
    }
    if (mode === "public") writeStored(merged);
    else save(merged);
    setPhase("loading");
  }

  function back() {
    if (index === 0) return;
    setDir("back");
    play("back");
    setIndex(index - 1);
  }

  function answersWithChoice(): Answers {
    return choice ? { ...answers, plan_choice: choice, plan_currency: currency } : answers;
  }

  // Parcours public : l'offre est choisie avant la création du compte
  function choose(c: Choice) {
    setChoice(c);
    setError(null);
    setPhase("signup");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    setSignupBusy(true);
    setError(null);
    const withChoice = answersWithChoice();
    writeStored(withChoice);
    const { error: otpError } = await createClient().auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: callbackUrl("/onboarding"),
        shouldCreateUser: true,
        // Gardées sur le compte : le lien peut être ouvert sur un autre appareil
        data: { onboarding: withChoice },
      },
    });
    setSignupBusy(false);
    if (otpError) {
      setError(readableAuthError(otpError.message, otpError.code));
      return;
    }
    play("success");
    buzz([15, 30, 15]);
    setPhase("sent");
  }

  // Préparation du programme (animation)
  useEffect(() => {
    if (phase !== "loading") return;
    const start = Date.now();
    const total = loadingMs;
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / total);
      // Progression irrégulière, plus naturelle
      setProgress(Math.round(100 * (t < 0.6 ? t * 1.15 : 0.69 + (t - 0.6) * 0.775)));
      if (t >= 1) {
        clearInterval(timer);
        if (mode === "app" && isPro) {
          router.push("/dashboard");
          return;
        }
        setPhase("paywall");
        play("success");
        buzz([20, 40, 30]);
        burstConfetti(80);
      }
    }, 80);
    return () => clearInterval(timer);
  }, [phase, isPro, router, mode, loadingMs]);

  const loadingStep = Math.floor((progress / 100) * LOADING_STEPS.length);
  useEffect(() => {
    if (phase === "loading" && loadingStep > 0 && loadingStep < LOADING_STEPS.length) {
      play("step");
      buzz(8);
    }
  }, [phase, loadingStep]);

  const plan = useMemo(() => {
    const perWeek = minutes >= 40 ? 6 : 5;
    const examDays = daysUntil(answers.exam_date);
    const subjects = (answers.subjects as string[] | undefined) ?? [];
    return {
      rhythm:
        `${fmtMinutes(minutes)} par jour, ${perWeek} jours sur 7` +
        ({ morning: ", le matin", afternoon: ", après les cours", evening: ", le soir", weekend: ", avec un peu plus le week-end" }[answers.when as string] ?? ""),
      goal: LABELS.goal?.[answers.goal as string] ?? "Progresser",
      exam: examDays === null ? EXAM_LABELS[answers.exam as string] ?? "" : "",
      examDays,
      examDate: examDays === null ? null : longDate(String(answers.exam_date)),
      examName: String(answers.exam_name ?? "").trim(),
      // Sessions possibles d'ici l'examen, au rythme choisi
      sessions: examDays === null ? 0 : Math.max(1, Math.round((examDays * perWeek) / 7)),
      subjects: subjects.length ? subjects.slice(0, 4).join(", ") + (subjects.length > 4 ? "…" : "") : "Tes matières",
      method:
        answers.struggle === "forget"
          ? "Répétition espacée : Revi te fait revoir chaque notion juste avant que tu l'oublies."
          : answers.struggle === "stress" || answers.stress === "very" || answers.stress === "panic"
            ? "Des quiz d'entraînement réguliers : tu arrives à l'examen en ayant déjà répondu à ce genre de questions."
          : answers.struggle === "procrastination"
            ? "Sessions courtes planifiées dans ton agenda, avec rappels, pour ne plus repousser."
            : answers.struggle === "start"
              ? "Importe ton cours : Revi le transforme en fiche, flashcards et quiz, dans le bon ordre."
              : answers.struggle === "time"
                ? `Des sessions de ${fmtMinutes(Math.min(minutes, 20))} pile, centrées sur ce que tu ne maîtrises pas encore.`
                : "Des quiz réguliers pour arriver à l'examen en confiance, sans bachotage de dernière minute.",
    };
  }, [answers, minutes]);

  const selected = PLANS.find((p) => p.id === planId) ?? PLANS[0];

  async function goPro(plan: PlanId = planId, cur: Currency = currency) {
    if (mode === "public") {
      choose(plan);
      return;
    }
    setCheckout("busy");
    setError(null);
    const { data, error: fnError } = await createClient().functions.invoke("billing", { body: { action: "checkout", plan, currency: cur } });
    if (fnError || !data?.url) {
      setError(fnError ? await readFunctionError(fnError, "Le paiement n'est pas disponible pour le moment.") : "Le paiement n'est pas disponible pour le moment.");
      setCheckout("idle");
      setPhase("paywall");
      return;
    }
    window.location.href = data.url;
  }

  const planCard = (
    <section className="card stack ob-plan">
      <h2>Ton programme Revizuno</h2>
      {plan.examDays !== null && plan.examDate ? (
        <div className="ob-countdown">
          <span className="ob-countdown-big">{plan.examDays === 0 ? "Jour J" : `J-${plan.examDays}`}</span>
          <span>
            <strong>{plan.examName || "Ton examen"}</strong> le {plan.examDate}
            <br />
            <span className="muted">
              {plan.sessions} session{plan.sessions > 1 ? "s" : ""} de {fmtMinutes(minutes)} d'ici là, au rythme que tu as choisi.
            </span>
          </span>
        </div>
      ) : null}
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
  );

  if (phase === "init") {
    return (
      <div className="ob-center">
        <div className="spinner" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (phase === "redirect") {
    return (
      <div className="ob-center fade-up">
        <div className="spinner" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1 className="ob-title">{checkout === "busy" ? "Ouverture du paiement sécurisé…" : "On prépare ton espace…"}</h1>
      </div>
    );
  }

  if (phase === "signup") {
    return (
      <div className="paywall fade-up">
        <div className="stack" style={{ gap: 8, textAlign: "center", justifyItems: "center" }}>
          <span className="pill">Dernière étape</span>
          <h1 className="ob-title">Crée ton compte</h1>
          <p className="muted">
            {choice && choice !== "free"
              ? `Pour activer ${PLANS.find((p) => p.id === choice)?.label ?? "Pro"} : tu passes ensuite directement au paiement sécurisé.`
              : "Pour retrouver ton programme et commencer à réviser gratuitement."}
          </p>
          <button type="button" className="link-btn small" onClick={() => setPhase("paywall")}>
            ← Changer d'offre
          </button>
        </div>
        <form className="card stack ob-signup" onSubmit={signUp}>
          <GoogleButton
            disabled={signupBusy}
            label="Créer mon compte avec Google"
            onClick={async () => {
              setSignupBusy(true);
              setError(null);
              // Réponses et offre choisie restent dans le navigateur pendant l'aller-retour chez Google
              writeStored(answersWithChoice());
              const message = await signInWithGoogle("/onboarding");
              if (message) {
                setError(message);
                setSignupBusy(false);
              }
            }}
          />
          <div className="divider">ou par e-mail</div>
          <label htmlFor="ob-email">
            Ton adresse e-mail
            <input
              id="ob-email"
              type="email"
              autoComplete="email"
              required
              placeholder="ton@email.ch"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={signupBusy}>
            {signupBusy ? "Envoi…" : "Créer mon compte gratuit"}
          </button>
          <p className="muted small" style={{ textAlign: "center" }}>
            Par e-mail, pas de mot de passe : on t'envoie un lien de connexion.
          </p>
          {error && <p className="notice error">{error}</p>}
        </form>
        <p className="muted small" style={{ textAlign: "center" }}>
          Déjà un compte ? <a href="/login">Se connecter</a> · <a href="/confidentialite">Confidentialité</a>
        </p>
      </div>
    );
  }

  if (phase === "sent") {
    return (
      <div className="ob-center fade-up">
        <span className="ob-emoji">📬</span>
        <h1 className="ob-title">Vérifie ta boîte mail</h1>
        <p className="muted" style={{ maxWidth: 440 }}>
          On a envoyé un lien à <strong>{email.trim()}</strong>. Clique dessus pour accéder à ton programme. Pense à regarder dans les spams.
        </p>
        <button type="button" className="link-btn" onClick={() => setPhase("signup")}>
          Changer d'adresse
        </button>
      </div>
    );
  }

  if (phase === "loading") {
    const stepDone = Math.floor((progress / 100) * LOADING_STEPS.length);
    return (
      <div className="ob-center fade-up">
        <div className="ob-ring" style={{ "--p": progress } as React.CSSProperties} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span>{progress}%</span>
        </div>
        <h1 className="ob-title">
          {loadingMs < 5000 ? "On finalise ton programme…" : name ? `${name}, on prépare ton programme…` : "On prépare ton programme…"}
        </h1>
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

        {planCard}

        <h2 className="pw-h2">Choisis ton plan.</h2>
        <div className="pw-plans" role="radiogroup" aria-label="Offres Revizuno Pro">
          {PLANS.map((p) => {
            const m = planMath(p, currency);
            const on = p.id === planId;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`pw-plan ${on ? "on" : ""}`}
                onClick={() => {
                  setPlanId(p.id);
                  play("select");
                  buzz(8);
                }}
              >
                {p.recommended ? <span className="pw-badge">Offre recommandée</span> : null}
                <span className="pw-radio" aria-hidden="true">
                  {on ? "✓" : ""}
                </span>
                <span className="pw-plan-main">
                  <strong>
                    {p.short}
                    {m.saving ? <span className="pw-save">−{m.saving} %</span> : null}
                  </strong>
                  <span>
                    {m.price} <span className="muted">/ {p.period}</span>
                  </span>
                  <span className="pw-tag">{p.months > 1 ? `soit ${m.perMonth} par mois` : "Sans engagement"}</span>
                </span>
                <span className="pw-perday">
                  <strong>{m.perDay}</strong>
                  <span className="muted">/ jour</span>
                </span>
              </button>
            );
          })}
        </div>

        <button type="button" className="pw-cta" onClick={() => goPro()} disabled={checkout === "busy"}>
          {checkout === "busy" ? "Ouverture du paiement…" : `Continuer avec ${selected.label}`}
        </button>
        {error && <p className="notice error">{error}</p>}
        <p className="pw-secure">🔒 Paiement sécurisé par Stripe · résiliable à tout moment</p>
        <p className="muted small" style={{ textAlign: "center", marginTop: -10 }}>
          Prix TTC en {currency === "chf" ? "francs suisses" : "euros"}, renouvelé automatiquement à la fin de chaque période.
        </p>

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

        <button type="button" className="pw-cta" onClick={() => goPro()} disabled={checkout === "busy"}>
          {checkout === "busy" ? "Ouverture du paiement…" : "Passer à Pro"}
        </button>

        <button type="button" className="pw-skip" onClick={() => (mode === "public" ? choose("free") : router.push("/dashboard"))}>
          Continuer avec la version gratuite
        </button>
      </div>
    );
  }

  const progressPct = Math.round((index / QUESTIONS.length) * 100);
  const value = answers[q.key];
  const raw = name ? q.title.replace("{name}", name) : q.title.replace("{name}, ", "").replace(" {name}", "");
  const title = raw.charAt(0).toUpperCase() + raw.slice(1);
  const quick = [
    { label: "Dans 1 semaine", days: 7 },
    { label: "Dans 2 semaines", days: 14 },
    { label: "Dans 1 mois", days: 30 },
    { label: "Dans 3 mois", days: 90 },
  ];

  return (
    <div className="ob">
      <div className="ob-top">
        <button type="button" className="ob-back" onClick={back} disabled={index === 0} aria-label="Question précédente">
          ‹
        </button>
        <div className="progress ob-progress" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.max(4, progressPct)}%` }} />
        </div>
        <button
          type="button"
          className="ob-sound"
          onClick={() => {
            const off = !soundOff;
            setMuted(off);
            setSoundOff(off);
            if (!off) play("select");
          }}
          aria-label={soundOff ? "Activer le son" : "Couper le son"}
          aria-pressed={!soundOff}
        >
          {soundOff ? "🔇" : "🔊"}
        </button>
      </div>

      {toast ? (
        <div className="ob-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className={`ob-q ${dir === "back" ? "ob-slide-back" : "ob-slide"}`} key={q.key}>
        {q.kind === "fact" ? <span className="ob-emoji">{q.emoji}</span> : null}
        <h1 className="ob-title">{title}</h1>
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
              onChange={(e) => {
                setAnswers({ ...answers, name: e.target.value });
                play("tap", 1 + Math.min(e.target.value.length, 12) * 0.04);
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={!String(value ?? "").trim()}>
              Continuer
            </button>
          </form>
        )}

        {q.kind === "single" && (
          <div className="ob-options stagger">
            {q.options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                className={`ob-option ${value === o.value ? "on" : ""}`}
                onClick={() => {
                  // Un seul passage à la question suivante, même en cas de double clic
                  if (advancing.current) return;
                  advancing.current = true;
                  setAnswers({ ...answers, [q.key]: o.value });
                  play("select", 1 + i * 0.06);
                  buzz(10);
                  setTimeout(() => {
                    advancing.current = false;
                    next({ [q.key]: o.value });
                  }, 320);
                }}
              >
                {o.emoji ? <span className="ob-opt-emoji">{o.emoji}</span> : null}
                <span className="ob-opt-label">{o.label}</span>
              </button>
            ))}
          </div>
        )}

        {q.kind === "multi" && (
          <>
            <div className="ob-options multi stagger">
              {q.options.map((o, i) => {
                const list = (value as string[] | undefined) ?? [];
                const on = list.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    className={`ob-option ${on ? "on" : ""}`}
                    aria-pressed={on}
                    onClick={() => {
                      setAnswers({ ...answers, [q.key]: on ? list.filter((x) => x !== o.value) : [...list, o.value] });
                      if (on) play("tap");
                      else play("select", 1 + (list.length + i * 0.2) * 0.05);
                      buzz(8);
                    }}
                  >
                    {o.emoji ? <span className="ob-opt-emoji">{o.emoji}</span> : null}
                    <span className="ob-opt-label">{o.label}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="btn btn-primary" disabled={!((value as string[] | undefined)?.length)} onClick={() => next()}>
              Continuer
            </button>
          </>
        )}

        {q.kind === "date" && (
          <div className="ob-date stack">
            <div className={`ob-countdown-card ${examDays !== null ? "set" : ""}`} aria-live="polite">
              {examDays !== null ? (
                <>
                  <span className="ob-countdown-big">{shownDays === 0 ? "Jour J" : `J-${shownDays}`}</span>
                  <span className="muted">{longDate(String(answers.exam_date))}</span>
                </>
              ) : (
                <>
                  <span className="ob-countdown-big muted">J-?</span>
                  <span className="muted">Choisis une date</span>
                </>
              )}
            </div>
            <div className="ob-chips">
              {quick.map((c) => {
                const iso = isoDay(new Date(today().getTime() + c.days * DAY_MS));
                return (
                  <button
                    key={c.label}
                    type="button"
                    className={`ob-chip ${answers.exam_date === iso ? "on" : ""}`}
                    onClick={() => {
                      setAnswers({ ...answers, exam_date: iso });
                      play("select");
                      buzz(8);
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <label className="ob-field">
              Date précise
              <input
                type="date"
                className="ob-input"
                min={isoDay(today())}
                value={typeof answers.exam_date === "string" && answers.exam_date !== "none" ? answers.exam_date : ""}
                onChange={(e) => {
                  setAnswers({ ...answers, exam_date: e.target.value });
                  if (e.target.value) play("select");
                }}
              />
            </label>
            <label className="ob-field">
              Quel examen ? <span className="muted">(facultatif)</span>
              <input
                className="ob-input"
                maxLength={60}
                placeholder="Bac, partiel de bio, examen de droit…"
                value={String(answers.exam_name ?? "")}
                onChange={(e) => setAnswers({ ...answers, exam_name: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={examDays === null}
              onClick={() => next({ exam: examBucket(examDays) })}
            >
              Continuer
            </button>
            <button type="button" className="link-btn" onClick={() => next({ exam_date: "none", exam: "none" })}>
              Pas d'examen prévu pour l'instant
            </button>
          </div>
        )}

        {q.kind === "slider" && (
          <div className="ob-slider stack">
            <div className="ob-slider-value" aria-live="polite">
              <span className="ob-slider-emoji" key={minutesEmoji(minutes)}>
                {minutesEmoji(minutes)}
              </span>
              <strong>{fmtMinutes(minutes)}</strong>
              <span className="muted">par jour · environ {fmtMinutes(minutes * (minutes >= 40 ? 6 : 5))} par semaine</span>
            </div>
            <input
              type="range"
              className="ob-range"
              min={q.min}
              max={q.max}
              step={q.step}
              value={minutes}
              style={{ "--fill": `${((minutes - q.min) / (q.max - q.min)) * 100}%` } as React.CSSProperties}
              aria-label="Minutes de révision par jour"
              onChange={(e) => {
                const v = Number(e.target.value);
                setAnswers({ ...answers, minutes: String(v) });
                play("tick", 0.8 + (v / q.max) * 0.8);
                buzz(4);
              }}
            />
            <div className="ob-range-scale muted small">
              <span>{q.min} min</span>
              <span>{fmtMinutes(q.max)}</span>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => next({ minutes: String(minutes) })}>
              Continuer
            </button>
          </div>
        )}

        {q.kind === "hold" && (
          <div className="stack" style={{ justifyItems: "center", gap: 18 }}>
            <HoldButton onDone={() => next({ commit: "yes" })} />
            <button type="button" className="link-btn small" onClick={() => next({ commit: "try" })}>
              Je vais juste essayer
            </button>
          </div>
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
