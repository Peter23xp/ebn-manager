# Reprise du RÉCIT et cohérence KPay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre la reprise d’un RÉCIT existant par ID, en Cash ou KPay, sans doublon et avec des états de paiement cohérents.

**Architecture:** La file d’onboarding fournira une URL de reprise `/clients/:id/recit`. Le backend conservera les endpoints de création, ajoutera des endpoints ID pour la reprise et centralisera les règles d’état RECIT/KPay dans le service client. Le frontend utilisera une page dédiée en lecture seule pour l’identité du client.

**Tech Stack:** NestJS, Prisma, Jest, React, React Router, TanStack Query, Axios, TypeScript.

**Spec:** Demande utilisateur « Fix — Parcours RÉCIT : reprise de dossier + cohérence KPay » du 2026-09-01.

## Global Constraints

- Aucune migration Prisma.
- Un client existant est repris par son ID, jamais recréé par téléphone.
- Un RÉCIT réellement payé reste en conflit; seuls FAILED/CANCELLED et PENDING sans `kpayPaymentId` sont retryables.
- Toute initialisation KPay échouée libère l’étape en `EN_COURS`.

---

### Task 1: Tests backend de reprise et états KPay

**Files:**
- Create: `backend/src/modules/clients/clients-recit-resume.spec.ts`
- Modify: `backend/src/modules/kpay/kpay-webhook.service.spec.ts`

- [ ] **Step 1: Écrire les tests rouges** pour les quatre scénarios de reprise ID et les trois statuts webhook demandés, avec Prisma/KPay mockés selon les patterns existants.
- [ ] **Step 2: Exécuter les tests ciblés** et confirmer qu’ils échouent pour absence de méthode/endpoint ou comportement incorrect.

Run: `npm.cmd exec -- jest --runInBand src/modules/clients/clients-recit-resume.spec.ts src/modules/kpay/kpay-webhook.service.spec.ts --no-coverage`

Expected: FAIL sur les scénarios de reprise non encore implémentés; les tests webhook existants restent diagnostiquables séparément.

### Task 2: Service backend de reprise par ID

**Files:**
- Modify: `backend/src/modules/clients/clients.service.ts`

**Interfaces:**
- Produces: `resumeOnboardingRecit(clientId: string, dto)` pour Cash et `initKpayRecitByClientId(clientId: string, dto)` pour KPay.

- [ ] **Step 1: Implémenter la méthode Cash minimale** : charger le client par ID, vérifier `EN_COURS`, retrouver RECIT, libérer une étape COMPLETE adossée uniquement à FAILED/CANCELLED/orpheline, refuser COMPLETE avec paiement COMPLETED, puis marquer RECIT COMPLETE.
- [ ] **Step 2: Implémenter l’initialisation KPay par ID** en réutilisant le flux transactionnel existant, sans recherche de client par téléphone et avec remise `EN_COURS` lors d’un échec immédiat.
- [ ] **Step 3: Corriger la file** pour retourner `/clients/${c.id}/recit` et consolider la logique retryable de `initKpayRecit`.
- [ ] **Step 4: Exécuter les tests de reprise et webhook** jusqu’à obtention du vert.

### Task 3: Contrôleur et contrats frontend

**Files:**
- Modify: `backend/src/modules/clients/clients.controller.ts`
- Modify: `backend/src/modules/clients/dto/client.dto.ts`
- Modify: `frontend/src/lib/clients.api.ts`
- Modify: `frontend/src/lib/kpay.api.ts`

- [ ] **Step 1: Ajouter les DTO/handlers** `POST /clients/:id/onboarding/recit` et `POST /clients/:id/onboarding/recit/kpay/init`, en gardant les routes statiques avant `:id`.
- [ ] **Step 2: Ajouter les méthodes API typées** de chargement, reprise Cash et init KPay par ID.
- [ ] **Step 3: Relancer la compilation backend** pour détecter les contrats incohérents.

### Task 4: Page frontend et routage

**Files:**
- Create: `frontend/src/pages/clients/OnboardingRecitResumePage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Créer la page** avec chargement par ID, identité en lecture seule, sélection Cash/KPay, montant, fournisseur/téléphone KPay, états loading/error et navigation vers `/clients/:id/fiche`.
- [ ] **Step 2: Déclarer la route lazy** `/clients/:id/recit` avant les routes génériques concernées.
- [ ] **Step 3: Compiler le frontend** et corriger les erreurs TypeScript/UI.

### Task 5: Vérification finale

**Files:**
- Inspect: tous les fichiers modifiés et `git diff`

- [ ] **Step 1: Exécuter les tests ciblés backend.**
- [ ] **Step 2: Exécuter `npm.cmd exec -- tsc --noEmit` dans backend.**
- [ ] **Step 3: Exécuter `npm.cmd exec -- tsc --noEmit` dans frontend.**
- [ ] **Step 4: Vérifier le diff, l’absence de migration et les routes finales.**

