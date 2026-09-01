# Design — Page 404 (NotFoundPage)

**Date** : 2026-09-01
**Statut** : Approuvé par l'utilisateur
**Portée** : Une seule page 404 globale pour toutes les zones (site public, app, portail client)

## Contexte

Aujourd'hui, toute URL inconnue est silencieusement redirigée vers `/` via
`<Route path="*" element={<Navigate to="/" replace />} />` dans `App.tsx:191`.
Cela masque les erreurs de saisie et les liens cassés : l'utilisateur atterrit
sur l'accueil sans comprendre pourquoi.

## Décisions

- **Une 404 globale autonome** (choix A) : une seule page pour toutes les zones.
  La variante « intégrée à AppLayout » a été écartée car détecter la zone d'une
  URL inconnue est par définition une devinette peu fiable.
- **Contenu simple + liens utiles** : pas de recherche, pas de liens modules.
- **Style autonome** dans l'identité du projet (palette `primary`, Plus Jakarta
  Sans), indépendant d'AppLayout — accessible aux visiteurs non connectés comme
  aux utilisateurs connectés.

## Architecture

- **Nouveau fichier** : `frontend/src/pages/NotFoundPage.tsx`
- **Routeur** (`App.tsx`) :
  - lazy import ajouté avec les autres imports lazy, dans une section « 404 » :
    `const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));`
  - la route catch-all (dernière route, ligne ~191) devient
    `<Route path="*" element={<NotFoundPage />} />`
- Aucun autre fichier modifié.

## Composant

Page plein écran, fond `bg`, contenu centré (flex column) :

1. **« 404 »** en très grand, `text-primary`
2. **« Page introuvable »** en `font-page-title`
3. Message : « L'URL que vous avez saisie n'existe pas ou a été déplacée. »
4. Boutons :
   - « Retour à l'accueil » (primaire, `bg-primary-accent`) → `/`
   - « Se connecter » (secondaire, bordure) → `/login`
5. Lien « Besoin d'aide ? Contactez le support » → `/support`, `text-text-muted`
6. Animation `animate-fade-up` à l'entrée (déjà définie dans `tailwind.config.js`)

## SEO & comportement

- `PageSEO` avec `title="Page introuvable"` et `noindex` (une 404 ne doit pas
  être indexée).
- La page est en dehors du `Route` parent gardé par `AuthGuard`/`RoleGuard` :
  accessible sans authentification.
- Aucun appel API, aucune donnée : offline-safe par nature.

## Gestion d'erreurs

Composant statique, sans props ni data fetching : aucun état d'erreur possible.

## Tests

`frontend/src/pages/NotFoundPage.test.tsx` (pattern des tests existants, ex.
`PortalHomePage.test.tsx`) :

- rend le « 404 »
- rend le titre « Page introuvable »
- contient les liens `/`, `/login`, `/support`
