# 📋 BRIEF SYSTÈME COMPLET - EBN NETWORK / TECHSHOP MANAGER

**Date de Scan :** 8 septembre 2026  
**Version :** 2.1.0  
**Environnement :** Production (Render + Vercel)  
**Status :** 🟢 Opérationnel (avec bug withdrawal 500)

---

## 🎯 VUE D'ENSEMBLE

**EBN Network TechShop Manager** est un système de gestion commerciale **multi-sites** pour une chaîne de magasins tech en RDC (Goma, Bukavu, Kinshasa). Il intègre :

- 📦 **Gestion de stocks multi-sites**
- 💰 **POS (Point de vente) avec mode hors-ligne**
- 👥 **CRM client avec onboarding en 4 étapes**
- 🏆 **Programme MLM (Marketing Multi-Niveau) à 8 niveaux**
- 💳 **Intégration KPay (Mobile Money RDC)**
- 📊 **Reporting et analytics avancés**
- 🌐 **Portail client autonome**

---

## 🏗️ ARCHITECTURE TECHNIQUE

### Stack Technology

| Couche | Technologies | Version |
|--------|-------------|---------|
| **Backend** | NestJS + Prisma + PostgreSQL | NestJS 10.x, Prisma 5.x |
| **Frontend** | React + Vite + TailwindCSS | React 18, Vite 5, Tailwind 3 |
| **BDD** | Supabase PostgreSQL | PostgreSQL 15+ |
| **Auth** | JWT + Passport | Access + Refresh tokens |
| **Storage** | IndexedDB (offline-first) | idb 8.x |
| **State** | Zustand | 4.x |
| **API Query** | TanStack Query | 5.x |
| **Payments** | KPay API | v1 |
| **SMS** | AfricasTalking | v1 |
| **Hosting Backend** | Render.com | Free tier |
| **Hosting Frontend** | Vercel | Pro |

### Architecture Réseau

```
┌────────────────────────────────────────────────────────────┐
│                   FRONTEND (Vercel)                        │
│              https://ebn-one.vercel.app                    │
│                                                            │
│  React 18 + Vite + TailwindCSS + IndexedDB                │
│  • 64 pages React                                          │
│  • Offline-first avec sync automatique                     │
│  • State management: Zustand                               │
└──────────────────┬─────────────────────────────────────────┘
                   │
                   │ HTTPS/JSON
                   │ (axios + TanStack Query)
                   ▼
┌────────────────────────────────────────────────────────────┐
│               BACKEND API (Render)                         │
│         https://ebn-hxyk.onrender.com/api/v1              │
│                                                            │
│  NestJS 10 + Prisma ORM                                    │
│  • 15 contrôleurs REST                                     │
│  • JWT auth avec refresh tokens                            │
│  • Guards RBAC (6 rôles)                                   │
│  • Rate limiting + CORS                                    │
└──────────────────┬─────────────────────────────────────────┘
                   │
                   │ Prisma Client
                   ▼
┌────────────────────────────────────────────────────────────┐
│            DATABASE (Supabase)                             │
│        PostgreSQL 15+ (Region: EU West 1)                  │
│                                                            │
│  • 38 tables principales                                   │
│  • Relations complexes (MLM tree, stocks)                  │
│  • Transactions ACID                                       │
│  • Verrous optimistes (soldeReserve)                      │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│          SERVICES EXTERNES                                 │
├────────────────────────────────────────────────────────────┤
│  KPay API          → Paiements Mobile Money (M-Pesa,etc)   │
│  AfricasTalking    → SMS notifications clients             │
│  Nodemailer        → Emails (activation, reports)          │
└────────────────────────────────────────────────────────────┘
```

---

## 📊 STATISTIQUES PROJET

| Métrique | Valeur |
|----------|--------|
| **Pages Frontend** | 64 pages React |
| **Contrôleurs API** | 15 contrôleurs REST |
| **Modules Backend** | 15 modules NestJS |
| **Tables DB** | 38 tables Prisma |
| **Endpoints API** | ~120 endpoints |
| **Rôles Utilisateurs** | 6 rôles (CLIENT → SUPER_ADMIN) |
| **Niveaux MLM** | 8 niveaux (Builder → Crown Ambassadeur) |
| **Sites Physiques** | 3 (Goma, Bukavu, Kinshasa) |
| **Langues** | Français (RDC) |
| **Devise** | USD (commissions MLM) + CDF (ventes) |

---

## 👥 RÔLES & PERMISSIONS

### Hiérarchie des Rôles (niveau décroissant)

| Rôle | Niveau | Accès Système |
|------|--------|---------------|
| **SUPER_ADMIN** | 6 | Accès total, tous sites |
| **DIRECTEUR_REGIONAL** | 5 | Dashboard régional, rapports multi-sites, config MLM |
| **GERANT** | 4 | Gestion site assigné, stocks, clients, ventes, MLM local |
| **AGENT** | 3 | POS, clients, onboarding, ventes (site assigné) |
| **FORMATEUR** | 2 | Onboarding étape FORMATION uniquement |
| **CLIENT** | 1 | Portail client (points, filleuls, retraits) |

### Matrice des Permissions

| Fonctionnalité | CLIENT | FORMATEUR | AGENT | GERANT | DIR_REG | S_ADMIN |
|---------------|--------|-----------|-------|--------|---------|---------|
| Portail Client | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Onboarding Formation | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| POS Ventes | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Gestion Clients | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Gestion Stocks | ❌ | ❌ | 📖 | ✅ | ❌ | ✅ |
| Rapports Site | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Rapports Régionaux | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Config MLM | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Gestion Utilisateurs | ❌ | ❌ | ❌ | 👤 | 👥 | ✅ |
| Config Système | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

📖 = Lecture seule | 👤 = Agents du même site | 👥 = Plusieurs sites

---

## 📦 MODULES SYSTÈME

### 1. **Auth** (`/auth`)
- Login/Logout avec JWT
- Refresh token (cookie httpOnly)
- Forgot/Reset password
- Rate limiting (5 tentatives max)
- Lockout temporaire (15 min)

### 2. **Dashboard** (`/dashboard`)
- Stats temps réel (ventes, clients, stocks)
- Charts ventes (Chart.js)
- Vue multi-sites pour DIRECTEUR_REGIONAL
- Alertes stock (rupture/faible)

### 3. **Clients** (`/clients`)
- CRUD clients avec recherche
- **Onboarding 4 étapes séquentielles :**
  1. **RECIT** : Enregistrement initial + 3000 CDF
  2. **FORMATION** : Vidéo formation (FORMATEUR valide)
  3. **FICHE** : Fiche adhésion + 2000 CDF
  4. **ACTIVATION** : Achat produit → Code parrain généré → SMS bienvenue
- File d'attente onboarding
- Historique client complet

### 4. **Ventes** (`/ventes`)
- **POS (Point de Sale)** :
  - Mode offline-first (IndexedDB)
  - Scan produits avec recherche rapide
  - Calcul automatique remises fidélité
  - Attribution points (1 pt / 1000 CDF)
  - Support multiple modes paiement
  - Impression ticket (réel ou PDF)
- Historique ventes avec filtres
- Retours/Remboursements partiels ou complets
- Intégration KPay pour paiements mobiles

### 5. **Stocks** (`/stocks`)
- Gestion multi-sites avec séparation stricte
- **Types de mouvements** :
  - ENTREE : réception marchandise
  - SORTIE_VENTE : vente POS
  - TRANSFERT : entre sites
  - AJUSTEMENT : inventaire physique
- Alertes automatiques (seuil configurable)
- Transferts inter-sites avec workflow :
  1. INITIATION → stock source décrémenté
  2. EN_TRANSIT → en cours d'acheminement
  3. RECEPTION → stock destination incrémenté
- Historique mouvements complet

### 6. **MLM (Marketing Multi-Niveau)** (`/mlm`)

#### Structure à 8 Niveaux

| Niveau | Filleuls Requis | Commission/Filleul | Commission Totale | Bonus |
|--------|----------------|--------------------|--------------------|-------|
| **Builder** | 4 | $10.00 | $40.00 | 2 pagnes |
| **Sapphire** | 4 | $20.83 | $83.32 | 1er kit alimentaire |
| **Ruby** | 4 | $33.33 | $133.32 | 2e kit alimentaire |
| **Emerald** | 4 | $83.33 | $333.32 | Écran 52" |
| **Diamond** | 4 | $416.67 | $1666.68 | Moto 2000 USD |
| **Crown Diamond** | 4 | $833.33 | $3333.32 | Voiture 6000 USD |
| **Ambassadeur** | 4 | $8333.33 | $33333.32 | Maison 30k + Voiture 15k |
| **Crown Ambassadeur** | 4 | $20833.33 | $83333.32 | 2e Maison + 3e Voiture |

#### Nouveauté : Commission Auto-Réinvestissement (Plan créé, non implémenté)

**Split 60/40** :
- **60% Système** : conservé par EBN Network
- **40% Retour automatique** : crédité immédiatement dans le portefeuille membre

**Exemple Builder** : Sur $10 commission → $6 système + $4 retour auto

#### Fonctionnalités MLM

- **Matrice 4×4** : Chaque niveau max 4 filleuls directs
- **Promotions automatiques** : Calcul hebdomadaire (cron)
- **Portefeuille membre** :
  - Solde disponible
  - Solde réservé (demandes retrait pending)
  - Total gagné (lifetime)
- **Réclamation de filleuls** :
  - Si parrain non activé à l'inscription filleul → claim EN_ATTENTE
  - Parrain active → va sur `/mlm/claims` → saisit code facture → rattachement
- **Demandes de retrait** :
  - Types : MOBILE_MONEY (M-Pesa, Airtel) ou CASH
  - Workflow : EN_ATTENTE → APPROUVE (admin) → PAYE
  - Validation : montant ≤ soldeDisponible - soldeReserve
  - Verrou optimiste (SELECT FOR UPDATE) contre double-retrait
- **Tree view** : Visualisation arbre parrainage avec Recharts

### 7. **Fidélité** (`/fidelite`)
- **4 Niveaux** : Bronze → Argent → Or → Platine
- Points : 1 pt / 1000 CDF dépensés
- **Remises** :
  - Bronze : 0%
  - Argent : 3%
  - Or : 5%
  - Platine : 8%
- Historique points avec détail transactions
- Config seuils et remises (DIRECTEUR_REGIONAL+)

### 8. **KPay** (`/kpay`)
- Intégration paiement Mobile Money RDC
- **Providers supportés** :
  - M-Pesa (Vodacom)
  - Airtel Money
  - Orange Money
  - Afri Money
- **Opérations** :
  - ONBOARDING_PAYMENT : paiements étapes 1 et 3
  - SALE_PAYMENT : paiement vente POS
  - SALE_REFUND : remboursement retour
  - MLM_PAYOUT : paiement retrait membre
- Webhook `/kpay/webhook` pour confirmations asynchrones
- Retry automatique sur échec
- Logs transactions détaillés

### 9. **Rapports** (`/rapports`)
- **Rapports disponibles** :
  - Ventes par période (jour/semaine/mois)
  - Stocks par site
  - Clients actifs vs en cours
  - Commissions MLM par niveau
  - Performance agents
- **Exports** :
  - PDF (impression)
  - Excel (analyse)
  - CSV (import externe)
- Filtres avancés : date range, site, agent, catégorie

### 10. **Sites** (`/sites`)
- CRUD sites physiques
- Association gérant → site (1:1)
- Activation/Désactivation
- Stats par site (ventes, stock, clients)

### 11. **Users** (`/users`)
- CRUD utilisateurs système
- Gestion rôles et permissions
- Réinitialisation mot de passe admin
- Logs activité utilisateur
- Désactivation compte (soft delete)

### 12. **Portail Client** (`/portal`)
- **Dashboard membre** :
  - Solde portefeuille
  - Points fidélité
  - Niveau MLM actuel
  - Progression prochain niveau
- **Mes Filleuls** :
  - Liste filleuls directs
  - Arbre parrainage complet
  - Commissions par filleul
- **Demandes Retrait** :
  - Nouvelle demande (Mobile Money / Cash)
  - Historique demandes avec statuts
- **Réclamation Filleuls** :
  - Claims EN_ATTENTE avec code facture
  - Validation automatique après saisie
- Auth séparée avec PIN 4 chiffres (SMS)

### 13. **Config** (`/config-app`)
- Paramètres système (SUPER_ADMIN)
- Config SMS provider
- Config email SMTP
- Config KPay API
- Maintenance mode
- Test SMS/Email

### 14. **Support** (`/support`)
- Ticket support client
- FAQ intégrée
- Contact admin

### 15. **Public** (`/public`)
- Candidature Ambassadeur (formulaire public)
- Landing page info

---

## 🗄️ SCHÉMA BASE DE DONNÉES

### 38 Tables Prisma

#### Core Business

| Table | Description | Relations Principales |
|-------|-------------|-----------------------|
| **Site** | Magasins physiques (3) | → Utilisateurs, Clients, Stocks |
| **Utilisateur** | Users système (6 rôles) | → Site (assigné), Ventes créées, Clients créés |
| **Client** | Clients finaux | → Site inscription, Membre (1:1), Parrain (self-ref) |
| **OnboardingEtape** | Étapes onboarding (4) | → Client, Agent validant, KpayTransactions |
| **Produit** | Catalogue produits | → Catégorie, StockSite, LigneVente |
| **Vente** | Transactions POS | → Client, LignesVente, Site |
| **LigneVente** | Détail produits vendus | → Vente, Produit |
| **RetourVente** | Remboursements | → Vente, LignesRetour |

#### Stocks

| Table | Description | Relations |
|-------|-------------|-----------|
| **StockSite** | Quantités par site | → Produit, Site |
| **MouvementStock** | Historique mouvements | → Produit, Site, Agent, TransfertStock |
| **TransfertStock** | Transferts inter-sites | → SiteSource, SiteDest, Produit, Mouvements |
| **AlerteStock** | Alertes rupture/faible | → Produit, Site |

#### MLM

| Table | Description | Relations |
|-------|-------------|-----------|
| **Membre** | Profil MLM du client | → Client (1:1), Matrix, Portefeuille |
| **MlmLevel** | 8 niveaux MLM | → Matrix, Promotions |
| **Matrix** | Nœud arbre MLM | → Membre, MlmLevel, Parrain, Positions |
| **Position** | Slot filleul (4 max/niveau) | → Matrix, FilleulMatrice |
| **MlmCommission** | Commissions générées | → Membre, Filleul, MlmLevel, Matrix |
| **Portefeuille** | Soldes membre | → Membre, Transactions, WithdrawalRequests |
| **TransactionPortefeuille** | Crédits/Débits | → Portefeuille, MlmCommission |
| **WithdrawalRequest** | Demandes retrait | → Membre, Portefeuille, KpayTransactions |
| **Promotion** | Montées de niveau | → Membre, NiveauAvant, NiveauApres |
| **BonusAttribue** | Bonus matériels | → Membre, MlmLevel |
| **RetirementBonus** | Bonus retraite | → Membre |
| **ParrainClaim** | Réclamations filleuls | → ParrainClient, FilleulClient |

#### Paiements

| Table | Description | Relations |
|-------|-------------|-----------|
| **KpayTransaction** | Transactions KPay | → Vente, OnboardingEtape, RetourVente, WithdrawalRequest |
| **MlmPayout** | Payouts MLM KPay | → WithdrawalRequest, KpayTransaction |

#### Autres

| Table | Description |
|-------|-------------|
| **Categorie** | Catégories produits |
| **ExportJob** | Jobs exports async (PDF/Excel) |
| **SyncQueue** | Queue sync offline → serveur |
| **SupportTicket** | Tickets support |

---

## 🔐 SÉCURITÉ

### Authentification

- **JWT Access Token** :
  - Durée : 8 heures
  - Stocké : `localStorage` (clé `ebn_auth_v1`)
  - Payload : `{ sub: userId, role, siteId }`
- **JWT Refresh Token** :
  - Durée : 7 jours
  - Stocké : Cookie httpOnly (protection XSS)
  - Rotation automatique
- **PIN Portail Client** :
  - 4 chiffres
  - SMS OTP pour reset
  - Tentatives : 5 max → lockout 15 min

### Autorisation (RBAC)

- Guards NestJS :
  - `@Roles(Role.GERANT, Role.SUPER_ADMIN)`
  - `@RequireActivation()` (clients ACTIF uniquement)
  - `@SiteAccess()` (vérif site assigné)
- Filtrage automatique requêtes DB par `siteId` selon rôle

### Protection Attaques

| Attaque | Protection |
|---------|-----------|
| **Brute Force** | Rate limiting (10 req/min), lockout après 5 échecs |
| **XSS** | Sanitization inputs (class-validator), CSP headers |
| **CSRF** | SameSite cookies, tokens CSRF sur mutations |
| **SQL Injection** | Prisma ORM (requêtes paramétrées) |
| **IDOR** | Vérification ownership sur toutes requêtes |
| **DDoS** | Throttling global (100 req/min), Cloudflare (Vercel) |

### Données Sensibles

- Mots de passe : **bcrypt** (salt rounds = 10)
- JWT secrets : 256 bits (env vars)
- KPay API keys : env vars (jamais exposées frontend)
- PINs clients : hachés avec bcrypt

---

## 🌐 FONCTIONNEMENT OFFLINE-FIRST

### Stratégie IndexedDB

1. **Toute écriture** → IndexedDB **d'abord**
2. **UI mise à jour** immédiatement (optimistic)
3. **Sync background** vers API
4. **Gestion conflits** :
   - Si 409 CONFLICT → merge manuel
   - Si 500 ERROR → retry automatique (3 fois)
   - Si success → marquer `syncStatus: SYNCED`

### Tables IndexedDB

| Store | Type de Données | Sync |
|-------|-----------------|------|
| `pending_sales` | Ventes POS hors-ligne | Auto toutes les 30s |
| `pending_movements` | Mouvements stock | Auto + manuel |
| `clients_cache` | Liste clients | Cache 1h |
| `products_cache` | Catalogue produits | Cache 24h |
| `stocks_cache` | Quantités stocks | Cache 5 min |

### Indicateurs UI

- **Badge "Hors ligne"** : header rouge si `navigator.onLine === false`
- **Badge "Sync en cours"** : spinner bleu pendant sync
- **Badge "Données locales (X)"** : nombre d'items non synced

---

## 📱 RESPONSIVE & ACCESSIBILITÉ

### Breakpoints TailwindCSS

| Device | Breakpoint | Usage Principal |
|--------|------------|-----------------|
| Mobile | < 640px | Portail client |
| Tablet | 640px - 1024px | POS terrain (agent) |
| Desktop | ≥ 1024px | Back-office (gérant, admin) |

### Conformité WCAG

- **Niveau cible** : AA
- **Taille touche min** : 44×44px
- **Contraste** : 4.5:1 (texte normal), 3:1 (gros texte)
- **Focus visible** : ring bleu 2px sur tous éléments interactifs
- **Annonces ARIA** : `role`, `aria-label`, `aria-live` sur actions critiques
- **Navigation clavier** : Tab order logique, Skip links
- **Reduced motion** : respect `prefers-reduced-motion` (pas d'animations)

### Tailles Typographie

| Usage | Desktop | Mobile |
|-------|---------|--------|
| Titre H1 | 32px | 24px |
| Titre H2 | 24px | 20px |
| Corps | 16px | 14px |
| Small | 14px | 12px |

---

## 🐛 BUGS CONNUS & EN COURS

### 🔴 CRITIQUE : Erreur 500 Withdrawal Request (Actuel)

**Symptôme :**
```
POST /api/v1/portal/withdrawal-requests → 500 Internal Server Error
```

**Contexte :** Production (ebn-hxyk.onrender.com)

**Cause probable :**
1. Champ `commissionIds` vide (`[]`) non géré
2. Prisma Decimal conversion error
3. Verrou `lockPortefeuille()` timeout
4. Provider KPay invalide

**Impact :** Les clients ne peuvent pas demander de retrait → **BLOCAGE MÉTIER MAJEUR**

**Action requise :** Vérifier logs Render + ajouter try/catch détaillé

---

### 🟡 MOYEN : Claim à l'Activation (Corrigé aujourd'hui)

**Avant :** Activation bloquée si filleuls EN_ATTENTE → demande code facture

**Après (commit `5dfbeae`) :** Activation normale + toast bleu informatif 8 secondes

**Status :** ✅ Résolu dans branche `feat/parrain-claim` (non mergé `main`)

---

### 🟢 MINEUR : Port 3000 occupé (Résolu)

**Symptôme :** `EADDRINUSE: address already in use :::3000`

**Solution :** Port changé de 3000 → 3001 dans `.env`

**Status :** ✅ Résolu

---

## 📈 ROADMAP & FEATURES PLANIFIÉES

### ✅ Complété (Sprint actuel)

- [x] Suppression blocage claim à l'activation
- [x] Toast rappel filleuls en attente
- [x] Plan commission auto-réinvestissement (+66.67%)
- [x] Documentation système complète

### 🚧 En Cours (Sprint prochain)

- [ ] **Fix bug withdrawal 500** (PRIORITÉ 1)
- [ ] Tests E2E parcours onboarding complet
- [ ] Merge branche `feat/parrain-claim` → `main`

### 📋 Backlog (Q4 2026)

#### Commission Auto-Réinvestissement (Plan prêt)
- [ ] Backend : Ajouter champs `commissionSysteme`, `commissionRetour` à schéma
- [ ] Backend : Crédit automatique 40% dans portefeuille à la génération commission
- [ ] Backend : Type transaction `REINVESTISSEMENT`
- [ ] Frontend : Affichage split 60/40 dans dashboard MLM
- [ ] Frontend : Icône/style pour transactions REINVESTISSEMENT
- [ ] Tests : 23 tâches détaillées (voir `docs/superpowers/plans/2026-09-04-commission-auto-reinvestissement.md`)

#### Autres Features

- [ ] Export rapports automatiques (cron hebdomadaire)
- [ ] Notifications push navigateur (PWA)
- [ ] Mode kiosque POS (fullscreen, pas de navigation externe)
- [ ] Dashboard admin temps réel (WebSocket)
- [ ] Intégration Balance comptable (exports QuickBooks)
- [ ] Module Fournisseurs (bons de commande, factures)
- [ ] Scanner QR code produits (caméra mobile)
- [ ] Signature électronique fiche adhésion (canvas)

---

## 🔧 CONFIGURATION & ENV VARS

### Backend `.env` (Production)

```bash
# Database
DATABASE_URL="postgresql://postgres.xxx:xxx@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.xxx:xxx@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"

# Server
PORT=3001

# JWT
JWT_SECRET=<256-bit-secret>
JWT_REFRESH_SECRET=<256-bit-secret>
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# Auth Security
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15

# KPay (Mobile Money RDC)
KPAY_API_KEY=kpay_test_xxxxx
KPAY_SECRET_KEY=<secret>
KPAY_WEBHOOK_SECRET=<secret>
KPAY_GATEWAY_SECRET=<secret>

# SMS (AfricasTalking)
AFRICASTALKING_API_KEY=<key>
AFRICASTALKING_USERNAME=<username>

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASS=<app-password>

# Frontend URL (CORS)
FRONTEND_URL=https://ebn-one.vercel.app
```

### Frontend `.env` (Production)

```bash
VITE_API_URL=https://ebn-hxyk.onrender.com/api/v1
```

---

## 📚 DOCUMENTATION DISPONIBLE

### Documents Principaux

| Fichier | Description |
|---------|-------------|
| `PRODUCT.md` | Vision produit, principes design, brand |
| `CLAUDE.md` | Guide dev rapide (architecture, commandes, conventions) |
| `WITHDRAWAL_SYSTEM_IMPLEMENTATION.md` | Spec système retrait MLM |
| `implementation_plan.md` | Plan général implémentation |

### Docs Techniques (`/docs`)

| Répertoire | Contenu |
|------------|---------|
| `docs/superpowers/plans/` | Plans implémentation features (11 docs) |
| `docs/superpowers/changes/` | Changelog détaillé des modifications |
| `docs/superpowers/specs/` | Spécifications design détaillées |
| `docs/architecture/` | Diagrammes et docs architecture |

### Docs Auto-Générées

- **API Swagger** : `https://ebn-hxyk.onrender.com/api/docs` (si activé)
- **Prisma ERD** : Généré avec `npx prisma generate` → `prisma/schema.prisma`
- **Tests Coverage** : `backend/coverage/` (après `npm test`)

---

## 🧪 TESTS

### Backend

| Type | Framework | Coverage |
|------|-----------|----------|
| Unit | Jest | ~60% |
| Integration | Jest + Supertest | Critiques seulement |
| E2E | Jest | Non implémenté |

**Commandes :**
```bash
npm test                    # Tous les tests
npm run test:watch          # Mode watch
npm run test:cov            # Coverage HTML
```

**Tests Clés :**
- `clients.service.spec.ts` : Onboarding complet
- `portal.service.spec.ts` : Withdrawal requests avec verrous
- `mlm-matrix.service.spec.ts` : Génération commissions
- `stocks.service.spec.ts` : Transferts inter-sites

### Frontend

| Type | Framework | Coverage |
|------|-----------|----------|
| Unit | Vitest | Non implémenté |
| Component | React Testing Library | Non implémenté |
| E2E | Playwright | Non implémenté |

**Status :** Tests frontend à développer en priorité.

---

## 🚀 DÉPLOIEMENT

### Backend (Render)

**URL :** https://ebn-hxyk.onrender.com  
**Plan :** Free tier (spin down après 15 min inactivité)  
**Region :** EU West (proche Supabase)

**Build Command :**
```bash
npm install && npm run build
```

**Start Command :**
```bash
npm run start:prod
```

**Health Check :** `GET /api/v1/health` (retourne 200 OK)

**Auto-Deploy :** Push `main` branch → deploy automatique

### Frontend (Vercel)

**URL :** https://ebn-one.vercel.app  
**Plan :** Pro  
**Region :** Auto (Edge CDN)

**Build Command :**
```bash
npm run build
```

**Output Directory :** `dist/`

**Auto-Deploy :** Push `main` → production, autres branches → preview

### Database (Supabase)

**Host :** aws-1-eu-west-1.pooler.supabase.com  
**Plan :** Free tier (500 MB, 10k rows)  
**Backups :** Automatiques quotidiens (7 jours rétention)  
**Migrations :** Manuelles via `npm run prisma:migrate:deploy`

---

## 📊 MÉTRIQUES & MONITORING

### Performance Cibles

| Métrique | Cible | Actuel |
|----------|-------|--------|
| **Page Load (P95)** | < 2s | ~3s (cold start) |
| **API Response (P95)** | < 500ms | ~800ms |
| **POS Transaction** | < 90s | ~60s ✅ |
| **Offline Sync** | < 5s | ~3s ✅ |
| **DB Query (P95)** | < 100ms | ~150ms |

### Alertes Critiques

- ❌ API 5xx rate > 1%
- ❌ DB connection pool > 90%
- ⚠️ Stock rupture sur produit top 10
- ⚠️ Withdrawal request > 48h sans approbation
- ⚠️ Onboarding stuck > 7 jours

**Monitoring Tools (à implémenter) :**
- Sentry (erreurs frontend/backend)
- LogRocket (session replay)
- Uptime Robot (health check)

---

## 🎓 CONVENTIONS CODE

### Naming

| Type | Convention | Exemple |
|------|-----------|---------|
| **Variables** | camelCase | `clientName`, `totalAmount` |
| **Constantes** | UPPER_SNAKE_CASE | `MAX_LOGIN_ATTEMPTS` |
| **Classes** | PascalCase | `ClientsService`, `AuthGuard` |
| **Interfaces** | PascalCase + I prefix | `IClient`, `IVente` |
| **Types** | PascalCase | `StatutClient`, `Role` |
| **Files** | kebab-case | `clients.service.ts`, `portal-auth.controller.ts` |
| **Branches Git** | kebab-case + type | `feat/mlm-claims`, `fix/withdrawal-bug` |
| **Commits** | conventional | `feat:`, `fix:`, `refactor:`, `docs:` |

### Formatage

- **Indentation** : 2 espaces (TypeScript), 2 espaces (JSX)
- **Quotes** : Single `'` (TS), Double `"` (JSX props)
- **Line Length** : 120 caractères max
- **Semicolons** : Oui (TypeScript)
- **Trailing Commas** : Oui (arrays, objects multi-lignes)

### Structure Imports

```typescript
// 1. Node modules
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// 2. Services internes
import { PrismaService } from '../prisma/prisma.service';

// 3. Types/DTOs
import { CreateClientDto } from './dto/client.dto';

// 4. Utils
import { formatPhone } from '@/lib/utils';
```

---

## 🌍 INTERNATIONALISATION

### Langue Actuelle

- **Unique** : Français (RDC)
- **Formats** :
  - Monnaie CDF : `1 200 000 CDF` (espaces comme séparateurs milliers)
  - Monnaie USD : `$1,200.00` (virgule = milliers, point = décimales)
  - Dates : `DD/MM/YYYY` (ex: `08/09/2026`)
  - Téléphone : `+243 XXX XXX XXX`

### i18n Future (Non implémenté)

Préparer pour :
- Anglais (expansion Afrique anglophone)
- Swahili (marché local RDC)

**Stratégie :** i18next + React Intl

---

## 💡 DÉCISIONS TECHNIQUES CLÉS

### Pourquoi Offline-First ?

**Contexte RDC :** Connexion internet instable (coupures fréquentes, 3G lent)

**Solution :** IndexedDB en first-class citizen → UI jamais bloquée

### Pourquoi JWT + Refresh Token ?

**Sécurité :** Access token court-lived (8h) limite exposition

**UX :** Refresh token (7j) évite re-login fréquent

### Pourquoi Prisma ORM ?

**Type-Safety :** Génération types TypeScript automatique

**Migrations :** Gestion versionnée du schéma DB

**Performance :** Query optimization + connection pooling

### Pourquoi TailwindCSS ?

**Cohérence :** Design system strict (pas de CSS custom sauvage)

**Performance :** Purge automatique → bundle CSS minimal

**DX :** Utility-first rapide, pas de nommage classes

### Pourquoi NestJS ?

**Structure :** Architecture modulaire scalable (15 modules)

**Ecosystem :** Guards, Interceptors, Pipes built-in

**TypeScript-Native :** Type-safety end-to-end

---

## 📞 CONTACTS & SUPPORT

### Équipe Projet

| Rôle | Nom | Contact |
|------|-----|---------|
| **Product Owner** | Peter AKILIMALI | +243 902 238 740 |
| **Tech Lead** | Kiro AI | - |
| **DevOps** | - | - |

### Liens Utiles

- **Repo GitHub** : (privé)
- **Board Jira** : (si existant)
- **Slack Channel** : #ebn-techshop-dev
- **Production Frontend** : https://ebn-one.vercel.app
- **Production API** : https://ebn-hxyk.onrender.com/api/v1
- **DB Admin (Supabase)** : https://supabase.com/dashboard

---

## 🎯 PROCHAINES ACTIONS IMMÉDIATES

### 🔥 URGENT (Aujourd'hui)

1. **Débugger erreur 500 withdrawal** :
   ```bash
   # Lire logs Render
   # Ajouter console.log détaillés dans createWithdrawalRequest()
   # Tester en local avec même payload production
   ```

2. **Tester toast filleuls** :
   - Activer un client avec claims EN_ATTENTE
   - Vérifier apparition toast bleu 1.5s après succès
   - Confirmer message correct (singulier/pluriel)

### ⚡ CETTE SEMAINE

3. **Merger `feat/parrain-claim` → `main`** :
   - Vérifier tous tests passent
   - Résoudre conflits éventuels
   - Deploy staging → validation → prod

4. **Créer tests E2E withdrawal flow** :
   - Demande création
   - Approbation admin
   - Vérification débit portefeuille

5. **Documentation API Swagger** :
   - Ajouter `@nestjs/swagger`
   - Décorer tous DTOs avec `@ApiProperty()`
   - Publier à `/api/docs`

---

## 📄 LICENSES & CRÉDITS

### Open Source

- **Backend** : MIT License
- **Frontend** : MIT License
- **Dependencies** : Voir `package.json` (licences variées : MIT, Apache 2.0, BSD)

### Assets

- **Icons** : Lucide React (ISC License)
- **Fonts** : Inter (SIL Open Font License)

### Crédits

- **Développement** : EBN Network Team
- **AI Assistant** : Kiro (Claude Sonnet 4)
- **Infrastructure** : Supabase, Render, Vercel

---

**Document généré le :** 8 septembre 2026  
**Version :** 1.0.0  
**Auteur :** Kiro AI  
**Validé par :** Peter AKILIMALI

---

**🎉 FIN DU BRIEF SYSTÈME COMPLET**
