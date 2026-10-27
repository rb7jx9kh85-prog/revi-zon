import type { NextConfig } from "next";

// Adresse officielle du site : les anciennes adresses Vercel y renvoient,
// pour que les liens de connexion reçus par e-mail ramènent toujours ici.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.revizuno.com").replace(/\/$/, "");
const LEGACY_HOSTS = ["revizuno.vercel.app", "revi-zon.vercel.app"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      ...LEGACY_HOSTS.map((host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        destination: `${SITE_URL}/:path*`,
        permanent: true,
      })),
      // Si Supabase renvoie sur l'accueil (adresse de retour non autorisée), on termine quand même la connexion.
      { source: "/", has: [{ type: "query", key: "code" }], destination: "/auth/callback", permanent: false },
    ];
  },
  async rewrites() {
    return {
      // La landing (HTML statique dans public/landing) est la page d'accueil du site.
      beforeFiles: [{ source: "/", destination: "/landing/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
