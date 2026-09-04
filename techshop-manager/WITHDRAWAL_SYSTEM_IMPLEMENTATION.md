# Système de Retrait des Commissions MLM - Documentation

## 📋 Vue d'ensemble

Ce document décrit l'implémentation complète du système de demande de retrait des commissions validées depuis le portail client avec approbation admin.

## 🎯 Fonctionnalités

### Pour les Clients (Portail)
- ✅ Visualisation des commissions validées disponibles
- ✅ Sélection multiple de commissions pour retrait groupé
- ✅ Choix du mode de retrait : **Mobile Money** ou **Espèces sur place**
- ✅ Formulaire de demande avec validation
- ✅ Historique complet des demandes avec statuts
- ✅ Tracking en temps réel des demandes

### Pour les Administrateurs
- ✅ Liste complète des demandes de retrait
- ✅ Filtrage par statut
- ✅ Vue détaillée de chaque demande
- ✅ Approbation avec notes optionnelles
- ✅ Rejet avec motif obligatoire
- ✅ Marquage comme payé (pour Mobile Money)
- ✅ Traitement automatique pour les retraits en espèces

## 🗂️ Structure de la Base de Données

### Modèle `WithdrawalRequest`

```prisma
model WithdrawalRequest {
  id                String                   @id @default(uuid())
  membreId          String
  montant           Decimal                  @db.Decimal(12, 2)
  type              WithdrawalRequestType    // MOBILE_MONEY | CASH
  provider          String?                  // VODACOM_MPESA_COD, AIRTEL_COD, ORANGE_COD
  phoneNumber       String?
  statut            WithdrawalRequestStatut  // EN_ATTENTE | APPROUVE | REJETE | PAYE | ANNULE
  commissionIds     Json                     // Array des IDs commissions
  notes             String?
  rejectReason      String?
  createdAt         DateTime                 @default(now())
  updatedAt         DateTime                 @updatedAt
  approvedAt        DateTime?
  approvedById      String?
  paidAt            DateTime?

  membre            Membre                   @relation(fields: [membreId], references: [id])

  @@index([membreId])
  @@index([statut])
  @@map("withdrawal_requests")
}
```

### Enums

```prisma
enum WithdrawalRequestStatut {
  EN_ATTENTE  // Demande soumise, en attente d'approbation admin
  APPROUVE    // Approuvée par admin, en attente de paiement (Mobile Money)
  REJETE      // Rejetée par admin avec motif
  PAYE        // Paiement effectué et confirmé
  ANNULE      // Annulée par le système ou l'admin
}

enum WithdrawalRequestType {
  MOBILE_MONEY  // Retrait via opérateur mobile (M-Pesa, Airtel, Orange)
  CASH          // Retrait en espèces sur place
}
```

## 🔄 Flux de Traitement

### 1. Création de la demande (Client)

```
Client → Sélectionne commissions VALIDEE
      → Choisit type (Mobile Money / Cash)
      → Remplit formulaire
      → Soumet demande
      → Statut: EN_ATTENTE
```

**Validation backend:**
- Vérification que les commissions existent et sont VALIDEE
- Vérification que les commissions appartiennent au membre
- Vérification que les commissions ne sont pas déjà utilisées
- Vérification des infos de paiement selon le type

### 2. Traitement par l'admin

#### Option A: Retrait CASH

```
Admin → Examine demande
      → Approuve
      → Commissions marquées PAYEE
      → Demande automatiquement marquée PAYE
```

**Processus automatique:**
- Approbation → Statut PAYE immédiat
- Commissions → PAYEE
- Client peut retirer sur place

#### Option B: Retrait MOBILE_MONEY

```
Admin → Examine demande
      → Approuve
      → Commissions marquées PAYEE
      → Statut → APPROUVE (attente confirmation opérateur)
      → Opérateur traite paiement
Admin → Vérifie paiement opérateur
      → Marque comme payé
      → Statut → PAYE
```

### 3. Rejet d'une demande

```
Admin → Examine demande
      → Rejette avec motif
      → Statut → REJETE
      → Client reçoit notification avec raison
      → Commissions restent VALIDEE et disponibles
```

## 🔗 API Endpoints

### Portail Client

#### `GET /portal/commissions/validated`
Récupère la liste des commissions validées disponibles pour retrait.

**Réponse:**
```json
{
  "commissions": [
    {
      "id": "uuid",
      "montant": 50.00,
      "description": "Commission niveau Bronze",
      "createdAt": "2024-01-15T10:00:00Z",
      "valideeAt": "2024-01-16T14:30:00Z",
      "level": { "id": 1, "ordre": 1, "nom": "Bronze" },
      "filleul": {
        "id": "uuid",
        "matricule": "202401150001",
        "client": { "prenom": "Jean", "nom": "Dupont" }
      }
    }
  ],
  "totalDisponible": 250.00
}
```

#### `POST /portal/withdrawal-requests`
Crée une nouvelle demande de retrait.

**Body:**
```json
{
  "montant": 100.00,
  "type": "MOBILE_MONEY",
  "provider": "VODACOM_MPESA_COD",
  "phoneNumber": "243999123456",
  "commissionIds": ["uuid1", "uuid2"],
  "notes": "Retrait mensuel"
}
```

#### `GET /portal/withdrawal-requests`
Liste l'historique des demandes du client.

**Query params:**
- `statut`: EN_ATTENTE | APPROUVE | PAYE | REJETE | ANNULE
- `page`: Numéro de page (défaut: 1)
- `limit`: Nombre par page (défaut: 20)

### Administration (MLM)

#### `GET /mlm/withdrawal-requests`
Liste toutes les demandes de retrait.

**Query params:**
- `statut`: Filtre par statut
- `membreId`: Filtre par membre
- `page`: Numéro de page
- `limit`: Nombre par page

#### `PUT /mlm/withdrawal-requests/:id/approve`
Approuve une demande de retrait.

**Body:**
```json
{
  "approvedById": "admin-user-id",
  "notes": "Vérifié et approuvé"
}
```

**Comportement:**
- Type CASH → Statut passe directement à PAYE
- Type MOBILE_MONEY → Statut passe à APPROUVE
- Commissions associées → Statut PAYEE

#### `PATCH /mlm/withdrawal-requests/:id/reject`
Rejette une demande de retrait.

**Body:**
```json
{
  "rejectReason": "Documents manquants"
}
```

#### `PUT /mlm/withdrawal-requests/:id/mark-paid`
Marque une demande approuvée comme payée (Mobile Money uniquement).

## 🎨 Pages Frontend

### 1. `PortalWithdrawalPage.tsx` (Client)
**Route:** `/portal/commissions`

**Composants:**
- Liste des commissions sélectionnables
- Formulaire de demande
- Historique des demandes
- Onglets: Nouvelle demande / Historique

**Fonctionnalités:**
- Sélection multiple avec total dynamique
- Validation formulaire côté client
- États visuels (badges colorés)
- Messages d'erreur contextuels

### 2. `MlmWithdrawalRequestsPage.tsx` (Admin)
**Route:** `/mlm/withdrawal-requests`

**Composants:**
- Cartes récapitulatives par statut
- Tableau détaillé avec filtres
- Modals d'approbation/rejet
- Pagination

**Fonctionnalités:**
- Filtrage par statut
- Tri et recherche
- Actions groupées
- Exports possibles

### 3. `NotFoundPage.tsx`
**Route:** `/*` (catch-all)

Page 404 personnalisée avec:
- Design moderne et responsive
- Boutons retour et accueil
- Liens vers pages principales
- Animation subtile

## 🧩 Composants de Navigation

### `PortalNav.tsx`
Navigation mobile du portail client (4 onglets):
- 🏠 Accueil
- 🛍️ Achats
- 💰 Commissions (nouveau)
- 👥 Filleuls

### `MlmDashboardPage.tsx`
Bouton "Retraits" ajouté dans les actions rapides:
```tsx
<Link to="/mlm/withdrawal-requests">
  <Clock size={15} /> Retraits
</Link>
```

## 🛡️ Sécurité & Validation

### Backend
- ✅ Authentification JWT requise
- ✅ Vérification des rôles (CLIENT pour portail, GERANT+ pour admin)
- ✅ Validation des DTOs avec `class-validator`
- ✅ Vérification propriétaire des ressources
- ✅ Transactions Prisma pour cohérence des données
- ✅ Protection contre double utilisation des commissions

### Frontend
- ✅ Guards d'authentification et de rôles
- ✅ Validation formulaires avec Zod
- ✅ Gestion d'erreurs avec toasts
- ✅ États de chargement
- ✅ Désactivation boutons pendant mutations

## 📊 États et Transitions

```
EN_ATTENTE → APPROUVE → PAYE (Mobile Money)
EN_ATTENTE → PAYE (Cash direct)
EN_ATTENTE → REJETE (Rejet admin)
EN_ATTENTE → ANNULE (Annulation système)
```

**Règles de transition:**
- Seul EN_ATTENTE peut être approuvé ou rejeté
- Seul APPROUVE peut être marqué payé
- PAYE et REJETE sont des états finaux
- ANNULE peut survenir en cas d'erreur système

## 🔧 Configuration & Déploiement

### 1. Migration Base de Données

```bash
cd techshop-manager/backend
npx prisma generate
npx prisma db push
```

### 2. Démarrage Backend

```bash
cd techshop-manager/backend
npm run start:dev
```

### 3. Démarrage Frontend

```bash
cd techshop-manager/frontend
npm run dev
```

### 4. Build Production

```bash
# Backend
cd techshop-manager/backend
npm run build

# Frontend
cd techshop-manager/frontend
npm run build
```

## 📁 Fichiers Créés/Modifiés

### Backend (6 fichiers)
```
✅ backend/prisma/schema.prisma
✅ backend/src/modules/portal/dto/withdrawal.dto.ts (nouveau)
✅ backend/src/modules/portal/portal.controller.ts
✅ backend/src/modules/portal/portal.service.ts
✅ backend/src/modules/mlm/mlm.controller.ts
✅ backend/src/modules/mlm/mlm-wallet.service.ts
```

### Frontend (8 fichiers)
```
✅ frontend/src/lib/portal.api.ts
✅ frontend/src/lib/mlm.api.ts
✅ frontend/src/pages/portal/PortalWithdrawalPage.tsx (nouveau)
✅ frontend/src/pages/mlm/MlmWithdrawalRequestsPage.tsx (nouveau)
✅ frontend/src/pages/NotFoundPage.tsx (nouveau)
✅ frontend/src/components/portal/PortalNav.tsx
✅ frontend/src/pages/mlm/MlmDashboardPage.tsx
✅ frontend/src/App.tsx
```

## 🧪 Tests Suggérés

### Scénarios Client
1. ✓ Visualiser commissions disponibles
2. ✓ Sélectionner plusieurs commissions
3. ✓ Soumettre demande Mobile Money
4. ✓ Soumettre demande Cash
5. ✓ Voir historique des demandes
6. ✓ Vérifier qu'une commission utilisée n'apparaît plus

### Scénarios Admin
1. ✓ Voir toutes les demandes EN_ATTENTE
2. ✓ Approuver demande Cash → vérifier statut PAYE
3. ✓ Approuver demande Mobile Money → vérifier statut APPROUVE
4. ✓ Marquer Mobile Money payé → vérifier statut PAYE
5. ✓ Rejeter demande → vérifier commission reste disponible
6. ✓ Filtrer par statut

### Validation Erreurs
1. ✓ Tentative de retrait commission déjà utilisée
2. ✓ Tentative de retrait commission non-validée
3. ✓ Montant supérieur au total des commissions
4. ✓ Mobile Money sans numéro de téléphone
5. ✓ Tentative d'approuver demande déjà traitée

## 💡 Améliorations Futures

### Court terme
- [ ] Notifications push lors de changement de statut
- [ ] Export PDF des demandes
- [ ] Statistiques de retraits par période

### Long terme
- [ ] Intégration directe avec API KPay pour Mobile Money
- [ ] Signatures électroniques pour retraits Cash
- [ ] Limites de retrait configurable
- [ ] Frais de traitement configurables
- [ ] Historique d'audit complet

## 📞 Support

Pour toute question ou problème:
- **Email:** support@techshop-manager.com
- **Documentation:** `/docs`
- **Issues:** GitHub Issues

---

**Date de création:** 1er septembre 2026  
**Version:** 1.0.0  
**Auteur:** Progress Business Development Team  
**Statut:** ✅ Production Ready
