# Plan d'Implémentation : Commission Auto-Réinvestissement MLM

**Date :** 4 septembre 2026  
**Statut :** 📋 PLAN - Non démarré  
**Priorité :** Moyenne  
**Branche cible :** `feat/commission-reinvestissement`

---

## 🎯 Objectif

Augmenter les commissions MLM de **+66.67%** sur tous les niveaux, avec un système de **réinvestissement automatique** :
- Une partie va au **"système"** (EBN Network)
- Une partie **retourne automatiquement** dans le portefeuille du membre

### Exemple Niveau Builder
- **Avant :** $6 par filleul
- **Après :** $10 par filleul
  - Système : $6 (60%)
  - Retour membre : $4 (40%)

---

## 📊 Tableau des Nouvelles Commissions

| Niveau | Ancien | Nouveau Total | Système (60%) | Retour Membre (40%) |
|--------|--------|---------------|---------------|---------------------|
| **Builder** | $6.00 | $10.00 | $6.00 | $4.00 |
| **Sapphire** | $12.50 | $20.83 | $12.50 | $8.33 |
| **Ruby** | $20.00 | $33.33 | $20.00 | $13.33 |
| **Emerald** | $50.00 | $83.33 | $50.00 | $33.33 |
| **Diamond** | $250.00 | $416.67 | $250.00 | $166.67 |
| **Crown Diamond** | $500.00 | $833.33 | $500.00 | $333.33 |
| **Ambassadeur** | $5000.00 | $8333.33 | $5000.00 | $3333.33 |
| **Crown Ambassadeur** | $12500.00 | $20833.33 | $12500.00 | $8333.33 |

### Calcul appliqué
```
Augmentation = +66.67% = facteur 1.6667
Nouveau Total = Ancien × 1.6667
Système = Ancien (inchangé)
Retour Membre = Nouveau Total - Système
```

---

## 🏗️ Architecture de la Solution

### 1. Modification du Schéma Prisma

**Fichier :** `backend/prisma/schema.prisma`

Ajouter deux nouveaux champs au modèle `MlmLevel` :

```prisma
model MlmLevel {
  id                     String   @id @default(cuid())
  ordre                  Int      @unique
  nom                    String
  filleulsRequis         Int
  
  // ✅ ANCIEN - Conservé pour compatibilité
  commissionParFilleul   Decimal  @db.Decimal(10, 2)
  commissionTotale       Decimal  @db.Decimal(10, 2)
  
  // 🆕 NOUVEAU - Split système/retour
  commissionSysteme      Decimal  @db.Decimal(10, 2) @default(0)
  commissionRetour       Decimal  @db.Decimal(10, 2) @default(0)
  
  bonusDescription       String?
  salaireMensuel         Decimal? @db.Decimal(10, 2)
  salaireActif           Boolean  @default(false)
  couleur                String?
  icone                  String?
  isActive               Boolean  @default(true)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  matrices               Matrix[]
  promotionsAvant        Promotion[] @relation("NiveauAvant")
  promotionsApres        Promotion[] @relation("NiveauApres")
  bonusAttribues         BonusAttribue[]
}
```

**Migration SQL :**
```sql
-- Ajouter les nouveaux champs
ALTER TABLE "MlmLevel" ADD COLUMN "commissionSysteme" DECIMAL(10,2) DEFAULT 0;
ALTER TABLE "MlmLevel" ADD COLUMN "commissionRetour" DECIMAL(10,2) DEFAULT 0;

-- Peupler avec les nouvelles valeurs
UPDATE "MlmLevel" SET 
  "commissionSysteme" = "commissionParFilleul",
  "commissionRetour" = ROUND("commissionParFilleul" * 0.6667, 2),
  "commissionParFilleul" = ROUND("commissionParFilleul" * 1.6667, 2)
WHERE "ordre" IN (1,2,3,4,5,6,7,8);
```

### 2. Mise à Jour du Seed

**Fichier :** `backend/prisma/seed.ts`

Remplacer la définition `mlmLevelsData` (lignes ~260-268) :

```typescript
const mlmLevelsData = [
  { 
    ordre: 1, nom: 'Builder', filleulsRequis: 4, 
    commissionParFilleul: 10.00, commissionTotale: 40.00,
    commissionSysteme: 6.00, commissionRetour: 4.00,
    bonusDescription: '2 pagnes', salaireMensuel: 0, salaireActif: false, 
    couleur: '#f59e0b', icone: 'hammer' 
  },
  { 
    ordre: 2, nom: 'Sapphire', filleulsRequis: 4, 
    commissionParFilleul: 20.83, commissionTotale: 83.32,
    commissionSysteme: 12.50, commissionRetour: 8.33,
    bonusDescription: '1er kit alimentaire', salaireMensuel: 0, salaireActif: false, 
    couleur: '#3b82f6', icone: 'gem' 
  },
  { 
    ordre: 3, nom: 'Ruby', filleulsRequis: 4, 
    commissionParFilleul: 33.33, commissionTotale: 133.32,
    commissionSysteme: 20.00, commissionRetour: 13.33,
    bonusDescription: '2e kit alimentaire', salaireMensuel: 0, salaireActif: false, 
    couleur: '#ef4444', icone: 'sparkles' 
  },
  { 
    ordre: 4, nom: 'Emerald', filleulsRequis: 4, 
    commissionParFilleul: 83.33, commissionTotale: 333.32,
    commissionSysteme: 50.00, commissionRetour: 33.33,
    bonusDescription: 'Écran plat 52 pouces', salaireMensuel: 0, salaireActif: false, 
    couleur: '#10b981', icone: 'tv' 
  },
  { 
    ordre: 5, nom: 'Diamond', filleulsRequis: 4, 
    commissionParFilleul: 416.67, commissionTotale: 1666.68,
    commissionSysteme: 250.00, commissionRetour: 166.67,
    bonusDescription: 'Moto de luxe de 2 000 USD', salaireMensuel: 0, salaireActif: false, 
    couleur: '#06b6d4', icone: 'bike' 
  },
  { 
    ordre: 6, nom: 'Crown Diamond', filleulsRequis: 4, 
    commissionParFilleul: 833.33, commissionTotale: 3333.32,
    commissionSysteme: 500.00, commissionRetour: 333.33,
    bonusDescription: '1re voiture de 6 000 USD', salaireMensuel: 0, salaireActif: false, 
    couleur: '#8b5cf6', icone: 'crown' 
  },
  { 
    ordre: 7, nom: 'Ambassadeur', filleulsRequis: 4, 
    commissionParFilleul: 8333.33, commissionTotale: 33333.32,
    commissionSysteme: 5000.00, commissionRetour: 3333.33,
    bonusDescription: '1re maison de 30 000 USD + 2e voiture de 15 000 USD', 
    salaireMensuel: 0, salaireActif: false, 
    couleur: '#6366f1', icone: 'globe' 
  },
  { 
    ordre: 8, nom: 'Crown Ambassadeur', filleulsRequis: 4, 
    commissionParFilleul: 20833.33, commissionTotale: 83333.32,
    commissionSysteme: 12500.00, commissionRetour: 8333.33,
    bonusDescription: '2e maison + 3e voiture', salaireMensuel: 0, salaireActif: false, 
    couleur: '#d97706', icone: 'award' 
  },
];
```

### 3. Logique Backend - Service MLM

**Fichier :** `backend/src/modules/mlm/mlm-matrix.service.ts`

Modifier la méthode `payCommission()` pour gérer le split :

```typescript
async payCommission(
  filleulMembreId: string,
  matrixId: string,
  positionId: string,
  opts?: { skipWalletCredit?: boolean }
) {
  const matrix = await this.prisma.matrix.findUnique({
    where: { id: matrixId },
    include: { 
      membre: { include: { client: true, portefeuille: true } }, 
      mlmLevel: true 
    },
  });

  if (!matrix || !matrix.membre) {
    throw new NotFoundException('Matrix ou membre introuvable');
  }

  const level = matrix.mlmLevel;
  const parrainMembre = matrix.membre;

  // 🆕 Utiliser commissionSysteme et commissionRetour
  const montantSysteme = Number(level.commissionSysteme);
  const montantRetour = Number(level.commissionRetour);
  const montantTotal = montantSysteme + montantRetour;

  // Créer la commission MLM
  const commission = await this.prisma.mlmCommission.create({
    data: {
      membreId: parrainMembre.id,
      filleulMembreId,
      mlmLevelId: level.id,
      matrixId,
      positionId,
      montant: montantTotal, // 🆕 Total complet
      montantSysteme,         // 🆕 Part système
      montantRetour,          // 🆕 Part retour auto
      statut: 'EN_ATTENTE',
      type: 'PARRAINAGE',
    },
  });

  // 🆕 CRÉDITER AUTOMATIQUEMENT montantRetour dans le portefeuille
  if (!opts?.skipWalletCredit) {
    let portefeuille = parrainMembre.portefeuille;
    
    if (!portefeuille) {
      portefeuille = await this.prisma.portefeuille.create({
        data: {
          membreId: parrainMembre.id,
          soldeDisponible: 0,
          totalGagne: 0,
        },
      });
    }

    // Créditer le montantRetour immédiatement
    await this.prisma.portefeuille.update({
      where: { id: portefeuille.id },
      data: {
        soldeDisponible: { increment: montantRetour },
        totalGagne: { increment: montantRetour },
      },
    });

    // Créer une transaction de type REINVESTISSEMENT
    await this.prisma.transactionPortefeuille.create({
      data: {
        portefeuilleId: portefeuille.id,
        type: 'REINVESTISSEMENT', // 🆕 Nouveau type
        montant: montantRetour,
        description: `Réinvestissement auto niveau ${level.nom} - Commission ${parrainMembre.client.prenom}`,
        mlmCommissionId: commission.id,
      },
    });
  }

  this.logger.log(
    `✅ Commission créée: ${montantTotal} USD (Système: ${montantSysteme}, Retour auto: ${montantRetour}) ` +
    `pour ${parrainMembre.client.prenom} niveau ${level.nom}`
  );

  return commission;
}
```

### 4. Nouveau Type de Transaction

**Fichier :** `backend/prisma/schema.prisma`

Ajouter le type `REINVESTISSEMENT` à l'enum `TransactionType` :

```prisma
enum TransactionType {
  COMMISSION
  BONUS
  PROMOTION
  SALAIRE
  RETRAIT
  REINVESTISSEMENT  // 🆕 Nouveau
}
```

**Migration SQL :**
```sql
ALTER TYPE "TransactionType" ADD VALUE 'REINVESTISSEMENT';
```

### 5. Mise à Jour du Modèle MlmCommission

**Fichier :** `backend/prisma/schema.prisma`

Ajouter les champs split au modèle `MlmCommission` :

```prisma
model MlmCommission {
  id               String            @id @default(cuid())
  membreId         String
  filleulMembreId  String?
  mlmLevelId       String
  matrixId         String?
  positionId       String?
  
  montant          Decimal           @db.Decimal(10, 2)
  montantSysteme   Decimal           @db.Decimal(10, 2) @default(0)  // 🆕
  montantRetour    Decimal           @db.Decimal(10, 2) @default(0)  // 🆕
  
  statut           CommissionStatut  @default(EN_ATTENTE)
  type             String?
  description      String?
  
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  paidAt           DateTime?

  membre           Membre            @relation("CommissionsRecues", fields: [membreId], references: [id])
  filleulMembre    Membre?           @relation("CommissionsDonnees", fields: [filleulMembreId], references: [id])
  mlmLevel         MlmLevel          @relation(fields: [mlmLevelId], references: [id])
  matrix           Matrix?           @relation(fields: [matrixId], references: [id])
  position         Position?         @relation(fields: [positionId], references: [id])
  
  transactions     TransactionPortefeuille[]

  @@index([membreId])
  @@index([statut])
}
```

**Migration SQL :**
```sql
ALTER TABLE "MlmCommission" ADD COLUMN "montantSysteme" DECIMAL(10,2) DEFAULT 0;
ALTER TABLE "MlmCommission" ADD COLUMN "montantRetour" DECIMAL(10,2) DEFAULT 0;

-- Peupler les anciennes commissions (rétrocompatibilité)
UPDATE "MlmCommission" 
SET 
  "montantSysteme" = "montant" * 0.6,
  "montantRetour" = "montant" * 0.4
WHERE "montantSysteme" = 0;
```

---

## 🧪 Tests à Ajouter

### 1. Tests Unitaires

**Fichier :** `backend/src/modules/mlm/mlm-matrix.service.spec.ts`

```typescript
describe('payCommission avec réinvestissement auto', () => {
  it('devrait créditer montantRetour immédiatement dans le portefeuille', async () => {
    const result = await service.payCommission(filleulId, matrixId, positionId);
    
    expect(result.montantSysteme).toBe(6.00);
    expect(result.montantRetour).toBe(4.00);
    expect(result.montant).toBe(10.00);
    
    const portefeuille = await prisma.portefeuille.findUnique({
      where: { membreId: parrainId }
    });
    expect(portefeuille.soldeDisponible).toBeGreaterThanOrEqual(4.00);
  });

  it('devrait créer une transaction REINVESTISSEMENT', async () => {
    await service.payCommission(filleulId, matrixId, positionId);
    
    const transaction = await prisma.transactionPortefeuille.findFirst({
      where: { 
        type: 'REINVESTISSEMENT',
        montant: 4.00 
      }
    });
    expect(transaction).toBeDefined();
  });
});
```

### 2. Tests E2E

**Fichier :** `backend/test/mlm-commission-reinvestissement.e2e-spec.ts`

Créer un nouveau fichier de test E2E pour valider le flux complet :
1. Activation d'un filleul
2. Génération de commission split
3. Crédit automatique du retour
4. Vérification du solde portefeuille
5. Validation des transactions

---

## 🎨 Mise à Jour Frontend

### 1. Types TypeScript

**Fichier :** `frontend/src/types/mlm.types.ts`

```typescript
export interface MlmLevel {
  id: string;
  ordre: number;
  nom: string;
  filleulsRequis: number;
  commissionParFilleul: number;
  commissionTotale: number;
  commissionSysteme: number;    // 🆕
  commissionRetour: number;      // 🆕
  bonusDescription?: string;
  // ...
}

export interface MlmCommission {
  id: string;
  montant: number;
  montantSysteme: number;         // 🆕
  montantRetour: number;          // 🆕
  statut: CommissionStatut;
  type: string;
  // ...
}

export enum TransactionType {
  COMMISSION = 'COMMISSION',
  BONUS = 'BONUS',
  PROMOTION = 'PROMOTION',
  SALAIRE = 'SALAIRE',
  RETRAIT = 'RETRAIT',
  REINVESTISSEMENT = 'REINVESTISSEMENT',  // 🆕
}
```

### 2. Affichage dans le Dashboard Membre

**Fichier :** `frontend/src/pages/membres/MlmDashboard.tsx`

Afficher le split des commissions :

```tsx
<Card>
  <CardHeader>
    <CardTitle>Commissions Niveau {level.nom}</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      <div className="flex justify-between">
        <span>Total par filleul :</span>
        <span className="font-bold">${level.commissionParFilleul}</span>
      </div>
      <Separator />
      <div className="flex justify-between text-green-600">
        <span>↻ Retour automatique :</span>
        <span className="font-bold">${level.commissionRetour}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Système :</span>
        <span>${level.commissionSysteme}</span>
      </div>
    </div>
  </CardContent>
</Card>
```

### 3. Historique des Transactions

**Fichier :** `frontend/src/components/mlm/TransactionHistory.tsx`

Ajouter une icône et couleur spécifique pour `REINVESTISSEMENT` :

```tsx
const getTransactionIcon = (type: TransactionType) => {
  switch (type) {
    case 'REINVESTISSEMENT':
      return <RefreshCw className="w-4 h-4 text-green-500" />;
    case 'COMMISSION':
      return <DollarSign className="w-4 h-4 text-blue-500" />;
    // ...
  }
};
```

---

## 📋 Plan d'Exécution (Tâches)

### Phase 1 : Backend Schema & Migration
- [ ] **Tâche 1.1** : Modifier `schema.prisma` - Ajouter `commissionSysteme` et `commissionRetour` à `MlmLevel`
- [ ] **Tâche 1.2** : Modifier `schema.prisma` - Ajouter `montantSysteme` et `montantRetour` à `MlmCommission`
- [ ] **Tâche 1.3** : Modifier `schema.prisma` - Ajouter `REINVESTISSEMENT` à enum `TransactionType`
- [ ] **Tâche 1.4** : Créer migration Prisma `npx prisma migrate dev --name commission_reinvestissement`
- [ ] **Tâche 1.5** : Mettre à jour `seed.ts` avec nouvelles valeurs de commissions

### Phase 2 : Logique Backend
- [ ] **Tâche 2.1** : Modifier `mlm-matrix.service.ts` - Méthode `payCommission()` pour gérer le split
- [ ] **Tâche 2.2** : Modifier `mlm-matrix.service.ts` - Crédit automatique `montantRetour` dans portefeuille
- [ ] **Tâche 2.3** : Créer transaction `REINVESTISSEMENT` automatiquement
- [ ] **Tâche 2.4** : Mettre à jour les DTOs si nécessaire

### Phase 3 : Tests Backend
- [ ] **Tâche 3.1** : Ajouter tests unitaires dans `mlm-matrix.service.spec.ts`
- [ ] **Tâche 3.2** : Créer tests E2E `mlm-commission-reinvestissement.e2e-spec.ts`
- [ ] **Tâche 3.3** : Vérifier que tous les tests existants passent (non-régression)

### Phase 4 : Frontend Types & API
- [ ] **Tâche 4.1** : Mettre à jour `mlm.types.ts` avec nouveaux champs
- [ ] **Tâche 4.2** : Mettre à jour les appels API pour inclure nouveaux champs
- [ ] **Tâche 4.3** : Mettre à jour `transaction.types.ts` avec `REINVESTISSEMENT`

### Phase 5 : Frontend UI
- [ ] **Tâche 5.1** : Modifier `MlmDashboard.tsx` - Afficher split commission système/retour
- [ ] **Tâche 5.2** : Modifier `TransactionHistory.tsx` - Ajouter icône et style pour REINVESTISSEMENT
- [ ] **Tâche 5.3** : Modifier affichage des détails de commission dans pages admin
- [ ] **Tâche 5.4** : Ajouter tooltip/info expliquant le système de retour auto

### Phase 6 : Documentation & Validation
- [ ] **Tâche 6.1** : Mettre à jour la documentation utilisateur
- [ ] **Tâche 6.2** : Tests manuels E2E complets (onboarding → activation → commission → portefeuille)
- [ ] **Tâche 6.3** : Vérification comptable des montants (audit)
- [ ] **Tâche 6.4** : Déploiement en staging pour validation business

---

## ⚠️ Points d'Attention

### 1. Rétrocompatibilité
- ✅ Les anciens champs `commissionParFilleul` et `commissionTotale` sont **conservés**
- ✅ Migration automatique des anciennes commissions avec valeurs par défaut
- ✅ Les rapports existants continuent de fonctionner

### 2. Transactions Atomiques
- Le crédit du `montantRetour` doit être **atomique** avec la création de la commission
- Utiliser `prisma.$transaction()` si nécessaire

### 3. Gestion des Erreurs
- Si le crédit automatique échoue, la commission doit quand même être créée
- Logger les erreurs de crédit pour retry manuel
- Ajouter un flag `autoReinvestissementApplique: boolean` sur `MlmCommission`

### 4. Performance
- Le crédit automatique ajoute **1 requête supplémentaire** par commission
- Impact négligeable car les commissions sont générées à faible fréquence

### 5. Audit & Traçabilité
- Chaque `REINVESTISSEMENT` doit référencer la commission source via `mlmCommissionId`
- Les rapports comptables doivent distinguer système vs retour

---

## 🚀 Stratégie de Déploiement

### Option A : Déploiement Progressif (Recommandé)
1. Déployer le schema + migration en **lecture seule** (nouveaux champs optionnels)
2. Tester en staging pendant 2-3 jours
3. Activer le crédit automatique avec feature flag
4. Monitorer pendant 1 semaine
5. Rollout complet en production

### Option B : Déploiement Big Bang
1. Planifier une fenêtre de maintenance (30 min)
2. Déployer backend + migration + frontend en une fois
3. Validation immédiate après déploiement
4. Rollback plan prêt

**Recommandation :** Option A avec feature flag `ENABLE_AUTO_REINVESTMENT=true`

---

## 📊 Métriques de Succès

- ✅ 100% des nouvelles commissions ont `montantSysteme` et `montantRetour` renseignés
- ✅ 100% des `montantRetour` sont crédités automatiquement dans le portefeuille
- ✅ Aucune régression sur les tests existants (21/21 PASS minimum)
- ✅ Dashboard membre affiche correctement le split
- ✅ Rapports admin distinguent système vs retour

---

## 🔗 Fichiers Impactés

### Backend
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `backend/src/modules/mlm/mlm-matrix.service.ts`
- `backend/src/modules/mlm/mlm-matrix.service.spec.ts`
- `backend/src/modules/mlm/dto/mlm-commission.dto.ts` (si nécessaire)

### Frontend
- `frontend/src/types/mlm.types.ts`
- `frontend/src/types/transaction.types.ts`
- `frontend/src/pages/membres/MlmDashboard.tsx`
- `frontend/src/components/mlm/TransactionHistory.tsx`
- `frontend/src/components/mlm/CommissionCard.tsx`

### Tests
- `backend/test/mlm-commission-reinvestissement.e2e-spec.ts` (nouveau)
- `backend/src/modules/mlm/mlm-matrix.service.spec.ts` (mise à jour)

### Documentation
- `docs/architecture/mlm-commission-system.md` (mise à jour)
- `docs/user-guide/commission-reinvestissement.md` (nouveau)

---

## 🎓 Contexte Business

### Avantage pour les Membres
- **Liquidité immédiate** : 40% de retour automatique utilisable sans demande de retrait
- **Motivation accrue** : Voir son portefeuille augmenter automatiquement
- **Transparence** : Distinction claire entre ce qui revient au membre vs système

### Avantage pour EBN Network
- **Commissions système inchangées** : Les 60% restent identiques à l'ancien 100%
- **Engagement renforcé** : Membres voient leurs gains plus rapidement
- **Différenciation concurrentielle** : Système unique sur le marché

---

## ✅ Checklist Avant Démarrage

- [ ] Validation business des montants par le Product Owner
- [ ] Branche `feat/commission-reinvestissement` créée depuis `main`
- [ ] Environnement de dev prêt avec DB de test
- [ ] Feature flag `ENABLE_AUTO_REINVESTMENT` configuré (désactivé par défaut)
- [ ] Slack channel `#feat-commission-reinvest` créé pour coordination
- [ ] Revue de ce plan par l'équipe technique

---

**Estimation Totale :** 5-7 jours de développement (1 développeur fullstack)

**Dépendances :**
- ✅ Aucune - Feature indépendante
- ⚠️ Ne pas merger en même temps que `feat/parrain-claim` (conflits possibles sur `mlm-matrix.service.ts`)

---

## 📝 Notes Additionnelles

### Question Ouverte 1 : Approbation Admin pour Retour ?
**Actuellement le plan prévoit :** Crédit automatique immédiat sans approbation.

**Alternative :** Nécessiter une approbation admin comme pour les retraits classiques.

**Décision :** À confirmer avec le Product Owner.

### Question Ouverte 2 : Limite de Retrait Auto ?
**Actuellement le plan prévoit :** Pas de limite.

**Alternative :** Plafonner le retour auto mensuel (ex: max $500/mois).

**Décision :** À confirmer avec le Product Owner.

### Question Ouverte 3 : Historique Détaillé ?
Faut-il créer un rapport spécifique "Réinvestissements Automatiques" dans l'admin ?

**Décision :** À discuter en Phase 6.

---

**Auteur :** Kiro AI  
**Dernière Mise à Jour :** 4 septembre 2026  
**Version :** 1.0
