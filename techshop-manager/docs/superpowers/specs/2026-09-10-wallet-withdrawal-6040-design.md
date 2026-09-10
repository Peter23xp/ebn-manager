# Spec — Retrait portefeuille : règle 60/40 + flux solde → admin

**Date :** 2026-09-10
**Statut :** Approuvée (brainstorming utilisateur)
**Pages concernées :** `/portal/home` (carte WalletCard), `/portal/commissions` (demande de retrait), `/mlm/withdrawal-requests` (admin)

## 1. Problème

La carte WalletCard du portail affiche le solde mais son bouton « Retirer » ouvre une fausse modale WhatsApp — cul-de-sac. Or un flux de retrait complet existe déjà (`/portal/commissions` → `WithdrawalRequest` → admin → débit du portefeuille).

De plus, une règle métier n'est pas implémentée : **le client ne peut retirer immédiatement que 60 % de ses gains ; les 40 % sont un réinvestissement bloqué 30 jours**, après quoi ils deviennent retirable.

## 2. Décisions prises

| # | Décision |
|---|----------|
| D1 | Le bouton Retirer redirige vers le flux existant `/portal/commissions` (pas de modale rapide). La modale WhatsApp est supprimée. |
| D2 | 60 % retirable immédiatement ; 40 % = réserve de réinvestissement libérée **30 jours après son crédit**. |
| D3 | Application **côté serveur à la source** : deux poches distinctes dans le portefeuille ; le client ne peut demander que ce qui est réellement dans la poche « dispo ». |
| D4 | La carte affiche le **détail par lot** des réinvestissements (« $40 — libéré le 12 oct »), pas un total global seul. |
| D5 | Les soldes **existants** en base sont considérés comme déjà libérés (pas de rétro-blocage). Migration additive, valeurs par défaut à 0. |

## 3. Conséquence architecturale (à valider à la lecture)

Les demandes de retrait passent d'un modèle **basé sur la sélection de commissions** (le client coche des commissions, l'admin débiterait la somme des montants) à un modèle **basé sur le solde** : le client indique un montant ≤ solde retirable, choisit Mobile Money ou Espèces, et l'approbation débite ce montant du portefeuille. C'est exactement le besoin exprimé (« l'argent se déduit sur cette carte »).

- La colonne `commissionIds` de `WithdrawalRequest` devient **optionnelle** (conservée pour l'historique et l'audit futur) ; les nouvelles demandes l'envoient vide.
- Les commissions restent la source du **crédit** (validation → 60 % dans la poche dispo + 40 % bloqué). Elles ne sont plus la source du **débit**.
- Le statut `PAYEE` des commissions n'est plus déclenché par le retrait (plus de risque de double retrait : le plafond est le solde lui-même).
- YAGNI : pas de consommation FIFO des commissions au retrait.

## 4. Modèle de données (Prisma)

### 4.1 `Portefeuille` — nouvelle colonne

```prisma
model Portefeuille {
  // …existant : soldeDisponible, soldeReserve, totalGagne…
  soldeReinvesti Decimal @default(0) @db.Decimal(12, 2) // 40 % bloqué (pas encore libéré)
}
```

Invariants :
- `soldeDisponible` = argent **retirable maintenant** (60 % validés + lots libérés − retraits approuvés).
- `soldeReserve` = réservé par une demande EN_ATTENTE (empêche double demande).
- `soldeReinvesti` = somme des lots non libérés.
- **Retirable** = `soldeDisponible − soldeReserve`.

### 4.2 Nouveau modèle `ReinvestLote`

```prisma
model ReinvestLote {
  id           String   @id @default(uuid())
  membreId     String
  amount       Decimal  @db.Decimal(12, 2)
  releasedAt   DateTime // date du crédit + 30 jours
  released     Boolean  @default(false)
  commissionId String?  // traçabilité : commission d'origine
  createdAt    DateTime @default(now())

  membre Membre @relation(fields: [membreId], references: [id])
  @@index([released, releasedAt])
  @@index([membreId])
  @@map("reinvest_lots")
}
```

### 4.3 Migration

- `migrate diff` + `migrate deploy` (procédure non-interactive éprouvée dans ce repo).
- Additive uniquement : `soldeReinvesti` défaut 0, table vide → les soldes existants restent intégralement dans `soldeDisponible` (conforme D5).

## 5. Logique métier (backend)

### 5.1 Crédit — `mlm-matrix.service.ts`

Le `montantRetour` (40 %), auto-crédité à la création de la commission, ne va plus dans `soldeDisponible` :

```
portefeuille.soldeReinvesti  += montantRetour
ReinvestLote.create({ membreId, amount: montantRetour,
                      releasedAt: now + 30j, commissionId })
transactionPortefeuille.create({ type: REINVESTISSEMENT, … })  // déjà existant
```

Le `montantSysteme` (60 %) à la validation : **inchangé** → `soldeDisponible`.

### 5.2 Libération — service cron (`@nestjs/schedule`, déjà dépendance)

Nouveau `ReinvestReleaseService` dans le module `mlm` :
- `@Cron(CronExpression.EVERY_HOUR)` (redondant sur multi-instance → garde `updateMany` conditionné par `released = false`, idempotent).
- Pour chaque lot `released = false, releasedAt <= now` dans une transaction :
  `soldeReinvesti -= amount ; soldeDisponible += amount ; lot.released = true`.
- Pas de `transactionPortefeuille` séparée (le crédit REINVESTISSEMENT a déjà été journalisé ; la libération est un transfert interne).

### 5.3 Demande de retrait — `portal.service.ts`

`createWithdrawalRequest(clientId, dto)` reformé :
- `dto = { montant: number; type: 'MOBILE_MONEY'|'CASH'; provider?; phoneNumber?; notes? }` (`commissionIds` supprimé du DTO ; champ conservé en base, vide).
- Contrôles serveur : montant > 0 ; téléphone requis/normalisé pour MOBILE_MONEY ; **montant ≤ soldeDisponible − soldeReserve** sinon `400 ERR_INSUFFICIENT_WITHDRAWABLE` avec le max dans le message.
- Réserve : `soldeReserve += montant` à la création (empêche le cumul de demandes sur le même argent). Annulation (existant) : restitution de la réserve.

### 5.4 Approbation admin — `mlm-wallet.service.approveWithdrawalRequest`

- Débite `request.montant` (et non la somme des commissions) : `soldeDisponible -= montant` ; `soldeReserve -= montant` (la réserve prise à la création est consommée) ; `transactionPortefeuille` DEBIT (déjà écrit ainsi).
- Vérifie `soldeDisponible ≥ montant` au moment de l'approbation (cas : argent déjà retiré via un autre canal).
- CASH → `PAYE` auto (existant) ; MOBILE_MONEY → `APPROUVE` puis marquage `PAYE` par l'admin (existant).
- Le bloc de vérification des commissions (437–451) est retiré.

### 5.5 Lecture — `getWallet` (portal)

Réponse enrichie :

```json
{
  "wallet": {
    "soldeDisponible": 120, "soldeReserve": 0,
    "soldeDisponibleRetrait": 120,
    "soldeReinvesti": 80, "totalGagne": 200
  },
  "reinvestLots": [
    { "id": "…", "amount": 40, "releasedAt": "2026-10-12T…", "released": false },
    { "id": "…", "amount": 40, "releasedAt": "2026-09-28T…", "released": true }
  ],
  "stats": { "gainsTotaux": 200 }
}
```

`MlmWalletService.getWallet` (endpoint admin) renvoie aussi `soldeReinvesti`.

## 6. Frontend

### 6.1 `WalletCard.tsx`

- Solde principal affiché = `soldeDisponibleRetrait` (libellé « Disponible au retrait »).
- Ligne secondaire : « Réinvesti : $X — libération : [liste des lots non libérés, montant + date formatée] ».
- Bouton **Retirer** → `navigate('/portal/commissions')`. Si solde dispo = 0 : bouton désactivé avec mention « Rien à retirer pour l'instant ».
- Suppression complète de la modale WhatsApp et de l'état `showWithdraw`.

### 6.2 `PortalWithdrawalPage.tsx` (`/portal/commissions`)

- En-tête : « Vous pouvez retirer jusqu'à **$N** » (= `soldeDisponibleRetrait`).
- Remplace la sélection de commissions par un **champ montant** (input + bouton « Tout ») ; validation `0 < montant ≤ N`.
- Options Mobile Money (opérateur + numéro, déjà en place) / Espèces (info bureau, déjà en place).
- Onglet Historique : inchangé (cartes `WithdrawalRequestCard`, sans la ligne « X commissions incluses »).
- La query `getValidatedCommissions` n'est plus appelée par cette page (gardée côté API pour référence/audit).

### 6.3 Admin `MlmWithdrawalRequestsPage.tsx`

- Aucune modification d'écran nécessaire (montant, type, coordonnées déjà affichés). Le bouton approuver fonctionne tel quel.

## 7. Gestion des erreurs (codes serveur)

| Code | Quand | Affichage client |
|------|-------|------------------|
| `ERR_INSUFFICIENT_WITHDRAWABLE` | montant > solde retirable | toast « Retrait max : $N » |
| `ERR_MISSING_PAYMENT_INFO` | mobile sans provider/numéro | existant |
| `ERR_NOT_CANCELLABLE` | annulation hors EN_ATTENTE | existant |
| Erreur approbation (solde insuffisant / déjà traitée) | admin | toast admin (existant) |

## 8. Tests

**Backend (jest, motif mocks-objets-prisma du repo) :**
- `mlm-matrix` : crédit 40 % → `soldeReinvesti` + création `ReinvestLote` (`releasedAt = +30j`) ; 60 % inchangés.
- `reinvest-release.spec.ts` : lot échéant → transfert + `released = true` ; lot non échéant → rien ; idempotence (déjà libéré).
- `portal.service.spec.ts` : `createWithdrawalRequest` refuse > dispo, réserve le montant, normalise le téléphone (specs existantes mises à jour pour le DTO sans `commissionIds`).
- `mlm-wallet` : approbation débite `request.montant` + double réserve ; CASH → PAYE ; rejet → restitution réserve (déjà en place via cancel).

**Frontend (vitest) :**
- `WalletCard` : pas de modale ; clic Retirer navigue ; lots réinvestis rendus avec dates ; bouton désactivé si dispo = 0. (Mettre à jour le test PortalHomePage existant si la modale y était mockée.)
- Page retrait : validation plafond du montant.

## 9. Hors scope (YAGNI)

- Notification (SMS/email) à libération d'un lot.
- Retrait partiel d'une commission ou consommation FIFO.
- Changement du ratio 60/40 en variable de config (les champs `commissionSysteme`/`commissionRetour` de `MlmLevel` le permettent déjà par niveau ; pas d'UI d'admin supplémentaire).
- Payout automatique KPay (le flow Mobile Money passe par la validation manuelle de l'admin, comme aujourd'hui).

## 10. Fichiers touchés (indicatif)

- `backend/prisma/schema.prisma` + migration
- `backend/src/modules/mlm/mlm-matrix.service.ts` (crédit 40 %)
- `backend/src/modules/mlm/reinvest-release.service.ts` (nouveau) + `mlm.module.ts` (ScheduleModule)
- `backend/src/modules/mlm/mlm-wallet.service.ts` (approbation)
- `backend/src/modules/portal/portal.service.ts` + `dto/withdrawal.dto.ts` + `portal.controller.ts`
- `frontend/src/components/portal/WalletCard.tsx`
- `frontend/src/pages/portal/PortalWithdrawalPage.tsx`
- `frontend/src/lib/portal.api.ts`
