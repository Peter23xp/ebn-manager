# Progress Business — Guide Développement

## Vue d'ensemble

Système de Gestion Commercial Multi-Sites pour Progress Business (Goma, Bukavu, Kinshasa — RDC).
**42 écrans | 10 modules | 6 rôles | Offline-First**

## Architecture

```
progress-business/
├── backend/          # NestJS + Prisma + PostgreSQL
│   ├── src/
│   │   ├── modules/  # 12 modules métier
│   │   ├── common/   # guards, decorators, filters, dto
│   │   └── prisma/   # PrismaService (global)
│   └── prisma/       # schema.prisma + migrations + seed.ts
└── frontend/         # React + Vite + TailwindCSS
    └── src/
        ├── pages/    # 42 pages (42 écrans SSD)
        ├── components/layout/ + ui/ + charts/
        ├── store/    # Zustand (auth.store, ui.store)
        ├── lib/      # api.ts (axios), utils.ts, offline.ts (IndexedDB)
        ├── hooks/    # useDebounce, useOnlineSync
        └── types/    # index.ts (tous les types TS)
```

## Commandes rapides

```bash
# Démarrer le projet
cd backend && cp .env.example .env   # configurer .env
npm run prisma:migrate:dev
npm run prisma:seed
npm run start:dev

cd frontend && cp .env.example .env
npm run dev
```

## Rôles et hiérarchie (niveaux)

| Rôle | Niveau | Accès |
|------|--------|-------|
| SUPER_ADMIN | 6 | Tout |
| DIRECTEUR_REGIONAL | 5 | Dashboard, Rapports multi-sites |
| GERANT | 4 | CRUD site, Stocks, Parrainage |
| AGENT | 3 | Clients, POS, Stock (lecture) |
| FORMATEUR | 2 | Onboarding étape 2 uniquement |
| CLIENT | 1 | Portail client uniquement |

## Routes API (prefix: /api/v1)

| Module | Endpoints clés |
|--------|---------------|
| Auth | POST /auth/login, /auth/refresh, /auth/forgot-password, /auth/reset-password |
| Dashboard | GET /dashboard/stats, /dashboard/sales-chart, /dashboard/regional |
| Clients | GET/POST /clients, POST /clients/onboarding/recit, /:id/onboarding/* |
| Ventes | POST /ventes, GET /ventes, /sales/pos |
| Stocks | GET /stocks, POST /stocks/entree, /stocks/transfert |
| Parrainage | GET /parrainage, GET /parrainage/tree/:clientId |
| Fidélité | GET /fidelite/stats, PUT /fidelite/config |
| Rapports | GET /rapports/ventes, /rapports/stocks, POST /rapports/export |
| Portail | GET /portal/me, /portal/filleuls |
| Users | GET/POST /users, PATCH /users/me |

## Conventions

- **Monnaie** : CDF avec séparateurs de milliers (ex: `1 200 000 CDF`)
- **Téléphone** : format `+243XXXXXXXXX`
- **Code parrain** : format `AAAAMMJJ####` (ex: `202609010001`) — les SKU produits utilisent `TSG-<CAT>-<seq>`
- **N° vente** : format `{SITE}-{ANNEE}{MOIS}-{SEQ}` (ex: `GOM-202501-0047`)
- **Points fidélité** : 1 pt / 1 000 CDF dépensés
- **Remises** : Bronze 0%, Argent 3%, Or 5%, Platine 8%

## Palette de couleurs

| Rôle | Hex |
|------|-----|
| Bleu principal | `#1E3A5F` |
| Bleu accent | `#2E86C1` |
| Vert succès | `#1A6B3A` |
| Orange alerte | `#E65100` |
| Rouge danger | `#B71C1C` |
| Violet platine | `#4A148C` |

## Règles métier critiques

1. **Onboarding** : 4 étapes séquentielles obligatoires (RECIT → FORMATION → FICHE → ACTIVATION)
2. **Activation** : génère automatiquement le code parrain TSG-XXXX et envoie SMS de bienvenue
3. **Stock** : vérifié côté serveur à chaque vente (erreur 409 si insuffisant)
4. **Transfert** : stock source décrémenté à l'INITIATION, destination incrémenté à la RÉCEPTION
5. **Points** : attribués uniquement aux clients ACTIF (vente anonyme = 0 pts)
6. **Offline** : toutes les écritures → IndexedDB d'abord, sync API ensuite (jamais de blocage UX)
7. **Auth** : access token JWT en localStorage (clé `ebn_auth_v1` — session persiste au F5) + refresh token en cookie httpOnly

## Variables d'environnement requises

Voir `backend/.env.example` et `frontend/.env.example`.

## Credentials de démarrage (seed)

- Téléphone : `+243902238740`
- Mot de passe : `Admin@2025`
- Nom : Peter AKILIMALI
- Rôle : SUPER_ADMIN

## Dépendances clés

**Backend** : NestJS 10, Prisma 5, passport-jwt, bcrypt, csv-parse, exceljs, africastalking

**Frontend** : React 18, Vite 5, TailwindCSS 3, React Router 6, TanStack Query 5, Zustand 4, Chart.js 4, react-hook-form 7, Zod 3, idb (IndexedDB)
