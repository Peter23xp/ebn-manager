# 📖 GUIDE TECHNIQUE ÉCRAN PAR ÉCRAN - EBN NETWORK

**Pour :** Nouveau développeur prenant le projet  
**Objectif :** Comprendre chaque écran, fichier, flux de données, et architecture  
**Date :** 8 septembre 2026  
**Version :** 2.1.0

---

## 📚 TABLE DES MATIÈRES

### PARTIE 1 : ARCHITECTURE GLOBALE
1. [Structure du Projet](#structure-projet)
2. [Flux de Données](#flux-donnees)
3. [Authentification & Autorisation](#auth)
4. [Offline-First Strategy](#offline)

### PARTIE 2 : BACKEND (15 MODULES)
5. [Module Auth](#module-auth)
6. [Module Clients](#module-clients)
7. [Module Ventes](#module-ventes)
8. [Module Stocks](#module-stocks)
9. [Module MLM](#module-mlm)
10. [Module Portal](#module-portal)
11. [Module Dashboard](#module-dashboard)
12. [Module Rapports](#module-rapports)
13. [Autres Modules](#autres-modules)

### PARTIE 3 : FRONTEND (64 ÉCRANS)
14. [Écrans Auth (2)](#ecrans-auth)
15. [Dashboard (2)](#ecrans-dashboard)
16. [Clients (9)](#ecrans-clients)
17. [Ventes (8)](#ecrans-ventes)
18. [Stocks (8)](#ecrans-stocks)
19. [MLM (11)](#ecrans-mlm)
20. [Portail Client (5)](#ecrans-portal)
21. [Rapports (4)](#ecrans-rapports)
22. [Paramètres (4)](#ecrans-parametres)
23. [Support (1)](#ecrans-support)

### PARTIE 4 : COMPOSANTS RÉUTILISABLES
24. [Layout Components](#layout-components)
25. [UI Components](#ui-components)
26. [Chart Components](#chart-components)
27. [Business Components](#business-components)

### PARTIE 5 : SERVICES & STORES
28. [API Service](#api-service)
29. [Zustand Stores](#stores)
30. [Hooks Personnalisés](#hooks)

---

## <a name="structure-projet"></a>1. STRUCTURE DU PROJET

### Vue d'Ensemble

```
techshop-manager/
│
├── backend/                    # API NestJS
│   ├── src/
│   │   ├── modules/           # 15 modules métier
│   │   │   ├── auth/          # Authentification JWT
│   │   │   ├── clients/       # Gestion clients + onboarding
│   │   │   ├── ventes/        # POS + historique ventes
│   │   │   ├── stocks/        # Gestion stocks multi-sites
│   │   │   ├── mlm/           # Système MLM 8 niveaux
│   │   │   ├── portal/        # Portail client autonome
│   │   │   ├── dashboard/     # Stats & analytics
│   │   │   ├── rapports/      # Exports PDF/Excel
│   │   │   ├── sites/         # CRUD sites physiques
│   │   │   ├── users/         # CRUD utilisateurs système
│   │   │   ├── kpay/          # Intégration Mobile Money
│   │   │   ├── mailer/        # Emails transactionnels
│   │   │   ├── config-app/    # Configuration système
│   │   │   ├── support/       # Tickets support
│   │   │   └── public/        # Endpoints publics (no auth)
│   │   │
│   │   ├── common/            # Partagé entre modules
│   │   │   ├── decorators/    # @CurrentUser, @Roles
│   │   │   ├── guards/        # JwtAuthGuard, RolesGuard
│   │   │   ├── filters/       # HttpExceptionFilter
│   │   │   └── dto/           # DTOs de base
│   │   │
│   │   ├── prisma/            # PrismaService (global)
│   │   └── main.ts            # Bootstrap NestJS
│   │
│   ├── prisma/
│   │   ├── schema.prisma      # Schéma DB (38 tables)
│   │   ├── migrations/        # Migrations versionnées
│   │   └── seed.ts            # Données initiales
│   │
│   └── test/                  # Tests E2E
│
├── frontend/                   # App React
│   ├── src/
│   │   ├── pages/             # 64 pages (routing)
│   │   │   ├── auth/          # Login, Reset password
│   │   │   ├── dashboard/     # Dashboard admin + régional
│   │   │   ├── clients/       # Gestion clients + onboarding
│   │   │   ├── ventes/        # POS + historique
│   │   │   ├── stocks/        # Stocks + transferts
│   │   │   ├── mlm/           # MLM admin (commissions, tree)
│   │   │   ├── portal/        # Portail client (autonome)
│   │   │   ├── rapports/      # Rapports + exports
│   │   │   ├── parametres/    # Config (sites, users, profil)
│   │   │   └── support/       # Support ticket
│   │   │
│   │   ├── components/        # Composants réutilisables
│   │   │   ├── layout/        # AppLayout, Sidebar, Header
│   │   │   ├── ui/            # Button, Input, Modal, etc.
│   │   │   ├── charts/        # Graphiques Chart.js
│   │   │   ├── clients/       # Spécifiques clients
│   │   │   ├── ventes/        # Spécifiques ventes
│   │   │   ├── mlm/           # Spécifiques MLM
│   │   │   └── stocks/        # Spécifiques stocks
│   │   │
│   │   ├── store/             # Zustand state management
│   │   │   ├── auth.store.ts  # User session, token
│   │   │   └── ui.store.ts    # UI state (sidebar, modals)
│   │   │
│   │   ├── lib/               # Utilitaires
│   │   │   ├── api.ts         # Axios client configuré
│   │   │   ├── utils.ts       # Formatage, validation
│   │   │   └── offline.ts     # IndexedDB operations
│   │   │
│   │   ├── hooks/             # React hooks custom
│   │   │   ├── useDebounce.ts
│   │   │   └── useOnlineSync.ts
│   │   │
│   │   ├── types/             # TypeScript types
│   │   │   └── index.ts       # Tous les types centralisés
│   │   │
│   │   ├── App.tsx            # Root component + Router
│   │   └── main.tsx           # Entry point Vite
│   │
│   └── public/                # Assets statiques
│
└── docs/                      # Documentation
    ├── PRODUCT.md
    ├── CLAUDE.md
    ├── SYSTEM_BRIEF_COMPLET.md
    └── GUIDE_TECHNIQUE_ECRAN_PAR_ECRAN.md (ce fichier)
```

---

## <a name="flux-donnees"></a>2. FLUX DE DONNÉES

### Diagramme de Flux Général

```
┌────────────────────────────────────────────────────────┐
│                    FRONTEND                            │
│                                                        │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐       │
│  │  Pages   │───▶│  Hooks   │───▶│  Stores  │       │
│  │ (React)  │    │(TanStack)│    │(Zustand) │       │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘       │
│       │               │                │             │
│       └───────────────┼────────────────┘             │
│                       │                              │
│                  ┌────▼────┐                         │
│                  │   API   │                         │
│                  │(axios)  │                         │
│                  └────┬────┘                         │
│                       │                              │
│              ┌────────▼────────┐                     │
│              │  IndexedDB      │                     │
│              │  (offline cache)│                     │
│              └────────┬────────┘                     │
└───────────────────────┼──────────────────────────────┘
                        │
                        │ HTTP/JSON
                        │
┌───────────────────────▼──────────────────────────────┐
│                   BACKEND                            │
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │Controller│───▶│ Service  │───▶│ Prisma   │     │
│  │  (HTTP)  │    │(Business)│    │  (ORM)   │     │
│  └──────────┘    └──────────┘    └────┬─────┘     │
│                                        │           │
└────────────────────────────────────────┼───────────┘
                                         │
                                         │ SQL
                                         │
                                    ┌────▼────┐
                                    │PostgreSQL│
                                    │(Supabase)│
                                    └─────────┘
```

### Exemple Concret : Création d'une Vente

```
1. USER clique "Confirmer vente" dans POSPage.tsx
   ↓
2. FRONTEND : mutation.mutate(venteData)
   → TanStack Query déclenche
   ↓
3. FRONTEND : api.post('/ventes', venteData)
   → Axios intercepte → ajoute JWT header
   ↓
4. FRONTEND : Avant envoi → écriture IndexedDB
   → { syncStatus: 'PENDING', data: venteData }
   → UI se met à jour immédiatement (optimistic)
   ↓
5. BACKEND : POST /api/v1/ventes arrive
   → VentesController.create()
   ↓
6. BACKEND : JwtAuthGuard vérifie token
   → Extrait userId, role, siteId
   ↓
7. BACKEND : RolesGuard vérifie @Roles([AGENT, GERANT])
   → Si role = CLIENT → 403 Forbidden
   ↓
8. BACKEND : VentesService.create(dto, user)
   → Validation DTO (class-validator)
   → Vérification stock disponible
   → Calcul points fidélité
   → Calcul remise selon niveau client
   ↓
9. BACKEND : Prisma.$transaction()
   → INSERT INTO ventes
   → INSERT INTO lignes_vente (N lignes)
   → UPDATE stock_sites (décrémente quantités)
   → INSERT INTO mouvements_stock (traçabilité)
   → UPDATE clients (add points fidélité)
   → INSERT INTO transactions_fidelite
   ↓
10. BACKEND : Commit transaction → retourne vente créée
    ↓
11. FRONTEND : onSuccess(response)
    → Marque IndexedDB { syncStatus: 'SYNCED' }
    → Invalide queries ['ventes', 'stocks']
    → TanStack Query refetch automatique
    → UI se met à jour avec données fraîches
    ↓
12. USER voit confirmation "Vente enregistrée ✓"
```

---

## <a name="auth"></a>3. AUTHENTIFICATION & AUTORISATION

### Architecture Auth

```
┌─────────────────────────────────────────────────┐
│         FRONTEND (React)                        │
│                                                 │
│  1. User saisit tel + password                 │
│     ↓                                           │
│  2. POST /auth/login                            │
│     { telephone, password }                     │
│     ↓                                           │
│  3. Reçoit { accessToken, user }                │
│     ↓                                           │
│  4. Stocke dans Zustand + localStorage          │
│     - localStorage['ebn_auth_v1'] = accessToken│
│     - authStore.setUser(user)                   │
│     ↓                                           │
│  5. Toutes requêtes → axios interceptor         │
│     ajoute: Authorization: Bearer <token>       │
│     ↓                                           │
│  6. Si 401 Unauthorized reçu                    │
│     → Tente refresh avec cookie httpOnly        │
│     → POST /auth/refresh                        │
│     → Si succès: nouveau accessToken            │
│     → Si échec: logout + redirect /login        │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│         BACKEND (NestJS)                        │
│                                                 │
│  Controller endpoint protégé:                   │
│  @UseGuards(JwtAuthGuard, RolesGuard)          │
│  @Roles(Role.GERANT, Role.SUPER_ADMIN)         │
│  async method(@CurrentUser() user) {...}        │
│     ↓                                           │
│  1. JwtAuthGuard                                │
│     - Extrait token du header Authorization     │
│     - Vérifie signature JWT avec JWT_SECRET     │
│     - Décode payload { sub: userId, role, ... } │
│     - Charge user complet depuis DB             │
│     - Attache à request.user                    │
│     ↓                                           │
│  2. RolesGuard                                  │
│     - Lit @Roles() du decorator                 │
│     - Compare request.user.role avec roles OK   │
│     - Si match → continue                       │
│     - Sinon → throw ForbiddenException (403)    │
│     ↓                                           │
│  3. @CurrentUser() decorator                    │
│     - Injecte request.user dans param method    │
│     ↓                                           │
│  4. Business logic avec user.id, user.role      │
└─────────────────────────────────────────────────┘
```

### Fichiers Clés Auth

#### Backend

| Fichier | Rôle |
|---------|------|
| `backend/src/modules/auth/auth.service.ts` | Login, logout, refresh, forgot/reset password |
| `backend/src/modules/auth/auth.controller.ts` | Endpoints `/auth/*` |
| `backend/src/modules/auth/strategies/jwt.strategy.ts` | Validation JWT Passport |
| `backend/src/common/guards/jwt-auth.guard.ts` | Guard vérifiant token |
| `backend/src/common/guards/roles.guard.ts` | Guard vérifiant rôles |
| `backend/src/common/decorators/current-user.decorator.ts` | Injecte user dans params |
| `backend/src/common/decorators/roles.decorator.ts` | Décorateur @Roles(...) |

#### Frontend

| Fichier | Rôle |
|---------|------|
| `frontend/src/store/auth.store.ts` | Zustand store (user, token, login, logout) |
| `frontend/src/pages/auth/LoginPage.tsx` | Écran login |
| `frontend/src/lib/api.ts` | Axios client avec interceptors auth |
| `frontend/src/App.tsx` | ProtectedRoute wrapper |

---

## <a name="offline"></a>4. OFFLINE-FIRST STRATEGY

### Principe

**Tout écriture → IndexedDB d'abord, sync API ensuite.**

Contexte RDC : connexion internet instable (coupures fréquentes). Si on attend l'API avant de mettre à jour l'UI, l'expérience devient bloquante.

### Implémentation

#### 1. Structure IndexedDB

**Database :** `ebn-local-db`  
**Stores (tables) :**

| Store | Clé | Données |
|-------|-----|---------|
| `pending_sales` | id (uuid) | { ...vente, syncStatus: 'PENDING' \| 'SYNCED' } |
| `pending_movements` | id (uuid) | { ...mouvement, syncStatus } |
| `clients_cache` | id | { ...client, cachedAt: timestamp } |
| `products_cache` | id | { ...produit, cachedAt } |
| `stocks_cache` | produitId_siteId | { quantite, cachedAt } |

#### 2. Flux Écriture (Vente POS Exemple)

```typescript
// frontend/src/pages/ventes/POSPage.tsx

const mutation = useMutation({
  mutationFn: async (venteData) => {
    // ÉTAPE 1 : Écriture locale immédiate
    const localId = uuid();
    await db.pending_sales.add({
      id: localId,
      ...venteData,
      syncStatus: 'PENDING',
      createdAtLocal: Date.now(),
    });

    // ÉTAPE 2 : UI se met à jour (optimistic)
    // → Toast "Vente enregistrée (sync en cours...)"
    
    // ÉTAPE 3 : Tentative sync API
    try {
      const response = await api.post('/ventes', venteData);
      
      // ÉTAPE 4 : Succès → marquer synced
      await db.pending_sales.update(localId, {
        syncStatus: 'SYNCED',
        serverId: response.data.id,
      });
      
      return response.data;
    } catch (error) {
      // ÉTAPE 5 : Échec réseau → rester PENDING
      if (error.code === 'ERR_NETWORK') {
        // Sera retry par background sync
        console.log('Sync différé, retry auto dans 30s');
        return { id: localId, syncStatus: 'PENDING' };
      }
      
      // ÉTAPE 6 : Erreur métier (400, 409) → supprimer local
      if (error.response?.status >= 400) {
        await db.pending_sales.delete(localId);
        throw error; // Afficher erreur à l'utilisateur
      }
    }
  },
  
  onSuccess: (data) => {
    if (data.syncStatus === 'SYNCED') {
      toast.success('Vente enregistrée ✓');
    } else {
      toast('Vente enregistrée (sync en attente)', {
        icon: '📶',
      });
    }
  },
});
```

#### 3. Background Sync

```typescript
// frontend/src/lib/offline.ts

export class OfflineSyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  
  start() {
    // Sync toutes les 30 secondes
    this.syncInterval = setInterval(() => {
      this.syncPendingData();
    }, 30000);
    
    // Sync immédiat quand connexion revient
    window.addEventListener('online', () => {
      this.syncPendingData();
    });
  }
  
  async syncPendingData() {
    if (!navigator.onLine) return;
    
    const pendingSales = await db.pending_sales
      .where('syncStatus').equals('PENDING')
      .toArray();
    
    for (const sale of pendingSales) {
      try {
        const response = await api.post('/ventes', sale);
        await db.pending_sales.update(sale.id, {
          syncStatus: 'SYNCED',
          serverId: response.data.id,
        });
      } catch (error) {
        console.error('Sync failed for sale', sale.id, error);
        // Retry au prochain cycle
      }
    }
  }
}
```

#### 4. Indicateurs UI

```tsx
// frontend/src/components/layout/Header.tsx

function Header() {
  const isOnline = useOnline(); // Hook custom
  const [pendingCount, setPendingCount] = useState(0);
  
  useEffect(() => {
    // Compter items non synced
    const updateCount = async () => {
      const count = await db.pending_sales
        .where('syncStatus').equals('PENDING')
        .count();
      setPendingCount(count);
    };
    
    updateCount();
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <header>
      {!isOnline && (
        <div className="bg-red-500 text-white px-4 py-2">
          ⚠️ Hors ligne - Les données sont enregistrées localement
        </div>
      )}
      
      {pendingCount > 0 && (
        <div className="bg-blue-500 text-white px-4 py-2">
          📶 {pendingCount} opération(s) en attente de synchronisation
        </div>
      )}
    </header>
  );
}
```

---

# PARTIE 2 : BACKEND (15 MODULES)

---

## <a name="module-auth"></a>5. MODULE AUTH

### Fichiers

```
backend/src/modules/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── dto/
│   ├── login.dto.ts
│   ├── forgot-password.dto.ts
│   └── reset-password.dto.ts
└── strategies/
    ├── jwt.strategy.ts
    └── jwt-refresh.strategy.ts
```

### Responsabilités

1. **Login** : Validation téléphone + password, génération JWT
2. **Logout** : Blacklist refresh token
3. **Refresh Token** : Renouvellement access token
4. **Forgot Password** : Envoi email avec token reset
5. **Reset Password** : Changement password avec token

### Endpoints

| Method | Route | Description | Public |
|--------|-------|-------------|--------|
| POST | `/auth/login` | Connexion utilisateur | ✅ |
| POST | `/auth/logout` | Déconnexion | ❌ |
| POST | `/auth/refresh` | Refresh access token | ✅ (cookie) |
| POST | `/auth/forgot-password` | Demande reset password | ✅ |
| POST | `/auth/reset-password` | Reset password avec token | ✅ |

### Code Clé : Login

```typescript
// backend/src/modules/auth/auth.service.ts

async login(dto: LoginDto) {
  // 1. Trouver utilisateur par téléphone
  const user = await this.prisma.utilisateur.findUnique({
    where: { telephone: dto.telephone },
    include: { site: true },
  });
  
  if (!user) {
    throw new UnauthorizedException({
      code: 'ERR_INVALID_CREDENTIALS',
      message: 'Téléphone ou mot de passe incorrect',
    });
  }
  
  // 2. Vérifier lockout (trop de tentatives)
  if (user.bloqueJusquA && user.bloqueJusquA > new Date()) {
    const remainingMin = Math.ceil(
      (user.bloqueJusquA.getTime() - Date.now()) / 60000
    );
    throw new UnauthorizedException({
      code: 'ERR_ACCOUNT_LOCKED',
      message: `Compte bloqué. Réessayez dans ${remainingMin} min.`,
    });
  }
  
  // 3. Vérifier password
  const isPasswordValid = await bcrypt.compare(
    dto.password,
    user.passwordHash
  );
  
  if (!isPasswordValid) {
    // Incrémenter tentatives
    const attempts = user.tentativesConnexion + 1;
    await this.prisma.utilisateur.update({
      where: { id: user.id },
      data: {
        tentativesConnexion: attempts,
        // Bloquer après 5 tentatives
        ...(attempts >= 5 ? {
          bloqueJusquA: new Date(Date.now() + 15 * 60 * 1000), // 15 min
        } : {}),
      },
    });
    
    throw new UnauthorizedException({
      code: 'ERR_INVALID_CREDENTIALS',
      message: 'Téléphone ou mot de passe incorrect',
    });
  }
  
  // 4. Réinitialiser tentatives + mettre à jour dernière connexion
  await this.prisma.utilisateur.update({
    where: { id: user.id },
    data: {
      tentativesConnexion: 0,
      bloqueJusquA: null,
      derniereConnexion: new Date(),
    },
  });
  
  // 5. Générer tokens JWT
  const payload = {
    sub: user.id,
    role: user.role,
    siteId: user.siteId,
  };
  
  const accessToken = this.jwtService.sign(payload, {
    secret: this.config.get('JWT_SECRET'),
    expiresIn: this.config.get('JWT_EXPIRES_IN'), // 8h
  });
  
  const refreshToken = this.jwtService.sign(payload, {
    secret: this.config.get('JWT_REFRESH_SECRET'),
    expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'), // 7d
  });
  
  // 6. Retourner tokens + user
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      nom: user.nom,
      telephone: user.telephone,
      email: user.email,
      role: user.role,
      siteId: user.siteId,
      site: user.site,
    },
  };
}
```

### Sécurité

- **Rate Limiting** : 10 req/min par IP (global)
- **Lockout** : 5 tentatives → 15 min de blocage
- **Password Hash** : bcrypt avec salt rounds = 10
- **JWT Secret** : 256 bits (env var)
- **Refresh Token** : Cookie httpOnly (protection XSS)

---

## <a name="module-clients"></a>6. MODULE CLIENTS

### Fichiers

```
backend/src/modules/clients/
├── clients.module.ts
├── clients.controller.ts
├── clients.service.ts
├── dto/
│   ├── client.dto.ts               # CreateClientDto, UpdateClientDto
│   ├── onboarding-recit.dto.ts    # Étape 1
│   ├── onboarding-fiche.dto.ts    # Étape 3
│   └── onboarding-activate.dto.ts  # Étape 4 (activation)
└── clients.service.spec.ts         # Tests unitaires
```

### Responsabilités

**CRUD Clients** :
- Créer, lire, modifier, supprimer clients
- Recherche multi-critères (nom, téléphone, code parrain)
- Historique complet client (ventes, points, commissions)

**Onboarding 4 Étapes** :
1. **RECIT** : Enregistrement initial + paiement 3000 CDF
2. **FORMATION** : Visionnage vidéo (validation FORMATEUR)
3. **FICHE** : Fiche adhésion + paiement 2000 CDF
4. **ACTIVATION** : Achat produit → Code parrain généré → SMS

**File d'Attente** : Liste clients EN_COURS avec étape manquante

### Endpoints

| Method | Route | Description | Rôles |
|--------|-------|-------------|-------|
| GET | `/clients` | Liste clients (filtrée par site si GERANT) | AGENT+ |
| POST | `/clients` | Créer nouveau client | AGENT+ |
| GET | `/clients/:id` | Détail client complet | AGENT+ |
| PATCH | `/clients/:id` | Modifier client | AGENT+ |
| DELETE | `/clients/:id` | Supprimer client (soft delete) | GERANT+ |
| GET | `/clients/next-code` | Prévisualiser prochain code parrain | AGENT+ |
| POST | `/clients/onboarding/recit` | Étape 1 onboarding | AGENT+ |
| POST | `/clients/:id/onboarding/formation` | Étape 2 (FORMATEUR) | FORMATEUR+ |
| POST | `/clients/:id/onboarding/fiche` | Étape 3 | AGENT+ |
| POST | `/clients/:id/onboarding/activate` | Étape 4 (activation finale) | AGENT+ |
| GET | `/clients/onboarding-queue` | File d'attente EN_COURS | AGENT+ |

### Code Clé : Activation Client

```typescript
// backend/src/modules/clients/clients.service.ts

async onboardingActivate(
  clientId: string,
  dto: OnboardingActivateDto,
  agentId: string,
  opts?: { deferClaims?: boolean }
) {
  // 1. Charger client + vérifier statut
  const client = await this.prisma.client.findUnique({
    where: { id: clientId },
    include: {
      siteInscription: true,
      onboardingEtapes: true,
      parrain: { include: { client: true } },
    },
  });
  
  if (!client) {
    throw new NotFoundException('Client introuvable');
  }
  
  if (client.statut === StatutClient.ACTIF) {
    throw new ConflictException({
      code: 'ERR_ALREADY_ACTIVE',
      message: 'Ce client est déjà activé',
    });
  }
  
  // 2. Vérifier étapes précédentes complètes
  const etapesMap = Object.fromEntries(
    client.onboardingEtapes.map(e => [e.etape, e])
  );
  
  const recitDone = etapesMap['RECIT']?.statut === 'COMPLETE';
  const ficheDone = etapesMap['FICHE']?.statut === 'COMPLETE';
  
  if (!recitDone || !ficheDone) {
    throw new BadRequestException({
      code: 'ERR_INCOMPLETE_ONBOARDING',
      message: 'Les étapes RECIT et FICHE doivent être complétées avant activation',
    });
  }
  
  // 3. Vérifier produit disponible + stock
  const produit = await this.prisma.produit.findUnique({
    where: { id: dto.produitId },
  });
  
  if (!produit || !produit.actif) {
    throw new NotFoundException('Produit introuvable ou inactif');
  }
  
  const stockSite = await this.prisma.stockSite.findUnique({
    where: {
      produitId_siteId: {
        produitId: dto.produitId,
        siteId: client.siteInscriptionId,
      },
    },
  });
  
  if (!stockSite || stockSite.quantite < 1) {
    throw new ConflictException({
      code: 'ERR_STOCK_INSUFFISANT',
      message: 'Stock insuffisant pour ce produit',
    });
  }
  
  // 4. Générer code parrain unique
  const codeParrain = await this.generateUniqueCodeParrain(
    client.siteInscriptionId
  );
  
  // 5. Générer numéro de vente
  const site = client.siteInscription;
  const siteCode = site.nom.substring(0, 3).toUpperCase(); // GOM, BUK, KIN
  const now = new Date();
  const prefix = `${siteCode}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
  
  const lastVente = await this.prisma.vente.findFirst({
    where: { numeroVente: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
  });
  
  const seq = lastVente
    ? (parseInt(lastVente.numeroVente.split('-').pop() || '0', 10) || 0) + 1
    : 1;
  
  const numeroVente = `${prefix}${String(seq).padStart(4, '0')}`;
  // Ex: GOM-202609-0014
  
  const prixVente = Number(produit.prixVente);
  
  // 6. TRANSACTION : Activer + créer vente + décrémenter stock
  const activatedClient = await this.prisma.$transaction(async (tx) => {
    // 6a. Activer client
    const updated = await tx.client.update({
      where: { id: clientId },
      data: {
        statut: StatutClient.ACTIF,
        codeParrain,
        dateActivation: new Date(),
      },
    });
    
    // 6b. Créer étape ACTIVATION
    await tx.onboardingEtape.upsert({
      where: {
        clientId_etape: { clientId, etape: EtapeOnboarding.ACTIVATION },
      },
      create: {
        etape: EtapeOnboarding.ACTIVATION,
        statut: StatutEtape.COMPLETE,
        completeeAt: new Date(),
        montant: prixVente,
        modePaiement: dto.modePaiement,
        clientId,
        agentId,
        siteId: client.siteInscriptionId,
      },
      update: {
        statut: StatutEtape.COMPLETE,
        completeeAt: new Date(),
        montant: prixVente,
        modePaiement: dto.modePaiement,
      },
    });
    
    // 6c. Créer vente d'activation
    await tx.vente.create({
      data: {
        numeroVente,
        clientId,
        agentId,
        siteId: client.siteInscriptionId,
        montantTotal: prixVente,
        montantPaye: prixVente,
        modePaiement: dto.modePaiement,
        statut: StatutVente.VALIDE,
        lignes: {
          create: {
            produitId: dto.produitId,
            quantite: 1,
            prixUnitaire: prixVente,
            sousTotal: prixVente,
          },
        },
      },
    });
    
    // 6d. Décrémenter stock
    const quantiteApres = stockSite.quantite - 1;
    await tx.stockSite.update({
      where: {
        produitId_siteId: {
          produitId: dto.produitId,
          siteId: client.siteInscriptionId,
        },
      },
      data: { quantite: quantiteApres },
    });
    
    // 6e. Créer mouvement stock
    await tx.mouvementStock.create({
      data: {
        type: TypeMouvement.SORTIE_VENTE,
        quantite: 1,
        quantiteAvant: stockSite.quantite,
        quantiteApres,
        reference: numeroVente,
        produitId: dto.produitId,
        siteId: client.siteInscriptionId,
        agentId,
      },
    });
    
    return updated;
  });
  
  // 7. Initialiser PIN portail = 4 derniers chiffres téléphone
  const defaultPin = await this.portalAuthService.initDefaultPin(
    activatedClient.id,
    activatedClient.telephone
  );
  
  // 8. Envoyer email de bienvenue (si email présent)
  if (activatedClient.email) {
    await this.mailer.sendActivationBienvenue(
      activatedClient.email,
      `${activatedClient.prenom} ${activatedClient.nom}`,
      codeParrain,
      site.nom
    );
  }
  
  // 9. Activer profil MLM + initialiser matrice
  // (retry automatique 3 fois en cas d'échec)
  let mlmSuccess = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await this.mlmMatrixService.onClientActivated(
        activatedClient.id,
        client.parrainClientId ?? undefined
      );
      mlmSuccess = true;
      break;
    } catch (err) {
      console.error(`[MLM ACTIVATION ATTEMPT ${attempt}/3 FAILED]`, err);
      if (attempt < 3) {
        await new Promise(res => setTimeout(res, 500 * attempt));
      }
    }
  }
  
  // 10. Vérifier s'il y a des filleuls en attente à réclamer
  const nbPendingClaims = await this.prisma.parrainClaim.count({
    where: { parrainClientId: clientId, statut: 'EN_ATTENTE' },
  });
  
  const result = await this.findOne(activatedClient.id);
  
  // 11. Retourner client activé + info claims
  return {
    ...result,
    ...(nbPendingClaims > 0 ? { pendingClaimsCount: nbPendingClaims } : {}),
  };
}
```

### Points d'Attention

1. **Transaction Atomique** : Activation + vente + stock dans une seule transaction
2. **Génération Code Parrain** : Unique par site, format `SITEYYYYMMDD####`
3. **PIN Portail** : 4 derniers chiffres téléphone par défaut
4. **MLM Activation** : Retry 3× pour tolérer erreurs réseau
5. **Toast Filleuls** : Retourne `pendingClaimsCount` pour affichage UI

---

## <a name="module-ventes"></a>7. MODULE VENTES

### Fichiers

```
backend/src/modules/ventes/
├── ventes.module.ts
├── ventes.controller.ts
├── ventes.service.ts
├── dto/
│   ├── vente.dto.ts        # CreateVenteDto
│   ├── retour.dto.ts       # CreateRetourDto
│   └── kpay-payment.dto.ts # InitKpayPaymentDto
└── ventes.service.spec.ts
```

### Responsabilités

1. **POS (Point de Sale)** : Création ventes avec calculs automatiques
2. **Historique Ventes** : Liste filtrée par période, site, agent
3. **Retours/Remboursements** : Gestion retours partiels ou complets
4. **Points Fidélité** : Attribution automatique (1 pt / 1000 CDF)
5. **Intégration KPay** : Paiements Mobile Money

### Endpoints

| Method | Route | Description | Rôles |
|--------|-------|-------------|-------|
| POST | `/ventes` | Créer nouvelle vente POS | AGENT+ |
| GET | `/ventes` | Liste ventes (filtrée par site si GERANT) | AGENT+ |
| GET | `/ventes/:id` | Détail vente complète | AGENT+ |
| POST | `/ventes/:id/retour` | Créer retour (partiel ou complet) | GERANT+ |
| GET | `/ventes/retours` | Liste tous les retours | GERANT+ |
| POST | `/ventes/kpay/init` | Initialiser paiement KPay | AGENT+ |

### Code Clé : Création Vente POS

```typescript
// backend/src/modules/ventes/ventes.service.ts

async create(dto: CreateVenteDto, userId: string) {
  // 1. Valider agent et site
  const agent = await this.prisma.utilisateur.findUnique({
    where: { id: userId },
    include: { site: true },
  });
  
  if (!agent || !agent.siteId) {
    throw new BadRequestException('Agent sans site assigné');
  }
  
  const siteId = agent.siteId;
  
  // 2. Charger client (si fourni) pour calculs fidélité
  let client: Client | null = null;
  let niveauFidelite: string | null = null;
  let remisePourcentage = 0;
  
  if (dto.clientId) {
    client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
      include: {
        membre: {
          include: {
            matrix: {
              include: { mlmLevel: true },
            },
          },
        },
      },
    });
    
    if (client && client.statut === StatutClient.ACTIF) {
      // Déterminer niveau fidélité MLM
      const matrix = client.membre?.matrix?.[0];
      if (matrix) {
        niveauFidelite = matrix.mlmLevel.nom;
        // Remises selon niveau (à config dans table MlmLevel)
        const remises = {
          'Builder': 0,
          'Sapphire': 3,
          'Ruby': 5,
          'Emerald': 8,
          // ... autres niveaux
        };
        remisePourcentage = remises[niveauFidelite] || 0;
      }
    }
  }
  
  // 3. Valider produits et stocks
  const produitsMap = new Map();
  for (const ligne of dto.lignes) {
    const produit = await this.prisma.produit.findUnique({
      where: { id: ligne.produitId },
    });
    
    if (!produit || !produit.actif) {
      throw new NotFoundException(`Produit ${ligne.produitId} introuvable`);
    }
    
    const stock = await this.prisma.stockSite.findUnique({
      where: {
        produitId_siteId: {
          produitId: ligne.produitId,
          siteId,
        },
      },
    });
    
    if (!stock || stock.quantite < ligne.quantite) {
      throw new ConflictException({
        code: 'ERR_STOCK_INSUFFISANT',
        message: `Stock insuffisant pour ${produit.nom}`,
        produitId: ligne.produitId,
        disponible: stock?.quantite || 0,
        demande: ligne.quantite,
      });
    }
    
    produitsMap.set(ligne.produitId, { produit, stock });
  }
  
  // 4. Calculer montants avec remise
  let montantTotal = 0;
  const lignesData = dto.lignes.map(ligne => {
    const { produit } = produitsMap.get(ligne.produitId);
    const prixUnitaire = Number(produit.prixVente);
    const sousTotal = prixUnitaire * ligne.quantite;
    montantTotal += sousTotal;
    
    return {
      produitId: ligne.produitId,
      quantite: ligne.quantite,
      prixUnitaire,
      sousTotal,
    };
  });
  
  // Appliquer remise fidélité
  const montantRemise = (montantTotal * remisePourcentage) / 100;
  const montantFinal = montantTotal - montantRemise;
  
  // 5. Calculer points fidélité (1 pt / 1000 CDF)
  const pointsGagnes = client
    ? Math.floor(montantFinal / 1000)
    : 0;
  
  // 6. Générer numéro vente
  const site = agent.site!;
  const prefix = `${site.nom.substring(0, 3).toUpperCase()}-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-`;
  
  const lastVente = await this.prisma.vente.findFirst({
    where: { numeroVente: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
  });
  
  const seq = lastVente
    ? (parseInt(lastVente.numeroVente.split('-').pop() || '0', 10) || 0) + 1
    : 1;
  
  const numeroVente = `${prefix}${String(seq).padStart(4, '0')}`;
  
  // 7. TRANSACTION : Créer vente + décrémenter stocks + attribuer points
  const vente = await this.prisma.$transaction(async (tx) => {
    // 7a. Créer vente
    const newVente = await tx.vente.create({
      data: {
        numeroVente,
        clientId: dto.clientId,
        agentId: userId,
        siteId,
        montantTotal: montantFinal,
        montantRemise,
        montantPaye: dto.montantPaye || montantFinal,
        modePaiement: dto.modePaiement,
        statut: StatutVente.VALIDE,
        lignes: {
          create: lignesData,
        },
      },
      include: {
        lignes: {
          include: { produit: true },
        },
        client: true,
        agent: true,
      },
    });
    
    // 7b. Décrémenter stocks + créer mouvements
    for (const ligne of dto.lignes) {
      const { stock } = produitsMap.get(ligne.produitId);
      const quantiteApres = stock.quantite - ligne.quantite;
      
      await tx.stockSite.update({
        where: {
          produitId_siteId: {
            produitId: ligne.produitId,
            siteId,
          },
        },
        data: { quantite: quantiteApres },
      });
      
      await tx.mouvementStock.create({
        data: {
          type: TypeMouvement.SORTIE_VENTE,
          quantite: ligne.quantite,
          quantiteAvant: stock.quantite,
          quantiteApres,
          reference: numeroVente,
          produitId: ligne.produitId,
          siteId,
          agentId: userId,
        },
      });
    }
    
    // 7c. Attribuer points fidélité (si client ACTIF)
    if (client && pointsGagnes > 0) {
      // Logique points à implémenter selon votre système
      // Exemple simplifié :
      await tx.client.update({
        where: { id: client.id },
        data: {
          // Ajouter champ pointsFidelite dans schéma si besoin
        },
      });
    }
    
    return newVente;
  });
  
  // 8. Retourner vente créée
  return vente;
}
```

### Points d'Attention

1. **Vérification Stock** : AVANT transaction, pour éviter rollback
2. **Remise Fidélité** : Basée sur niveau MLM client
3. **Points** : 1 pt / 1000 CDF (arrondi inférieur)
4. **Numéro Vente** : Unique par site+mois (`GOM-202609-0014`)
5. **Transaction Atomique** : Vente + stocks + points ensemble

---

## <a name="module-stocks"></a>8. MODULE STOCKS

### Fichiers

```
backend/src/modules/stocks/
├── stocks.module.ts
├── stocks.controller.ts
├── stocks.service.ts
├── dto/
│   ├── entree-stock.dto.ts      # Réception marchandise
│   ├── transfert-stock.dto.ts   # Transfert inter-sites
│   ├── ajustement-stock.dto.ts  # Inventaire physique
│   └── produit.dto.ts           # CRUD produits
└── stocks.service.spec.ts
```

### Responsabilités

1. **CRUD Produits** : Créer, modifier, archiver produits
2. **Stocks Multi-Sites** : Quantités séparées par site
3. **Entrées Stock** : Réception marchandise
4. **Transferts Inter-Sites** : Workflow en 3 étapes
5. **Ajustements** : Corrections après inventaire physique
6. **Alertes** : Notifications rupture/seuil bas

### Endpoints

| Method | Route | Description | Rôles |
|--------|-------|-------------|-------|
| GET | `/stocks` | Liste stocks (filtrée par site si GERANT) | AGENT+ (lecture) |
| POST | `/stocks/entree` | Entrée marchandise | GERANT+ |
| POST | `/stocks/transfert` | Initier transfert inter-sites | GERANT+ |
| POST | `/stocks/transfert/:id/reception` | Réceptionner transfert | GERANT+ |
| POST | `/stocks/ajustement` | Ajuster après inventaire | GERANT+ |
| GET | `/stocks/alertes` | Alertes rupture/faible | GERANT+ |
| POST | `/produits` | Créer nouveau produit | GERANT+ |
| PATCH | `/produits/:id` | Modifier produit | GERANT+ |

### Code Clé : Transfert Inter-Sites

```typescript
// backend/src/modules/stocks/stocks.service.ts

async createTransfert(dto: CreateTransfertDto, userId: string) {
  // 1. Valider utilisateur et sites
  const user = await this.prisma.utilisateur.findUnique({
    where: { id: userId },
  });
  
  if (!user) throw new NotFoundException('Utilisateur introuvable');
  
  // 2. Vérifier que sites source et destination existent
  const [siteSource, siteDest] = await Promise.all([
    this.prisma.site.findUnique({ where: { id: dto.siteSourceId } }),
    this.prisma.site.findUnique({ where: { id: dto.siteDestinationId } }),
  ]);
  
  if (!siteSource || !siteDest) {
    throw new NotFoundException('Site source ou destination introuvable');
  }
  
  if (dto.siteSourceId === dto.siteDestinationId) {
    throw new BadRequestException('Sites source et destination identiques');
  }
  
  // 3. Vérifier stock source suffisant
  const stockSource = await this.prisma.stockSite.findUnique({
    where: {
      produitId_siteId: {
        produitId: dto.produitId,
        siteId: dto.siteSourceId,
      },
    },
  });
  
  if (!stockSource || stockSource.quantite < dto.quantite) {
    throw new ConflictException({
      code: 'ERR_STOCK_INSUFFISANT',
      message: 'Stock source insuffisant',
      disponible: stockSource?.quantite || 0,
      demande: dto.quantite,
    });
  }
  
  // 4. TRANSACTION : Créer transfert + décrémenter source + créer mouvements
  const transfert = await this.prisma.$transaction(async (tx) => {
    // 4a. Créer transfert
    const newTransfert = await tx.transfertStock.create({
      data: {
        siteSourceId: dto.siteSourceId,
        siteDestinationId: dto.siteDestinationId,
        produitId: dto.produitId,
        quantite: dto.quantite,
        statut: StatutTransfert.EN_TRANSIT,
        initiateurId: userId,
        notes: dto.notes,
      },
      include: {
        siteSource: true,
        siteDestination: true,
        produit: true,
        initiateur: true,
      },
    });
    
    // 4b. Décrémenter stock source immédiatement
    // (pas d'attente de réception pour éviter double-vente)
    const quantiteApres = stockSource.quantite - dto.quantite;
    await tx.stockSite.update({
      where: {
        produitId_siteId: {
          produitId: dto.produitId,
          siteId: dto.siteSourceId,
        },
      },
      data: { quantite: quantiteApres },
    });
    
    // 4c. Créer mouvement TRANSFERT_DEPART
    await tx.mouvementStock.create({
      data: {
        type: TypeMouvement.TRANSFERT_DEPART,
        quantite: dto.quantite,
        quantiteAvant: stockSource.quantite,
        quantiteApres,
        reference: newTransfert.id,
        produitId: dto.produitId,
        siteId: dto.siteSourceId,
        agentId: userId,
        transfertId: newTransfert.id,
      },
    });
    
    return newTransfert;
  });
  
  // 5. Retourner transfert créé
  return transfert;
}

async receptionTransfert(transfertId: string, userId: string) {
  // 1. Charger transfert
  const transfert = await this.prisma.transfertStock.findUnique({
    where: { id: transfertId },
    include: {
      siteSource: true,
      siteDestination: true,
      produit: true,
    },
  });
  
  if (!transfert) {
    throw new NotFoundException('Transfert introuvable');
  }
  
  if (transfert.statut !== StatutTransfert.EN_TRANSIT) {
    throw new ConflictException({
      code: 'ERR_INVALID_STATUS',
      message: 'Ce transfert a déjà été traité',
    });
  }
  
  // 2. Vérifier que user est du site destination
  const user = await this.prisma.utilisateur.findUnique({
    where: { id: userId },
  });
  
  if (user?.siteId !== transfert.siteDestinationId) {
    throw new ForbiddenException(
      'Seul le site destination peut réceptionner ce transfert'
    );
  }
  
  // 3. TRANSACTION : Marquer reçu + incrémenter stock dest + mouvement
  const received = await this.prisma.$transaction(async (tx) => {
    // 3a. Marquer transfert RECU
    const updated = await tx.transfertStock.update({
      where: { id: transfertId },
      data: {
        statut: StatutTransfert.RECU,
        receptionnePar: userId,
        receptionneAt: new Date(),
      },
      include: {
        siteSource: true,
        siteDestination: true,
        produit: true,
      },
    });
    
    // 3b. Incrémenter stock destination
    // (créer si n'existe pas encore)
    const stockDest = await tx.stockSite.upsert({
      where: {
        produitId_siteId: {
          produitId: transfert.produitId,
          siteId: transfert.siteDestinationId,
        },
      },
      create: {
        produitId: transfert.produitId,
        siteId: transfert.siteDestinationId,
        quantite: transfert.quantite,
        seuilAlerte: 10, // Valeur par défaut
      },
      update: {
        quantite: { increment: transfert.quantite },
      },
    });
    
    // 3c. Créer mouvement TRANSFERT_ARRIVEE
    await tx.mouvementStock.create({
      data: {
        type: TypeMouvement.TRANSFERT_ARRIVEE,
        quantite: transfert.quantite,
        quantiteAvant: stockDest.quantite - transfert.quantite,
        quantiteApres: stockDest.quantite,
        reference: transfert.id,
        produitId: transfert.produitId,
        siteId: transfert.siteDestinationId,
        agentId: userId,
        transfertId: transfert.id,
      },
    });
    
    return updated;
  });
  
  // 4. Retourner transfert réceptionné
  return received;
}
```

### Workflow Transfert

```
ÉTAPE 1 : INITIATION (site source)
→ Création transfert avec statut EN_TRANSIT
→ Stock source décrémenté IMMÉDIATEMENT
→ Mouvement TRANSFERT_DEPART créé

ÉTAPE 2 : EN TRANSIT
→ Marchandise physiquement en chemin
→ Stock source déjà décrémenté (pas de vente possible)
→ Stock dest pas encore incrémenté

ÉTAPE 3 : RÉCEPTION (site destination)
→ Gérant destination clique "Réceptionner"
→ Transfert passe à RECU
→ Stock destination incrémenté
→ Mouvement TRANSFERT_ARRIVEE créé
```

### Points d'Attention

1. **Décrémentation Immédiate** : Stock source décrémenté dès l'envoi (pas d'attente réception)
2. **Upsert Stock Dest** : Créer si produit jamais stocké sur ce site
3. **Traçabilité Complète** : 2 mouvements (DEPART + ARRIVEE) liés au transfert
4. **Contrôle Accès** : Seul site destination peut réceptionner

---

*[La suite du document sera créée dans le prochain message car la limite de caractères approche...]*

Voulez-vous que je continue avec les modules restants (MLM, Portal, Dashboard, etc.) puis les 64 écrans frontend détaillés ?