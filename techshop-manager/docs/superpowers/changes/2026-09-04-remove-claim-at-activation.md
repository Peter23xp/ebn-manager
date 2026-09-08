# Suppression de la Réclamation de Filleul à l'Activation

**Date :** 4 septembre 2026  
**Commit :** `03e117f`  
**Branche :** `feat/parrain-claim`  
**Type :** Refactoring (breaking change)

---

## 🎯 Objectif

Supprimer complètement le mécanisme de réclamation de filleul lors de l'activation du client. Les réclamations de parrainage doivent désormais se faire **uniquement** via la page dédiée `/mlm/claims`.

---

## ✅ Modifications Effectuées

### Backend

#### 1. DTO (`backend/src/modules/clients/dto/client.dto.ts`)
**Supprimé :**
```typescript
/** Code simplifié de la facture d'activation — requis si le client a des filleuls en attente (claims) */
@IsOptional()
@IsString()
codeFacture?: string;
```

#### 2. Service (`backend/src/modules/clients/clients.service.ts`)

**Supprimé (lignes ~1247-1270) :**
- Vérification du nombre de claims EN_ATTENTE
- Erreur `ERR_CLAIM_CODE_REQUIRED` (409) si des claims existent sans `codeFacture`
- Erreur `ERR_CLAIM_CODE_INVALID` (400) si le code fourni est invalide
- Validation du code facture via `matchesInvoiceCode()`

**Avant :**
```typescript
const nbClaims = await this.prisma.parrainClaim.count({
  where: { parrainClientId: clientId, statut: 'EN_ATTENTE' },
});
if (nbClaims > 0 && !opts.deferClaims) {
  if (!dto.codeFacture || !dto.codeFacture.trim()) {
    throw new ConflictException({
      code: 'ERR_CLAIM_CODE_REQUIRED',
      message: `Ce parrain a ${nbClaims} filleul(s) en attente...`,
      // ...
    });
  }
  if (!matchesInvoiceCode(dto.codeFacture, numeroVente)) {
    throw new BadRequestException({
      code: 'ERR_CLAIM_CODE_INVALID',
      message: 'Code de facture invalide...',
    });
  }
}
```

**Après :**
```typescript
// Supprimé — les claims sont gérés séparément via /mlm/claims
```

**Supprimé (lignes ~1373-1382) :**
- Appel à `attachConfirmedClaims()` après l'activation

**Avant :**
```typescript
if (nbClaims > 0 && !opts.deferClaims) {
  try {
    const attach = await this.mlmClaimService.attachConfirmedClaims(clientId, numeroVente, agentId);
    console.log(`[CLAIM ATTACH] Parrain ${clientId}: ${attach.attachés} rattaché(s), ${attach.conflits} conflit(s)`);
  } catch (err) {
    console.error(`[CLAIM ATTACH AFTER ACTIVATION] ${clientId}:`, err);
  }
}
```

**Après :**
```typescript
// Supprimé — pas de rattachement automatique à l'activation
```

#### 3. Tests (`clients-activation-claim.spec.ts`)
**Supprimé complètement** — fichier de tests dédié à la fonctionnalité retirée :
- Test `ERR_CLAIM_CODE_REQUIRED` avec claims sans code
- Test `ERR_CLAIM_CODE_INVALID` avec code invalide
- Test validation avec code complet
- Test `deferClaims` (webhook)

---

### Frontend

#### 4. Page d'Activation (`frontend/src/pages/clients/OnboardingActivationPage.tsx`)

**États supprimés :**
```typescript
const [codeFacture, setCodeFacture] = useState('');
const [claimRequired, setClaimRequired] = useState<{ nbFilleulsEnAttente: number; factureHint: string } | null>(null);
```

**Props de `ConfirmModal` supprimés :**
```typescript
// Supprimé
claimRequired: { nbFilleulsEnAttente: number; factureHint: string } | null;
codeFacture: string;
onCodeFactureChange: (v: string) => void;
```

**UI supprimée de la modale :**
```tsx
{/* Champ code facture — affiché après 409 ERR_CLAIM_CODE_REQUIRED */}
{claimRequired && (
  <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 space-y-2">
    <p className="text-[13px] text-text font-medium">
      Ce parrain a {claimRequired.nbFilleulsEnAttente} filleul(s) en attente.
      Saisissez le code de sa facture d'activation
      {claimRequired.factureHint && <> (ex.&nbsp;<span className="font-mono font-semibold">{claimRequired.factureHint}</span>)</>}
      {' '}pour confirmer le lien.
    </p>
    <input
      type="text"
      inputMode="numeric"
      value={codeFacture}
      onChange={(e) => onCodeFactureChange(e.target.value)}
      placeholder="Code facture (ex. 0047)"
      className="..."
      data-testid="input-code-facture"
    />
  </div>
)}
```

**Gestion d'erreur supprimée :**
```typescript
// Supprimé
if (status === 409 && code === 'ERR_CLAIM_CODE_REQUIRED') {
  setClaimRequired({
    nbFilleulsEnAttente: error.response.data.nbFilleulsEnAttente ?? 0,
    factureHint: error.response.data.factureHint ?? '',
  });
  return; // on reste dans la modale
}

if (status === 400 && code === 'ERR_CLAIM_CODE_INVALID') {
  toast.error("Code de facture invalide. Vérifiez les 4 derniers chiffres de la facture d'activation.");
  return;
}
```

**Mutation simplifiée :**
```typescript
// Avant
mutationFn: () => api.post(`/clients/${id}/onboarding/activate`, {
  produitId: selectedProduit!.id,
  modePaiement,
  ...(codeFacture.trim() ? { codeFacture: codeFacture.trim() } : {}),
}),

// Après
mutationFn: () => api.post(`/clients/${id}/onboarding/activate`, {
  produitId: selectedProduit!.id,
  modePaiement,
}),
```

---

## 📊 Impact

### Changements de Flux

#### Avant (flux complexe)
1. Parrain non activé → téléphone enregistré → claim `EN_ATTENTE`
2. Parrain activation → **vérification claims** → demande code facture (409)
3. Agent saisit code → validation → activation + rattachement automatique

#### Après (flux simplifié)
1. Parrain non activé → téléphone enregistré → claim `EN_ATTENTE`
2. Parrain activation → **activation immédiate** (pas de vérification)
3. **Séparé :** Parrain va sur `/mlm/claims` → saisit code → rattache filleul

### Avantages
✅ **Séparation des responsabilités** : l'activation ne gère plus les claims  
✅ **Simplification du code** : moins de logique conditionnelle  
✅ **UI plus claire** : activation = activation, claims = claims  
✅ **Moins d'erreurs** : pas de blocage si code incorrect  
✅ **Meilleure expérience** : parrain peut activer sans connaissance préalable des claims

### Inconvénients
⚠️ **Étape supplémentaire** : le parrain doit faire 2 actions (activer + réclamer)  
⚠️ **Pas de rattachement automatique** : nécessite action explicite sur `/mlm/claims`

---

## 🧪 Tests

### Backend
- ✅ Compilation TypeScript : OK
- ⚠️ Tests unitaires : fichier `clients-activation-claim.spec.ts` supprimé
- ⚠️ Tests E2E : à vérifier (flux d'activation)

### Frontend
- ✅ Compilation TypeScript : OK
- ⚠️ Tests E2E : à vérifier (modale simplifiée)

---

## 🚀 Déploiement

### Prérequis
- Aucune migration Prisma nécessaire (pas de changement de schéma)
- Les claims existants EN_ATTENTE restent valides

### Rollback
Si besoin de revenir en arrière :
```bash
git revert 03e117f
```

---

## 📝 Documentation à Mettre à Jour

- [ ] **Guide Utilisateur** : Flux d'activation simplifié
- [ ] **Guide Admin** : Processus de réclamation via `/mlm/claims`
- [ ] **API Docs** : Retirer `codeFacture` de `OnboardingActivateDto`
- [ ] **Erreurs API** : Retirer `ERR_CLAIM_CODE_REQUIRED` et `ERR_CLAIM_CODE_INVALID` de la doc

---

## 🔗 Fichiers Modifiés

```
M  backend/src/modules/clients/dto/client.dto.ts
M  backend/src/modules/clients/clients.service.ts
D  backend/src/modules/clients/clients-activation-claim.spec.ts
M  frontend/src/pages/clients/OnboardingActivationPage.tsx
```

---

## 💬 Commentaires

Cette refonte suit la demande de **séparation stricte** entre l'activation du compte et la gestion des réclamations de parrainage. Le flux devient plus linéaire et prévisible, au prix d'une étape supplémentaire pour le parrain qui doit confirmer manuellement ses filleuls via la page dédiée.

**Décision validée par :** User (Peter)  
**Raison :** "enlever le field pour réclamer de filleul lors de l'activation de client car le filleul doit se réclamer que dans la page /mlm/claims"

---

**Auteur :** Kiro AI  
**Dernière Mise à Jour :** 4 septembre 2026
