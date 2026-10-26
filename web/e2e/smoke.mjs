// Test de bout en bout de Revi-zon sur un déploiement réel (Playwright).
// Variables : BASE_URL, SUPABASE_URL, SUPABASE_KEY, E2E_EMAIL, E2E_PASSWORD,
// PHASE ("upload" ou "study"), STUDY_ID (phase study), PAY=1 (paiement test),
// SHARE_URL (lien de partage Vercel pour une prévisualisation protégée).
import { chromium } from "playwright";
import { createServerClient } from "@supabase/ssr";

const BASE = process.env.BASE_URL.replace(/\/$/, "");
const PHASE = process.env.PHASE || "upload";
const results = [];
const log = (step, ok, detail = "") => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"} ${step}${detail ? " — " + detail : ""}`);
};

async function sessionCookies() {
  const jar = new Map();
  const supabase = createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD });
  if (error) throw new Error("connexion test : " + error.message);
  const host = new URL(BASE).hostname;
  return [...jar].map(([name, value]) => ({ name, value, domain: host, path: "/", sameSite: "Lax", secure: BASE.startsWith("https") }));
}

function watch(page, label) {
  page.on("console", (m) => m.type() === "error" && results.push({ step: `console ${label}`, ok: false, detail: m.text().slice(0, 300) }));
  page.on("pageerror", (e) => results.push({ step: `pageerror ${label}`, ok: false, detail: String(e).slice(0, 300) }));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 500 || (r.status() === 404 && !u.includes("favicon"))) results.push({ step: `http ${label}`, ok: false, detail: `${r.status()} ${u}` });
  });
}

async function noHorizontalScroll(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  log(`mobile sans débordement ${label}`, over <= 1, `${over}px`);
}

// Prévisualisation protégée : le lien de partage dépose un cookie d'accès
async function prime(context) {
  if (!process.env.SHARE_URL) return;
  const p = await context.newPage();
  await p.goto(process.env.SHARE_URL);
  await p.close();
}

const browser = await chromium.launch();
try {
  const anon = await browser.newContext();
  await prime(anon);
  const p0 = await anon.newPage();
  watch(p0, "public");
  for (const path of ["/", "/login", "/pricing"]) {
    const r = await p0.goto(BASE + path, { waitUntil: "networkidle" });
    log(`page publique ${path}`, r.status() === 200, String(r.status()));
  }
  await p0.goto(BASE + "/dashboard");
  log("dashboard protégé", p0.url().includes("/login"), p0.url());
  await p0.goto(BASE + "/");
  const cta = await p0.locator('a[href="/dashboard"]').first().getAttribute("href");
  log("bouton landing vers l'app", cta === "/dashboard", cta);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await prime(ctx);
  await ctx.addCookies(await sessionCookies());
  const page = await ctx.newPage();
  watch(page, "connecté");

  if (PHASE === "upload") {
    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    log("dashboard connecté", (await page.locator("h1").innerText()).includes("Salut"), await page.locator("h1").innerText());

    await page.fill("#display_name", "E2E");
    await page.selectOption("#school_level", "Université / Haute école");
    await page.click('form button[type="submit"]:has-text("Enregistrer")');
    await page.waitForSelector("text=Profil enregistré.", { timeout: 15000 }).then(
      () => log("profil enregistré", true),
      () => log("profil enregistré", false),
    );

    await page.goto(BASE + "/dashboard/new", { waitUntil: "networkidle" });
    await page.click("text=Coller du texte");
    await page.fill("#paste", "La photosynthèse est le processus par lequel les plantes vertes transforment l'énergie lumineuse en énergie chimique. Elle se déroule dans les chloroplastes, grâce à la chlorophylle. Les plantes absorbent du dioxyde de carbone et de l'eau, et produisent du glucose et du dioxygène. L'équation bilan est : 6 CO2 + 6 H2O donne C6H12O6 + 6 O2. La phase lumineuse a lieu dans les thylakoïdes, le cycle de Calvin dans le stroma.");
    await page.fill("#title", "Test E2E photosynthèse");
    await page.click('button:has-text("Créer mon set de révision")');
    await page.waitForURL(/\/study\/[0-9a-f-]{36}/, { timeout: 30000 }).then(
      () => log("import puis redirection", true, page.url()),
      async () => log("import puis redirection", false, (await page.locator(".notice.error").allInnerTexts()).join(" | ")),
    );
    await page.waitForSelector("text=/Revi prépare|préparation a échoué/", { timeout: 30000 }).then(
      async () => log("écran de préparation", true, (await page.locator("main h2").first().innerText())),
      () => log("écran de préparation", false),
    );
    // L'IA prend en général 20 à 90 s
    await page.waitForSelector("text=/maîtrisé|préparation a échoué/", { timeout: 240000 }).then(
      async () => {
        const failed = (await page.locator("text=préparation a échoué").count()) > 0;
        log("génération par l'IA", !failed, (await page.locator(".study-main").innerText()).slice(0, 200).replace(/\s+/g, " "));
      },
      () => log("génération par l'IA", false, "pas terminée après 4 min"),
    );
    console.log("STUDY_ID=" + (page.url().match(/study\/([0-9a-f-]{36})/) || [])[1]);
  } else {
    const id = process.env.STUDY_ID;
    const base = `${BASE}/study/${id}`;
    await page.goto(base, { waitUntil: "networkidle" });
    log("vue d'ensemble", (await page.locator("text=maîtrisé").count()) > 0);

    await page.goto(base + "/flashcards", { waitUntil: "networkidle" });
    const before = await page.locator(".session-label").innerText();
    await page.click(".fc");
    await page.click('button:has-text("Je savais")');
    const after = await page.locator(".session-label, .done h2").first().innerText();
    log("flashcards", before !== after, `${before} -> ${after}`);

    await page.goto(base + "/quiz", { waitUntil: "networkidle" });
    await page.locator(".option").first().click();
    await page.waitForSelector(".feedback", { timeout: 5000 }).then(
      async () => log("quiz", true, await page.locator(".verdict").innerText()),
      () => log("quiz", false),
    );

    await page.goto(base + "/blanks", { waitUntil: "networkidle" });
    const inputs = page.locator(".blank input");
    const n = await inputs.count();
    for (let i = 0; i < n; i++) await inputs.nth(i).fill("chlorophylle");
    await page.click('button:has-text("Valider")');
    await page.waitForSelector(".verdict", { timeout: 5000 }).then(
      async () => log("textes à trous", true, await page.locator(".verdict").innerText()),
      () => log("textes à trous", false),
    );

    await page.goto(base + "/notes", { waitUntil: "networkidle" });
    log("fiche", (await page.locator(".sheet-title").count()) === 1);

    await page.fill("#chat-input", "Où a lieu la photosynthèse ?");
    await page.click(".send-btn");
    await page.waitForSelector(".bubble.bot:not(.typing), .chat .notice.error", { timeout: 60000 }).then(
      async () => log("chat", true, (await page.locator(".bubble.bot:not(.typing), .chat .notice.error").last().innerText()).slice(0, 160)),
      () => log("chat", false),
    );

    // Explique avec tes mots
    await page.goto(base + "/explain", { waitUntil: "networkidle" });
    await page.fill("#explain-input", "C'est le processus par lequel les plantes utilisent la lumière pour fabriquer du sucre à partir de CO2 et d'eau, en rejetant de l'oxygène.");
    await page.click('button:has-text("Envoyer à Revi")');
    await page.waitForSelector(".score-ring", { timeout: 60000 }).then(
      async () => log("explique avec tes mots", true, `${await page.locator(".score-ring").innerText()}/100 · ${(await page.locator(".fb-verdict").innerText()).slice(0, 100)}`),
      async () => log("explique avec tes mots", false, (await page.locator(".notice.error").allInnerTexts()).join(" | ")),
    );

    // Résumé
    await page.goto(base + "/summary", { waitUntil: "networkidle" });
    await page.waitForSelector(".summary-md h3", { timeout: 90000 }).then(
      async () => log("résumé", true, (await page.locator(".summary-md h3").allInnerTexts()).join(" / ").slice(0, 160)),
      async () => log("résumé", false, (await page.locator(".notice.error").allInnerTexts()).join(" | ")),
    );

    // Export PDF
    await page.goto(base + "/pdf", { waitUntil: "networkidle" });
    await page.click('.theme-card:has-text("Pastel")');
    const download = page.waitForEvent("download", { timeout: 90000 }).catch(() => null);
    await page.click('button:has-text("Générer et télécharger")');
    const file = await download;
    if (file) {
      const path = await file.path();
      const { statSync, readFileSync } = await import("node:fs");
      const size = path ? statSync(path).size : 0;
      const head = path ? readFileSync(path).subarray(0, 5).toString() : "";
      log("export PDF", head === "%PDF-" && size > 5000, `${file.suggestedFilename()} · ${Math.round(size / 1024)} Ko`);
    } else log("export PDF", false, (await page.locator(".notice.error").allInnerTexts()).join(" | "));

    // Studio Revi (réponse en flux)
    await page.goto(BASE + "/studio", { waitUntil: "networkidle" });
    await page.fill("#studio-input", "Explique-moi la photosynthèse en 2 phrases.");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const bots = document.querySelectorAll(".bot-row .bubble.bot .md");
      return bots.length > 0 && (bots[bots.length - 1].textContent ?? "").length > 40 && document.querySelector(".copy-btn");
    }, null, { timeout: 60000 }).then(
      async () => log("studio revi", true, (await page.locator(".bot-row .md").last().innerText()).slice(0, 140).replace(/\s+/g, " ")),
      async () => log("studio revi", false, (await page.locator(".notice.error").allInnerTexts()).join(" | ")),
    );
    log("studio conversation enregistrée", (await page.locator(".thread").count()) > 0, page.url());

    // Tableau de bord : planifier une session
    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    await page.waitForSelector(".cal-day", { timeout: 15000 });
    log("calendrier", (await page.locator(".cal-day").count()) === 42, `${await page.locator(".kpi .stat").first().innerText()} jour(s) de série`);
    await page.click('button:has-text("Planifier une session")');
    await page.click('form.plan-form button[type="submit"]');
    await page.waitForSelector(".session-item a:has-text('Google Agenda')", { timeout: 15000 }).then(
      async () => log("session planifiée + lien agenda", true, ((await page.locator(".session-item a:has-text('Google Agenda')").first().getAttribute("href")) ?? "").slice(0, 80)),
      async () => log("session planifiée + lien agenda", false, (await page.locator(".plan-form .notice").allInnerTexts()).join(" | ")),
    );

    await page.goto(BASE + "/pricing", { waitUntil: "networkidle" });
    await page.click('button:has-text("Passer à Pro")');
    const onStripe = await page.waitForURL(/checkout\.stripe\.com/, { timeout: 20000 }).then(
      () => (log("redirection Stripe", true), true),
      async () => (log("redirection Stripe", false, (await page.locator(".notice.error").allInnerTexts()).join(" | ")), false),
    );
    if (onStripe && process.env.PAY === "1") {
      // Carte de test Stripe
      await page.waitForSelector("#cardNumber", { timeout: 30000 });
      await page.fill("#cardNumber", "4242424242424242");
      await page.fill("#cardExpiry", "12 / 34");
      await page.fill("#cardCvc", "123");
      if (await page.locator("#billingName").count()) await page.fill("#billingName", "Testeur E2E");
      if (await page.locator("#billingPostalCode").isVisible().catch(() => false)) await page.fill("#billingPostalCode", "1000");
      const optOut = page.locator("#enableStripePass");
      if (await optOut.isChecked().catch(() => false)) await optOut.uncheck().catch(() => {});
      await page.click(".SubmitButton, button[type=submit]");
      await page.waitForURL(/\/billing\/success/, { timeout: 90000 }).then(
        () => log("paiement test accepté", true, page.url().split("?")[0]),
        async () => log("paiement test accepté", false, page.url() + " " + (await page.locator("[role=alert], .FieldError").allInnerTexts()).join(" | ")),
      );
      await page.waitForURL(/\/dashboard/, { timeout: 60000 }).then(
        async () => log("passage en Pro puis tableau de bord", true, page.url()),
        async () => log("passage en Pro puis tableau de bord", false, (await page.locator("main").innerText()).slice(0, 200).replace(/\s+/g, " ")),
      );
    }

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await prime(mobile);
    await mobile.addCookies(await sessionCookies());
    const m = await mobile.newPage();
    for (const path of ["/", "/dashboard", `/study/${id}/quiz`, `/study/${id}/pdf`, "/studio", "/pricing"]) {
      await m.goto(BASE + path, { waitUntil: "networkidle" });
      await noHorizontalScroll(m, path);
    }
  }
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nRÉSUMÉ ${results.length - failed.length} OK, ${failed.length} échecs`);
  for (const f of failed) console.log("  ✗", f.step, "—", f.detail);
}
