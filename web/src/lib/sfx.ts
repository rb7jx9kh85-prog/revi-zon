// Petits sons du questionnaire, synthétisés dans le navigateur (aucun fichier audio).
// Le son se coupe avec le bouton du questionnaire ; le choix est gardé dans le navigateur.

type Sound = "tap" | "select" | "next" | "tick" | "step" | "success" | "milestone" | "back";

const MUTE_KEY = "revizuno.sound";
let ctx: AudioContext | null = null;
let muted: boolean | null = null;

export function isMuted(): boolean {
  if (muted !== null) return muted;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "off";
  } catch {
    muted = false;
  }
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "off" : "on");
  } catch {
    // stockage indisponible : le choix vaut pour cette visite
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// Une note courte : fréquence de départ (et d'arrivée), forme, volume, durée en secondes
function note(a: AudioContext, at: number, freq: number, opts: { to?: number; type?: OscillatorType; gain?: number; dur?: number } = {}) {
  const { to, type = "sine", gain = 0.12, dur = 0.12 } = opts;
  const osc = a.createOscillator();
  const vol = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  vol.gain.setValueAtTime(0.0001, at);
  vol.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  vol.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(vol).connect(a.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function play(sound: Sound, pitch = 1) {
  if (isMuted()) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.005;
  switch (sound) {
    case "tap":
      note(a, t, 900 * pitch, { to: 600 * pitch, type: "triangle", gain: 0.08, dur: 0.05 });
      break;
    case "select":
      note(a, t, 660 * pitch, { to: 990 * pitch, type: "sine", gain: 0.14, dur: 0.09 });
      note(a, t + 0.05, 1320 * pitch, { type: "triangle", gain: 0.05, dur: 0.08 });
      break;
    case "next":
      note(a, t, 440 * pitch, { to: 880 * pitch, type: "sine", gain: 0.07, dur: 0.12 });
      break;
    case "back":
      note(a, t, 700, { to: 420, type: "sine", gain: 0.06, dur: 0.1 });
      break;
    case "tick":
      note(a, t, 1200 * pitch, { type: "square", gain: 0.025, dur: 0.025 });
      break;
    case "step":
      note(a, t, 784, { type: "triangle", gain: 0.1, dur: 0.1 });
      note(a, t + 0.07, 1175, { type: "triangle", gain: 0.08, dur: 0.14 });
      break;
    case "milestone":
      [523, 659, 784].forEach((f, i) => note(a, t + i * 0.07, f, { type: "triangle", gain: 0.09, dur: 0.16 }));
      break;
    case "success":
      [523, 659, 784, 1047].forEach((f, i) => note(a, t + i * 0.09, f, { type: "triangle", gain: 0.11, dur: 0.28 }));
      note(a, t + 0.36, 1568, { type: "sine", gain: 0.05, dur: 0.5 });
      break;
  }
}

// Petite vibration sur les téléphones qui le permettent
export function buzz(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    // vibration non disponible
  }
}
