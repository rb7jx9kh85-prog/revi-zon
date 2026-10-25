# Revi-zon

Application de révision propulsée par l'IA : l'étudiant importe ses cours (PDF, photos, notes) et l'app génère des flashcards, des textes à trous, des quiz et des fiches de révision adaptés à son niveau.

## Contenu du repo

- `landing/` : landing page statique (HTML/CSS/JS dans un seul fichier, sans dépendance).
  - `landing/index.html` : la page. Le bloc `CONFIG` en haut du script règle le nombre d'étudiants, les avis, les liens des boutons et le bandeau d'établissements.
  - `landing/assets/` : logo (symbole, favicon, fichier d'origine).
- `web/` : app web Next.js (connexion, espace étudiant). Voir `web/README.md`.

## Lancer la landing en local

```bash
cd landing
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```
