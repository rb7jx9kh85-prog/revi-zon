import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Comment Revizuno traite tes données personnelles : données collectées, prestataires, durées de conservation et tes droits.",
};

const PROVIDERS = [
  {
    name: "Supabase",
    entity: "Supabase, Inc. (États-Unis)",
    role: "Base de données, comptes et connexion, stockage de tes fichiers de cours, fonctions serveur, envoi des e-mails de connexion.",
    data: "E-mail, profil, cours importés, contenus générés, progression, conversations, adresse IP (journaux).",
    location: "Données hébergées dans l'Union européenne (Irlande).",
    policy: "https://supabase.com/privacy",
  },
  {
    name: "Vercel",
    entity: "Vercel Inc. (États-Unis)",
    role: "Hébergement du site et exécution des pages serveur.",
    data: "Adresse IP, navigateur, pages consultées (journaux techniques), données affichées dans les pages.",
    location: "Serveurs aux États-Unis et réseau de diffusion mondial.",
    policy: "https://vercel.com/legal/privacy-policy",
  },
  {
    name: "OpenAI",
    entity: "OpenAI (États-Unis)",
    role: "Intelligence artificielle : analyse de tes cours, génération des fiches, flashcards, quiz, résumés, corrections et réponses de Revi.",
    data: "Contenu de tes cours (texte, PDF, photos), tes questions et explications, ton prénom et ton niveau d'études s'ils sont renseignés.",
    location: "États-Unis.",
    policy: "https://openai.com/policies/privacy-policy",
  },
  {
    name: "Stripe",
    entity: "Stripe Payments Europe, Ltd. (Irlande) et Stripe, Inc. (États-Unis)",
    role: "Paiement et gestion de l'abonnement Pro, factures.",
    data: "E-mail, moyen de paiement, adresse de facturation, historique des paiements. Nous ne voyons jamais ton numéro de carte.",
    location: "Union européenne et États-Unis.",
    policy: "https://stripe.com/privacy",
  },
  {
    name: "Google Fonts",
    entity: "Google Ireland Ltd. / Google LLC",
    role: "Polices de caractères de la page d'accueil.",
    data: "Adresse IP et informations techniques du navigateur, au chargement de la page d'accueil.",
    location: "Union européenne et États-Unis.",
    policy: "https://policies.google.com/privacy",
  },
  {
    name: "jsDelivr",
    entity: "jsDelivr (réseau public de diffusion de fichiers)",
    role: "Téléchargement des polices utilisées dans tes PDF, uniquement quand tu génères un PDF.",
    data: "Adresse IP et informations techniques du navigateur.",
    location: "Réseau mondial.",
    policy: "https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net",
  },
];

export default function PrivacyPage() {
  return (
    <main className="page narrow legal">
      <header className="topbar">
        <a href="/" className="brand">
          <img src="/logo-mark.png" alt="" width={40} height={36} />
          Revizuno
        </a>
        <Link href="/dashboard" className="btn btn-ghost btn-inline">
          Mon espace
        </Link>
      </header>

      <div className="stack" style={{ gap: 8 }}>
        <span className="kicker">Dernière mise à jour : {LEGAL.updatedAt}</span>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
          Politique de <span className="mark">confidentialité</span>
        </h1>
        <p className="muted">
          Cette politique explique quelles données personnelles Revizuno traite, pourquoi, avec quels prestataires, combien de temps, et
          quels sont tes droits. Elle respecte la loi fédérale suisse sur la protection des données (LPD) et, lorsqu'il s'applique, le
          Règlement général européen sur la protection des données (RGPD).
        </p>
      </div>

      <section className="card stack legal-summary">
        <h2>En bref</h2>
        <ul>
          <li>Nous traitons tes données uniquement pour faire fonctionner Revizuno : ton compte, tes cours et tes révisions.</li>
          <li>Pas de publicité, pas de revente de données, pas de traceurs ni de mesure d'audience.</li>
          <li>Tes cours sont analysés par l'IA d'OpenAI pour créer tes exercices ; ils ne servent pas à entraîner ses modèles.</li>
          <li>Tu peux demander à tout moment une copie ou la suppression de tes données : {LEGAL.email}.</li>
        </ul>
      </section>

      <section className="stack">
        <h2>1. Responsable du traitement</h2>
        <p>
          Revizuno est exploité par <strong>{LEGAL.operator}</strong> ({LEGAL.country}). Pour toute question sur tes données ou pour exercer
          tes droits, écris à <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </p>
      </section>

      <section className="stack">
        <h2>2. Données que nous traitons</h2>
        <ul>
          <li>
            <strong>Compte</strong> : adresse e-mail, prénom ou pseudo, niveau d'études, langue. Si tu te connectes avec Google (lorsque
            cette option est disponible) : ton nom, ton e-mail et ta photo de profil Google.
          </li>
          <li>
            <strong>Cours</strong> : les fichiers que tu importes (PDF, photos), le texte collé et le texte extrait, ainsi que les contenus
            générés (fiches, résumés, flashcards, quiz, textes à trous).
          </li>
          <li>
            <strong>Révisions</strong> : tes réponses aux exercices, tes explications « avec tes mots » et leur note, ton temps de réponse,
            ton planning de répétition espacée et les sessions de révision que tu planifies.
          </li>
          <li>
            <strong>Conversations</strong> : tes messages avec Revi dans Studio Revi (enregistrés pour que tu retrouves ton historique). Les
            questions posées dans le chat d'un cours ne sont pas enregistrées par Revizuno.
          </li>
          <li>
            <strong>Abonnement</strong> : identifiant client Stripe, statut et dates de l'abonnement. Les données de paiement sont traitées par
            Stripe.
          </li>
          <li>
            <strong>Usage et technique</strong> : nombre de cours importés et volume d'IA utilisé (pour les limites de ton offre), adresse
            IP, type de navigateur et journaux techniques (sécurité et diagnostic).
          </li>
        </ul>
        <p className="muted">
          Évite d'importer des documents contenant des données sensibles (santé, données d'autres personnes) : ils seraient traités comme le
          reste de tes cours.
        </p>
      </section>

      <section className="stack">
        <h2>3. Pourquoi nous les traitons</h2>
        <ul>
          <li>
            <strong>Fournir le service</strong> (exécution du contrat) : créer ton compte, te connecter, préparer tes cours avec l'IA, suivre
            ta progression, gérer ton abonnement.
          </li>
          <li>
            <strong>Sécurité et bon fonctionnement</strong> (intérêt légitime) : prévenir les abus, corriger les erreurs, faire respecter les
            limites de chaque offre.
          </li>
          <li>
            <strong>Obligations légales</strong> : comptabilité et fiscalité liées aux paiements.
          </li>
        </ul>
        <p>
          Aucune décision ayant des effets juridiques n'est prise de manière automatisée. Les notes et corrections de l'IA sont une aide à
          l'apprentissage et peuvent contenir des erreurs.
        </p>
      </section>

      <section className="stack">
        <h2>4. Nos prestataires</h2>
        <p>
          Nous faisons appel aux prestataires suivants, qui traitent des données pour notre compte, selon nos instructions et des
          engagements de confidentialité et de sécurité :
        </p>
        <div className="provider-grid">
          {PROVIDERS.map((p) => (
            <article key={p.name} className="provider">
              <h3>{p.name}</h3>
              <p className="muted small">{p.entity}</p>
              <dl>
                <dt>Rôle</dt>
                <dd>{p.role}</dd>
                <dt>Données</dt>
                <dd>{p.data}</dd>
                <dt>Lieu</dt>
                <dd>{p.location}</dd>
              </dl>
              <a href={p.policy} target="_blank" rel="noopener noreferrer" className="small">
                Politique de confidentialité de {p.name}
              </a>
            </article>
          ))}
        </div>
        <p>
          Pour la prévention de la fraude et ses obligations légales, Stripe traite certaines données en tant que responsable indépendant,
          selon sa propre politique. Si tu cliques sur « Google Agenda » pour ajouter une session de révision, les informations de la
          session sont transmises à Google selon ses propres conditions ; le fichier « .ics » est, lui, créé directement sur ton appareil.
        </p>
      </section>

      <section className="stack">
        <h2>5. Transferts à l'étranger</h2>
        <p>
          Certains prestataires sont situés aux États-Unis ou y accèdent aux données. Ces transferts sont encadrés par des garanties
          reconnues par le Préposé fédéral à la protection des données et à la transparence (PFPDT) et par la Commission européenne :
          clauses contractuelles types et, le cas échéant, certification du prestataire au Swiss-U.S. / EU-U.S. Data Privacy Framework.
        </p>
      </section>

      <section className="stack">
        <h2>6. Durée de conservation</h2>
        <ul>
          <li>
            <strong>Compte, cours, révisions et conversations</strong> : tant que ton compte existe. Sur demande, nous les supprimons dans un
            délai de 30 jours, y compris les copies de tes fichiers chez OpenAI.
          </li>
          <li>
            <strong>Données traitées par OpenAI</strong> : les requêtes peuvent être conservées par OpenAI jusqu'à 30 jours pour la détection
            des abus, puis sont supprimées. Elles ne servent pas à entraîner ses modèles.
          </li>
          <li>
            <strong>Sauvegardes</strong> : les sauvegardes techniques de la base de données sont écrasées automatiquement après quelques
            jours.
          </li>
          <li>
            <strong>Journaux techniques</strong> : quelques jours à quelques semaines selon le prestataire.
          </li>
          <li>
            <strong>Paiements</strong> : les pièces comptables sont conservées 10 ans, comme l'exige le droit suisse.
          </li>
        </ul>
      </section>

      <section className="stack">
        <h2>7. Cookies</h2>
        <p>
          Revizuno utilise uniquement des cookies strictement nécessaires : ils gardent ta session ouverte une fois connecté. Aucun cookie de
          publicité, de mesure d'audience ou de suivi. La page de paiement de Stripe, hébergée par Stripe, utilise ses propres cookies pour la
          sécurité des paiements.
        </p>
      </section>

      <section className="stack">
        <h2>8. Sécurité</h2>
        <p>
          Les échanges sont chiffrés (HTTPS). Chaque compte n'a accès qu'à ses propres données grâce à un cloisonnement appliqué directement
          dans la base de données. Les clés d'accès aux services (IA, paiement) restent côté serveur et ne sont jamais envoyées à ton
          navigateur.
        </p>
      </section>

      <section className="stack">
        <h2>9. Tes droits</h2>
        <p>Tu peux à tout moment :</p>
        <ul>
          <li>obtenir une copie de tes données et des informations sur leur traitement (droit d'accès) ;</li>
          <li>les faire corriger ou compléter ;</li>
          <li>les faire supprimer, ainsi que ton compte ;</li>
          <li>les recevoir dans un format courant pour les transférer ailleurs (portabilité) ;</li>
          <li>t'opposer à un traitement ou en demander la limitation.</li>
        </ul>
        <p>
          Écris à <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> depuis l'adresse de ton compte ; nous répondons dans un délai de 30
          jours. Tu peux aussi déposer une plainte auprès du{" "}
          <a href="https://www.edoeb.admin.ch" target="_blank" rel="noopener noreferrer">
            Préposé fédéral à la protection des données et à la transparence (PFPDT)
          </a>{" "}
          ou, si tu vis dans l'Union européenne, auprès de l'autorité de protection des données de ton pays.
        </p>
      </section>

      <section className="stack">
        <h2>10. Mineurs</h2>
        <p>
          Revizuno s'adresse aussi aux élèves. Si tu as moins de 16 ans, utilise Revizuno avec l'accord de tes parents ou de ton
          représentant légal, en particulier pour souscrire l'offre Pro.
        </p>
      </section>

      <section className="stack">
        <h2>11. Modifications</h2>
        <p>
          Nous pouvons mettre à jour cette politique, par exemple si nous ajoutons un prestataire. La date en haut de la page indique la
          dernière version ; en cas de changement important, nous t'en informerons dans l'application ou par e-mail.
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
