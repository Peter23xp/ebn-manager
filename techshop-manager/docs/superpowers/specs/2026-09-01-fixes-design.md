# Design — Mission de correction complète techshop-manager

**Date** : 2026-09-01
**Statut** : Validé par l'utilisateur
**Périmètre** : ~16 corrections réparties en 4 groupes (bloquant → mineur)

---

## 1. Contexte

L'audit du projet a révélé des bugs dans le WIP « demandes de retrait de commissions MLM », des trous fonctionnels (sync offline), et des vestiges de la migration fidélité → MLM. Cette mission corrige tout, sans refactoriser au-delà du nécessaire.

**Décisions actées avec l'utilisateur :**
- Code parrain : **garder `AAAAMMJJ####`** — corriger uniquement les commentaires menteurs (`clients.service.ts:1153`) et le CLAUDE.md. Le DTO ambassadeur (`TSG-0001`) reste tel quel (hors scope).
- Deux systèmes de retrait **coexistent** : `MlmPayout` (wallet + KPay, automatique) et `WithdrawalRequest` (commissions, validation admin). Différence documentée, pas d'unification.
- `POST /mlm/internal/activate-member` : **laissé tel quel** (décision utilisateur).
- Access token : **garder localStorage** — mettre à jour le CLAUDE.md qui dit « mémoire uniquement ».
- OTP de reset : **persister en DB** (nouveau modèle `PasswordResetToken` + cron de purge).
- Boutons d'approbation de retraits : **masqués pour GERANT** côté front (backend inchangé).
- Migrations : via `npx prisma migrate dev` (DB locale requise).
- Catégories produits : **nouveau modèle `Categorie` en DB** (l'utilisateur a confirmé).

---

## 2. Groupe A — Bugs bloquants du WIP retraits MLM

### A1. Migration Prisma manquante
`WithdrawalRequest` existe dans `schema.prisma` mais aucune migration dans `backend/prisma/migrations/` (dernière : `20260828000000_preserve_client_sponsor`). **Bloquant en prod.**

**Fix** : lancer `npx prisma migrate dev --name add_withdrawal_requests_categories_password_reset` après avoir écrit les modèles A1 + C1 (Categorie) + C8 (suppression PortailToken) + D1 (PasswordResetToken) dans le schéma (une seule migration groupée). Vérifier le SQL généré avant application.

### A2. Bug format téléphone
`withdrawal.dto.ts:22` exige `^\+243\d{9}$` (avec `+`) mais le front envoie `243…` sans `+` (`PortalWithdrawalPage.tsx:157` initial `'243'`, pattern HTML `^243[0-9]{9}$` ligne 390). **Toute demande Mobile Money est rejetée en 400.**

**Fix** : le backend normalise au lieu d'exiger — le DTO valide `^(\+?243)?\d{9}$` et le service stocke toujours `+243XXXXXXXXX` (normalisation au même endroit que la validation, ou dans le service). Le front reste inchangé. Cohérent avec la convention CLAUDE.md (`+243XXXXXXXXX`) et la normalisation KPay existante.

### A3. DTOs écrits mais jamais importés
`ApproveWithdrawalRequestDto` et `RejectWithdrawalRequestDto` (dans `withdrawal.dto.ts`) ne sont utilisés par aucun endpoint. `mlm.controller.ts:248` type le body inline → `rejectReason` non validé à runtime alors que le front l'exige.

**Fix** : brancher les DTOs sur les 3 endpoints admin (`approve`, `reject`, `mark-paid` dans `mlm.controller.ts`). `RejectWithdrawalRequestDto.rejectReason` passe en `@IsNotEmpty()` avec longueur max. Un `ApproveMarkPaidDto` minimal (`approvedById: @IsUUID()`, `notes?`) couvre approve et mark-paid.

### A4. Statut `ANNULE` inatteignable
L'enum `WithdrawalRequestStatut` contient `ANNULE`, affiché dans les badges front, mais aucun endpoint ne permet au client d'annuler sa propre demande.

**Fix** : nouveau endpoint portail `PATCH /portal/withdrawal-requests/:id/cancel` (propriétaire uniquement, `JwtAuthGuard`, vérif `membreId === currentMembre.id`) — seul `EN_ATTENTE` → `ANNULE`. Les commissions relibérées automatiquement (déjà le cas : `getValidatedCommissions` exclut seulement EN_ATTENTE/APPROUVE/PAYE). Ajout dans `portal.api.ts` + bouton « Annuler » sur les cartes EN_ATTENTE de l'onglet Historique de `PortalWithdrawalPage.tsx`.

### A5. Rôles incohérents sur la page admin
Page `/mlm/withdrawal-requests` accessible GERANT+, mais approuver/rejeter/payer exige DIRECTEUR_REGIONAL+ → 403 au clic.

**Fix** : dans `MlmWithdrawalRequestsPage.tsx`, les boutons d'action ne s'affichent que si `hasRole('DIRECTEUR_REGIONAL')` (via `useAuth`). GERANT garde la lecture (filtres, tableau, cartes résumé).

### A6. Tests manquants sur le nouveau flux
Le spec `portal.service.spec.ts` (nouveau) ne couvre que `getPurchases`/`getWallet`/`getWalletTransactions`. Rien sur le flux retrait.

**Fix** : compléter `portal.service.spec.ts` avec `createWithdrawalRequest` (succès, commissions invalides `ERR_INVALID_COMMISSIONS`, montant excessif `ERR_AMOUNT_EXCEEDS`, infos Mobile Money manquantes `ERR_MISSING_PAYMENT_INFO`, normalisation téléphone), `getValidatedCommissions` (exclusion des commissions engagées), et le nouveau cancel. Étendre `mlm-wallet.service.spec.ts` avec `approveWithdrawalRequest` (commissions re-vérifiées, CASH → PAYE direct), `rejectWithdrawalRequest`, `markWithdrawalAsPaid` (400 si mauvais statut).

---

## 3. Groupe B — Bugs fonctionnels

### B1. `useOnlineSync` jamais monté
Les ventes POS offline s'accumulent dans IndexedDB (`POSPage.tsx:402`) mais ne sont **jamais resynchronisées** : `hooks/useOnlineSync.ts` n'est appelé nulle part. La bannière n'affiche jamais « syncing/synced » ni le compteur.

**Fix** : monter `useOnlineSync()` dans `AppLayout.tsx` (composant des routes authentifiées back-office — les ventes offline ne se créent que dans le POS, derrière ce layout). Vérifier que le drain au montage + les listeners `online/offline` fonctionnent et que `pendingSyncCount` alimente bien `OfflineBanner`.

### B2. Filtre `niveauFidelite` → crash Prisma
`clients.service.ts:232` filtre sur `where.niveauFidelite` quand `?niveau=` est passé — **le champ n'existe plus dans le schéma** (supprimé par la migration MLM). `GET /clients?niveau=…` lève une erreur Prisma.

**Fix** : supprimer le bloc de filtre `niveau` dans `clients.service.ts`. Vérifier qu'aucun front n'envoie ce paramètre (la liste clients n'a pas de filtre fidélité — à confirmer en implémentant).

### B3. Double `OfflineBanner`
Rendu 2× : `App.tsx:116` (global) + `AppLayout.tsx:390` → deux bannières superposées sur le back-office.

**Fix** : garder le global de `App.tsx:116` (couvre aussi les pages portail/publiques), supprimer celui de `AppLayout.tsx:390`.

### B4. Redirection CLIENT en boucle potentielle
`RoleGuard.tsx:14` redirige vers `/dashboard` qui exige AGENT → un CLIENT qui navigue vers une route protégée boucle. `AuthGuard` pose `state={{ from }}` mais personne ne le lit.

**Fix** : `RoleGuard` redirige les CLIENT vers `/portal/home` (au lieu de `/dashboard`), les autres rôles vers `/dashboard`. Dans `LoginPage`, lire `location.state.from` pour la redirection post-login (le paramètre `?redirect=` existant reste).

---

## 4. Groupe C — Nettoyage des vestiges

### C1. Catégories produits non persistées
`addCategorie`/`deleteCategorie` (`stocks.service.ts:702-726`) ne persistent rien — la liste ne vit que le temps de la requête, alors que le front (`NouveauProduitPage.tsx`, `POSPage.tsx`, `InventairePage.tsx`) l'utilise réellement.

**Fix** : nouveau modèle Prisma :
```prisma
model Categorie {
  id        String   @id @default(uuid())
  nom       String   @unique
  createdAt DateTime @default(now())
  @@map("categories")
}
```
`getCategories` lit la table (fallback : dérivée des produits si table vide, pour la transition initiale), `addCategorie` upsert, `deleteCategorie` refuse si des produits l'utilisent (400 `ERR_CATEGORIE_UTILISEE`). Même migration que A1/D1.

### C2. Seed mensonger
Le seed log « 8 utilisateurs » alors qu'un seul est créé (bloc `if (false)` lignes 114-232, alias `agentGoma = superAdmin`…), et le mot de passe admin est en clair.

**Fix** : corriger les logs pour refléter la réalité (« 1 utilisateur SUPER_ADMIN créé »). Le mot de passe vient déjà de `process.env.SEED_ADMIN_PASSWORD ?? 'Admin@2025'` — documenter dans `.env.example` plutôt que changer le comportement.

### C3. Page `/portal/points` orpheline
La nav portail (`PortalNav.tsx`) a remplacé l'onglet « Gains » par « Commissions », mais `/portal/points` reste routé et n'est accessible que via `QuickActionsGrid`.

**Fix** : garder la page mais la re-rendre accessible — remplacer dans `QuickActionsGrid` l'entrée « Portefeuille » redondante par un lien direct `/portal/points` « Historique des gains ». (La page reste utile : historique des transactions wallet filtrable, ce que `/portal/commissions` ne fait pas.)

### C4. Doublons de routes MLM
`mlm/members/:id` et `mlm/member/:id` pointent tous deux vers `MemberProgressPage` (`App.tsx:177-178`).

**Fix** : garder `mlm/members/:id`, supprimer `mlm/member/:id`. Vérifier aucun `navigate()` vers l'ancienne forme dans le code.

### C5. Pages stub non routées
`BonusesPage.tsx`, `SalaryPage.tsx`, `MemberMatrixPage.tsx` : placeholders d'une ligne, jamais importés.

**Fix** : suppression pure et simple (les données bonuses/salaires sont déjà exposées via `MemberProgressPage` et les hooks `useMlm`).

### C6. `RapportParrainagePage` orpheline
Page complète (381 lignes) + hook `useParrainageReport`, jamais routée. Mais le parrainage points a été remplacé par le MLM — la page est probablement obsolète.

**Fix** : **supprimer** la page et le hook (le rapport MLM pertinent est déjà dans `MlmTreePage`/`MlmCommissionsPage`). Si l'utilisateur veut un jour un rapport de réseau, il sera construit sur les données MLM.

### C7. Store `dashboardCache` inutilisé
`offline.ts:20-25,59-67` : le store IndexedDB `dashboardCache` et ses helpers n'ont aucun appelant (seul `cache` est utilisé par `useDashboard`).

**Fix** : supprimer le store et les helpers morts. Bump de version IndexedDB (v2 → v3) avec `upgrade` qui supprime l'ancien store — les données `pending-ventes` et `cache` doivent survivre (ATTENTION : bien tester qu'une vente en attente n'est pas perdue pendant l'upgrade).

### C8. `PortailToken` jamais utilisé
Modèle Prisma créé mais aucun code ne le lit ni l'écrit (remplacé par le JWT CLIENT).

**Fix** : supprimer le modèle + la relation `Client.portailToken` du schéma (dans la même migration groupée — DROP TABLE).

### C9. Vestiges fidélité
- `cart.store.ts:70-71` : `remiseMontant()` codée à 0 avec commentaire « Removed with MLM migration » → remplacer par une vraie constante `0` documentée ou simplifier le getter (le champ `appliquerRemise` du store devient mort → supprimer).
- `types/index.ts:43-47` : `refreshToken` dans `LoginResponse`, jamais consommé → supprimer du type.
- `config-app.service.ts:31-36` + `settings.api.ts:113-118` + onglet fidélité de `ConfigGeneralePage` : niveaux Bronze/Argent/Or/Platine cosmétiques. **Fix** : laisser la section config (elle est éditable et sans crash) mais supprimer les niveaux du service si non consommés ailleurs — à trancher en implémentant avec le moins de risque.

### C10. Commentaires menteurs code parrain
`clients.service.ts:1153` annonce « TSG-XXXX » mais le code génère `AAAAMMJJ####`.

**Fix** : corriger le commentaire. Mettre à jour CLAUDE.md (convention code parrain `AAAAMMJJ####` — le `TSG-XXXX` ne concerne que les SKU produits).

### C11. CLAUDE.md obsolète
« Token JWT en mémoire uniquement (jamais localStorage) » contredit le code (`auth.store.ts:43-49`).

**Fix** : réécrire la règle : « Access token en localStorage (clé `ebn_auth_v1`), refresh token en cookie httpOnly ».

---

## 5. Groupe D — Persistance des OTP de reset password

### D1. Nouveau modèle `PasswordResetToken`
Actuellement : `otpStore: Map` en mémoire (`auth.service.ts:22-23`) — perdu au redémarrage, non partageable multi-instance.

**Modèle** :
```prisma
model PasswordResetToken {
  id          String   @id @default(uuid())
  identifier  String   // telephone ou email de l'utilisateur ciblé
  otpHash     String   // OTP 6 chiffres hashé bcrypt
  resetToken  String?  @unique // UUID post-vérification OTP
  attempts    Int      @default(0)   // essais OTP (max 3)
  expiresAt   DateTime // OTP : +10 min ; resetToken : +15 min
  consumedAt  DateTime?
  createdAt   DateTime @default(now())

  @@index([identifier])
  @@map("password_reset_tokens")
}
```

### D2. Refonte `AuthService`
Remplacer la Map par `prisma.passwordResetToken` :
- `forgotPassword` : upsert par `identifier` (un seul token actif par identifiant), OTP hashé bcrypt, `expiresAt = now + 10 min`, `attempts = 0`.
- `verifyOtp` : lit le token actif non consommé, incrémente `attempts`, refuse si `attempts >= 3` ou expiré ; à succès écrit `resetToken` (UUID, expir +15 min).
- `resetPassword` : vérifie le `resetToken` non consommé/non expiré, change le mot de passe, marque `consumedAt`.
- Le comportement externe (messages d'erreur, délais, envoi SMS/mail) reste identique.

### D3. Cron de purge
`@Cron` quotidien dans `AuthService` (ou un petit `MaintenanceService`) : `deleteMany({ expiresAt: { lt: new Date() } })` — purge les tokens expirés depuis plus de 24h.

---

## 6. Erreurs & edge cases

- **A1 (migration)** : si la DB locale ne tourne pas, demander à l'utilisateur de la démarrer — ne jamais écrire la migration à la main en secours sans le dire explicitement.
- **A2 (téléphone)** : accepter `+243…`, `243…`, et `0…` (préfixe local) — tout normaliser vers `+243XXXXXXXXX`. Si après normalisation ce n'est pas 12 chiffres → 400.
- **C1 (catégories)** : transition — au premier `getCategories`, si la table est vide, seed depuis les `categorie` distinctes des produits existants.
- **C7 (IndexedDB)** : l'upgrade v3 doit préserver `pending-ventes` et `cache`. Un test manuel : créer une vente offline, recharger, vérifier qu'elle est toujours dans la file.
- **D1** : ne jamais stocker l'OTP en clair ; les messages d'erreur ne révèlent pas si l'identifiant existe (comportement actuel conservé).

## 7. Tests

- **Backend** : compléter `portal.service.spec.ts` (A6) et `mlm-wallet.service.spec.ts` (A6) — cible : tout le flux retrait couvert. Vérifier les specs existantes passent toujours.
- **Frontend** : les tests vitest existants (portail, rapports) doivent passer. Ajout d'un test sur le bouton « Annuler » (A4) si le setup s'y prête facilement.
- **Manuel** : vérifier la migration en local (`migrate dev` puis `studio`), le sync offline (B1), et le login/reset password (D2).

## 8. Ordre d'implémentation

1. **Migration unique groupée** (A1 + C1 + C8 + D1) — le socle DB.
2. **Groupe A** (2→3→4→5→6) : DTOs, téléphone, cancel, rôles, tests.
3. **Groupe D** (D2→D3) : refactor AuthService + cron.
4. **Groupe B** (B1→B2→B3→B4) : sync offline, filtre crash, bannière, guards.
5. **Groupe C** : nettoyage (C1 logique catégories, C2-C11).
6. **Vérification finale** : build back + front, tous les tests, `tsc --noEmit`.

Chaque groupe est committé séparément. Le CLAUDE.md (C10, C11) est mis à jour au dernier commit.
