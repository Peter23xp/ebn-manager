# Fix — Parcours RÉCIT : reprise de dossier + cohérence KPay

## Contexte

L'application EBN permet d'enregistrer de nouveaux clients via un parcours en 3 étapes (RÉCIT → FICHE → ACTIVATION).
Le paiement du RÉCIT peut se faire en **Cash** ou via **Mobile Money (KPay)**.

### Problèmes identifiés après analyse du code

| # | Symptôme | Origine |
|---|----------|---------|
| 1 | **Bouton « Compléter le récit »** de `/clients/queue` redirige vers `/clients/new/recit` — le formulaire de création s'ouvre, mais le client existe déjà → erreur _"Un client avec ce numéro existe déjà"_ | [`getOnboardingQueue`](file:///d:/PETER/EBN/techshop-manager/backend/src/modules/clients/clients.service.ts#L971-L973) génère toujours `prochainRoute = /clients/new/recit` quand le RÉCIT n'est pas COMPLETE, au lieu de passer l'ID du client existant |
| 2 | **Mode Cash refusait tout client existant**, même si l'étape RÉCIT était EN_COURS sans paiement validé | [`onboardingRecit`](file:///d:/PETER/EBN/techshop-manager/backend/src/modules/clients/clients.service.ts#L447) — la logique de reprise ne distinguait pas correctement les cas KPAY vs CASH |
| 3 | **Anciens incidents** : étape marquée COMPLETE mais transaction FAILED/CANCELLED → état incohérent | [`markKpayOnboardingFailed`](file:///d:/PETER/EBN/techshop-manager/backend/src/modules/clients/clients.service.ts#L108-L122) remet bien EN_COURS, mais `initKpayRecit` ne remet pas EN_COURS les étapes incorrectement COMPLETE avant d'essayer une reprise |
| 4 | **Transaction PENDING sans kpayPaymentId** : si KPay échoue immédiatement, la transaction reste PENDING bloqué | [`initKpayRecit`](file:///d:/PETER/EBN/techshop-manager/backend/src/modules/clients/clients.service.ts#L622-L624) met bien en FAILED mais ne libère pas l'étape EN_COURS pour une reprise Cash ultérieure |
| 5 | Tests manquants pour les scénarios de reprise | Fichiers spec existants trop limités |

---

## User Review Required

> [!IMPORTANT]
> La route backend `/clients/onboarding-queue` retourne actuellement `prochainRoute = /clients/new/recit` pour les clients EN_COURS RÉCIT.
> Le fix proposé la change en `/clients/:id/recit` — **une nouvelle route frontend** doit être créée pour la reprise.
> Cette page de reprise est un formulaire simplifié (sans les champs identité déjà connus) affichant le nom/téléphone du client existant et permettant de choisir Cash ou Mobile Money.

> [!WARNING]
> Aucune migration Prisma n'est nécessaire. Le schéma existant supporte déjà tous les champs requis (`notes`, `statut`, `completeeAt`).

---

## Proposed Changes

### Backend — `clients.service.ts`

#### [MODIFY] [clients.service.ts](file:///d:/PETER/EBN/techshop-manager/backend/src/modules/clients/clients.service.ts)

**Fix 1 — `getOnboardingQueue` : route correcte pour reprise RÉCIT**

```diff
- prochainRoute = `/clients/new/recit`;
+ prochainRoute = `/clients/${c.id}/recit`;
```

Quand `recitDone === false`, on pointe vers la page de reprise (qui recevra l'ID du client) au lieu du formulaire de création.

**Fix 2 — `onboardingRecit` (mode Cash) : améliorer la logique de reprise**

La logique actuelle vérifie `resumableStep?.statut !== StatutEtape.COMPLETE` mais ne vérifie pas si l'étape est COMPLETE avec une transaction FAILED (incohérence).
On ajoute : si `statut === COMPLETE` mais la dernière transaction KPay est FAILED/CANCELLED, remettre EN_COURS avant de reprendre.

**Fix 3 — `initKpayRecit` : libérer l'étape si PENDING sans kpayPaymentId**

Déjà partiellement présent. Vérifier et consolider la logique pour s'assurer que toute transaction PENDING orpheline (sans kpayPaymentId) est traitée comme retryable.

---

### Backend — Nouveau endpoint de reprise par ID client

#### [MODIFY] [clients.controller.ts](file:///d:/PETER/EBN/techshop-manager/backend/src/modules/clients/clients.controller.ts)

Ajouter un endpoint `POST /clients/:id/onboarding/recit` qui reprend le RÉCIT d'un client existant identifié par son ID.

```typescript
@Post(':id/onboarding/recit')
resumeRecit(@Param('id') clientId: string, @Body() body: any, @CurrentUser() user: any) {
  return this.clientsService.resumeOnboardingRecit(clientId, { ...body, agentId: user.id });
}
```

#### [MODIFY] [clients.service.ts](file:///d:/PETER/EBN/techshop-manager/backend/src/modules/clients/clients.service.ts)

Ajouter la méthode `resumeOnboardingRecit(clientId, dto)` qui :
1. Charge le client par ID (pas par téléphone → pas de doublon possible)
2. Vérifie qu'il est EN_COURS
3. Vérifie si l'étape RÉCIT est COMPLETE avec transaction FAILED → remet EN_COURS
4. Complète le RÉCIT (Cash ou KPAY via initKpayRecit par ID)
5. Retourne le client mis à jour

---

### Frontend — Page de reprise RÉCIT

#### [NEW] `OnboardingRecitResumePage.tsx`

Nouvelle page à `/clients/:id/recit` :
- Charge le client par ID (`GET /clients/:id`)
- Affiche nom + téléphone en lecture seule (pas de risque de doublon)
- Propose Cash ou Mobile Money
- Appelle `POST /clients/:id/onboarding/recit` (Cash) ou `POST /clients/:id/onboarding/recit/kpay/init`
- Après succès, redirige vers `/clients/:id/fiche`

#### [MODIFY] [App.tsx](file:///d:/PETER/EBN/techshop-manager/frontend/src/App.tsx)

Ajouter la route `/clients/:id/recit` pointant vers `OnboardingRecitResumePage`.

---

### Tests

#### [MODIFY] [kpay-webhook.service.spec.ts](file:///d:/PETER/EBN/techshop-manager/backend/src/modules/kpay/kpay-webhook.service.spec.ts)

Ajouter les cas :
- `FAILED` ne déclenche pas le finalizer COMPLETE
- `CANCELLED` ne déclenche pas le finalizer COMPLETE  
- `COMPLETED` déclenche bien le finalizer

#### Nouveau fichier : `clients-recit-resume.spec.ts`

Tester :
- Reprise Cash d'un client EN_COURS avec RÉCIT EN_COURS → COMPLETE
- Reprise Cash d'un client avec RÉCIT COMPLETE + transaction FAILED → remise EN_COURS puis COMPLETE
- Reprise Cash d'un client avec RÉCIT COMPLETE + transaction COMPLETED → ConflictException
- La reprise par ID ne crée pas de doublon

---

## Plan d'exécution (ordre)

```
1. Backend  : Fix getOnboardingQueue (route /clients/:id/recit)
2. Backend  : Méthode resumeOnboardingRecit dans clients.service.ts
3. Backend  : Endpoint POST /clients/:id/onboarding/recit dans clients.controller.ts
4. Backend  : Endpoint POST /clients/:id/onboarding/recit/kpay/init (Mobile Money via reprise)
5. Backend  : Consolider la logique anciens incidents dans onboardingRecit et initKpayRecit
6. Tests    : Étendre kpay-webhook.service.spec.ts
7. Tests    : Nouveau fichier clients-recit-resume.spec.ts
8. Frontend : OnboardingRecitResumePage.tsx
9. Frontend : Route /clients/:id/recit dans App.tsx
10. Build   : Vérification TypeScript backend (tsc --noEmit) et frontend
```

## Verification Plan

### Automated Tests
```bash
# Backend
cd techshop-manager/backend
npx jest --testPathPattern="kpay-webhook|clients-recit" --no-coverage

# TypeScript check backend
npx tsc --noEmit

# TypeScript check frontend
cd ../frontend && npx tsc --noEmit
```

### Manual Verification
Parcours à valider après déploiement :

| Scénario | Résultat attendu |
|----------|-----------------|
| Nouveau client → Cash → succès | RÉCIT COMPLETE, redirige vers FICHE |
| Nouveau client → KPay → succès webhook | RÉCIT COMPLETE |
| Nouveau client → KPay → webhook FAILED | RÉCIT EN_COURS, client reste dans la file |
| File `/clients/queue` → bouton RÉCIT | Ouvre `/clients/:id/recit` (reprise) |
| Reprise → même téléphone → Cash | Succès sans "client existe déjà" |
| Reprise → Mobile Money | Initie nouveau paiement KPay sans doublon |
| RÉCIT déjà COMPLETED + paiement COMPLETED | ConflictException correcte |
