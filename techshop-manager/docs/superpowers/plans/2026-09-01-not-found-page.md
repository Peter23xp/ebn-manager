# Page 404 (NotFoundPage) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la redirection silencieuse `* → /` par une véritable page 404 autonome avec liens utiles.

**Architecture:** Un seul composant React statique (`NotFoundPage`) rendu sur la route catch-all `*` de `App.tsx`. Page hors zones gardées (accessible sans auth), style autonome dans l'identité du projet, SEO `noindex` via `PageSEO`.

**Tech Stack:** React 18, React Router 6, TailwindCSS 3, react-helmet-async (`PageSEO`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-01-not-found-page-design.md`

## Global Constraints

- Textes en français : « 404 », « Page introuvable », « L'URL que vous avez saisie n'existe pas ou a été déplacée. », « Retour à l'accueil », « Se connecter », « Besoin d'aide ? Contactez le support »
- Liens exacts : `/` (accueil), `/login` (connexion), `/support` (aide)
- SEO : `PageSEO` avec `title="Page introuvable"` et `noindex`
- Style : `text-primary` pour le 404, `font-page-title` pour le titre, `bg-primary-accent` pour le bouton primaire, `animate-fade-up` à l'entrée (toutes utilitaires déjà définis dans `frontend/tailwind.config.js`)
- Route catch-all : `<Route path="*" element={<NotFoundPage />} />` remplace `<Route path="*" element={<Navigate to="/" replace />} />` dans `frontend/src/App.tsx:191`
- La route `*` reste **en dehors** du `Route` parent gardé (AuthGuard/RoleGuard)
- Aucun appel API, aucun state, aucune props

---

### Task 1: Page 404 + route catch-all

**Files:**
- Create: `frontend/src/pages/NotFoundPage.tsx`
- Create: `frontend/src/pages/NotFoundPage.test.tsx`
- Modify: `frontend/src/App.tsx` (lazy import + route `*`)

**Interfaces:**
- Consumes: `PageSEO` (`import { PageSEO } from '@/components/seo/PageSEO'`), props `{ title?: string; description?: string; noindex?: boolean }`
- Produces: default export `NotFoundPage` (composant React sans props), consommé par `App.tsx` via `lazy()`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend/src/pages/NotFoundPage.test.tsx` :

```tsx
/**
 * NotFoundPage — rendu statique de la 404 globale
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import NotFoundPage from './NotFoundPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  test('affiche le 404', () => {
    renderPage();
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  test('affiche le titre Page introuvable', () => {
    renderPage();
    expect(screen.getByText('Page introuvable')).toBeInTheDocument();
  });

  test('affiche le message explicatif', () => {
    renderPage();
    expect(
      screen.getByText("L'URL que vous avez saisie n'existe pas ou a été déplacée."),
    ).toBeInTheDocument();
  });

  test('lie vers l\'accueil, la connexion et le support', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Retour à l\'accueil' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Contactez le support' })).toHaveAttribute('href', '/support');
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `cd frontend && npx vitest run src/pages/NotFoundPage.test.tsx`
Expected: FAIL — le fichier `NotFoundPage.tsx` n'existe pas encore (erreur d'import).

- [ ] **Step 3: Implémenter le composant**

Créer `frontend/src/pages/NotFoundPage.tsx` :

```tsx
import { Link } from 'react-router-dom';
import { PageSEO } from '@/components/seo/PageSEO';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-center">
      <PageSEO title="Page introuvable" noindex />

      <div className="animate-fade-up">
        <p className="text-8xl font-extrabold tracking-tight text-primary">404</p>
        <h1 className="mt-4 font-page-title text-text">Page introuvable</h1>
        <p className="mt-2 max-w-md text-body text-text-muted">
          L'URL que vous avez saisie n'existe pas ou a été déplacée.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="flex min-h-touch items-center justify-center rounded bg-primary-accent px-5 font-label text-white transition-colors hover:bg-primary"
          >
            Retour à l'accueil
          </Link>
          <Link
            to="/login"
            className="flex min-h-touch items-center justify-center rounded border border-border-strong px-5 font-label text-text transition-colors hover:bg-sidebar-hover"
          >
            Se connecter
          </Link>
        </div>

        <p className="mt-8 text-body text-text-muted">
          Besoin d'aide ?{' '}
          <Link to="/support" className="text-primary-accent underline hover:text-primary">
            Contactez le support
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `cd frontend && npx vitest run src/pages/NotFoundPage.test.tsx`
Expected: PASS — 4 tests passent.

- [ ] **Step 5: Brancher la route catch-all**

Dans `frontend/src/App.tsx` :

Ajouter le lazy import avec les autres imports (après le bloc « Home », ligne ~78) :

```tsx
// 404
const NotFoundPage   = lazy(() => import('@/pages/NotFoundPage'));
```

Remplacer (ligne ~191) :

```tsx
<Route path="*" element={<Navigate to="/" replace />} />
```

par :

```tsx
<Route path="*" element={<NotFoundPage />} />
```

`Navigate` reste importé (utilisé ailleurs ? non — vérifier : c'est son unique
usage dans `App.tsx`). Si `Navigate` n'est plus utilisé nulle part dans
`App.tsx`, retirer `Navigate` de l'import ligne 1 :

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
```

- [ ] **Step 6: Vérifier la compile + le test final**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/pages/NotFoundPage.test.tsx`
Expected: tsc sans erreur, 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/NotFoundPage.tsx frontend/src/pages/NotFoundPage.test.tsx frontend/src/App.tsx
git commit -m "feat: add 404 NotFoundPage with useful links, replace silent catch-all redirect"
```
