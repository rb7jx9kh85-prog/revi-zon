import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
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
