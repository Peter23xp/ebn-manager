# Spec — Parrain en attente : réclamation de filleuls via code facture

**Date :** 2026-09-08
**Statut :** Validée par le client
**Approche retenue :** Table `ParrainClaim` + rattachement différé confirmé par code de facture (Approche 1)

## 1. Problème

Aujourd'hui, pour qu'un client puisse parrainer, il doit être `ACTIF` (avoir acheté son produit d'activation). À la création d'un filleul (`createClient`, `createRecit`), si le `codeParrain` saisi désigne un client `EN_COURS`, la création est **rejetée** avec *« Le parrain doit être un membre actif »* (`clients.service.ts:848-856`).

Or un parrain légitime qui n'a pas encore activé son compte doit pouvoir amener des filleuls : on doit pouvoir **les enregistrer dès maintenant**, et **lier rétroactivement** le jour où le parrain active son compte, en prouvant son identité avec un code tiré de sa facture d'activation. Les commissions qui lui sont dues (matrice, promotion) doivent alors se déclencher normalement.

## 2. Décisions produit (validées en entretien)

| # | Question | Décision |
|---|----------|----------|
| Q1 | Association filleul ↔ parrain non-validé | **Par le téléphone du parrain** saisi par l'agent ; le système retrouve le Client `EN_COURS` |
| Q2 | Rôle du code facture | **Déclencheur obligatoire** : à l'activation, le parrain (ou l'agent) doit confirmer avec le code simplifié de sa facture d'activation ; sans confirmation, les filleuls restent en attente |
| Q3 | sort du filleul pendant l'attente | Le filleul **poursuit son onboarding normalement** (peut devenir ACTIF, avoir son propre code, sa propre matrice) ; seul le lien de parrainage + commissions est différé |
| Q4 | Parrain qui n'active jamais | **Rien de spécial** (YAGNI) : le claim reste `EN_ATTENTE` indéfiniment ; le rattachement se fera si/quand il active (statut extensible pour de futures ex. réattribution admin) |

## 3. Modèle de données

### 3.1 Nouveau enum + modèle Prisma

```prisma
enum ClaimStatut {
  EN_ATTENTE   // parrain pas encore activé / pas encore confirmé
  LIE          // rattachement confirmé via code facture
}

model ParrainClaim {
  id                    String      @id @default(uuid())
  filleulClientId       String      @unique   // un seul claim par filleul
  parrainClientId       String
  statut                ClaimStatut @default(EN_ATTENTE)
  telephoneParrainSaisi String                // trace du numéro saisi à l'enregistrement
  factureReclamee       String?               // numeroVente utilisé à la confirmation (ex: GOM-202609-0047)
  confirmedById         String?               // Utilisateur (agent) ou null si parrain via portail
  createdAt             DateTime    @default(now())
  confirmedAt           DateTime?

  filleul Client @relation("ClaimFilleul", fields: [filleulClientId], references: [id])
  parrain Client @relation("ClaimParrain", fields: [parrainClientId], references: [id])

  @@index([parrainClientId, statut])
  @@map("parrain_claims")
}
```

Relations à ajouter sur `Client` : `claimsFilleul ParrainClaim[] @relation("ClaimFilleul")` et `claimsParrain ParrainClaim[] @relation("ClaimParrain")`.

### 3.2 Ce qui est inchangé

- `Client.parrainClientId` continue de pointer vers le client parrain (`ACTIF` **ou** `EN_COURS`).
- Aucun changement à `Membre`, `Matrix`, `Position`, `Commission`.
- Migration Prisma additive (création enum + table + 2 FK) — aucune destruction.

## 4. Backend — Flux

### 4.1 Enregistrement d'un filleul avec parrain EN_COURS

Modifié dans `clients.service.ts` : `createClient` (~ligne 836) et `createRecit` (~ligne 950, voie Kpay).

1. **Résolution élargie du parrain** à partir du champ `codeParrain` saisi :
   - OR existant : `{ codeParrain }`, `{ membre: { matricule } }`
   - **Nouveau** : `{ telephone: <numéro normalisé> }` — l'agent peut saisir le téléphone du parrain non-activé.
2. Aucun client ne match → **400 `ERR_PARRAIN_NOT_FOUND`** (pas de claim sur un numéro inventé — évite les liens fantômes par faute de frappe).
3. Parrain `ACTIF` → comportement **inchangé** : lien direct, aucun claim.
4. Parrain `EN_COURS` → **au lieu de rejeter** :
   - créer le filleul avec `parrainClientId` pointant vers le client EN_COURS (comme aujourd'hui),
   - créer un `ParrainClaim{ filleulClientId, parrainClientId, statut: EN_ATTENTE, telephoneParrainSaisi }`,
   - réponse incluant `warning: "PARRAIN_NON_ACTIVE"` — message : *« Parrain non encore activé — le lien sera confirmé à son activation »*.
5. Garde-fous :
   - `parrainClientId === clientId` du filleul → 400 ;
   - un **filleul** ne peut avoir qu'un seul lien : s'il a déjà un `parrainClientId` (lien existant) ou un claim, on ne crée pas de doublon — `@@unique(filleulClientId)` + garde en service, la tentative de re-liage est ignorée silencieusement (le premier lien gagne), comme aujourd'hui ;

### 4.2 Activation du parrain

`onboardingActivate(clientId, dto, agentId)` — nouveau champ **optionnel** `dto.codeFacture?: string`.

Ordre exact (tout dans la même transaction, sinon le client reste `EN_COURS`) :

1. Le `numeroVente` de la vente d'activation est **déjà généré avant** la transaction (pattern existant, ligne ~1160).
2. Vérifier `parrain_claims` : `count(parrainClientId = clientId, statut = EN_ATTENTE)`.
3. **Si count = 0** → chemin strictement inchangé (zéro friction pour 99 % des activations). `codeFacture` ignoré s'il est fourni sans claim.
4. **Si count ≥ 1** :
   - `codeFacture` absent → **409 `ERR_CLAIM_CODE_REQUIRED`**, payload `{ nbFilleulsEnAttente, factureHint }` (hint = suffixe attendu, ex. « les 4 derniers chiffres de GOM-202609-0047 »). Client **non activé**.
   - `codeFacture` présent → normaliser (majuscules, retirer tirets/espaces) et matcher contre le `numeroVente` d'activation, soit en suffixe (les 4 chiffres `0047` → `GOM2026090047`), soit en forme complète (`GOM-202609-0047`).
   - Match échoué → **400 `ERR_CLAIM_CODE_INVALID`**. Client **non activé**.
   - Match réussi → la transaction poursuit l'activation normalement (statut ACTIF, codeParrain, vente, stock, etc.), puis après commit : voir 4.3.

### 4.3 Rattachement + commissions (post-activation du parrain)

Pour **chaque** claim `EN_ATTENTE` du parrain activé, dans une transaction dédiée :

1. `claim.statut → LIE`, `factureReclamee = numeroVente`, `confirmedAt = now`, `confirmedById = agentId`.
2. Résoudre l'état du filleul :
   - **Filleul encore `EN_COURS`** : rien à faire maintenant. À sa propre activation, `onClientActivated(filleulId, parrainClientId)` (appelé par le chemin existant avec `client.parrainClientId`) résoudra le parrain devenu ACTIF et rattache normalement. (Vérification : la résolution en 6 voies de `mlm-matrix.service.ts:32-44` couvre bien `clientId`.)
   - **Filleul `ACTIF` sans `Membre`** : idem — `healActiveClientsWithoutMembre` ou son activation propre s'en chargent.
   - **Filleul `ACTIF` avec `Membre` sans `parrainId`** (le cas clé) : appeler `mlmMatrixService.onClientActivated(filleulClientId, parrainMatricule)` — la voie de « heal » existante (mlm-matrix.service.ts:54-72) rattache le Membre, met à jour `Client.parrainClientId` si besoin, et remplit la matrice.
   - **Filleul avec déjà un `parrainId`** (un autre lien a été établi entre-temps) → ne pas écraser ; tracer `notes` et laisser `EN_ATTENTE`→`LIE` quand même ? **Non** : garder `EN_ATTENTE` et logger (conflit rar — l'agent devra trancher manuellement). Voir §6 edge cases.
3. Le remplissage de matrice se fait via `_fillParrainPosition` existant : chaque filleul rattaché occupe une position ; à 4/4 → `_triggerPromotion` → **Commission `EN_ATTENTE`** (créditée au portefeuille à la validation admin, pattern « OPTION B » actuel). C'est le « reversement de toutes les commissions qui lui sont dues » — sans code nouveau.

### 4.4 Confirmation différée (si le code manquait à l'activation)

```
POST /api/v1/mlm/claims/confirm
POST /api/v1/portal/claims/confirm   (parrain connecté, same service)
```

Body : `{ parrainClientId?: string, telephoneParrain?: string, codeFacture: string }`
(au moins `parrainClientId` ou `telephoneParrain` ; sur la route portail, l'identité = le client connecté, le corps ne contient que `codeFacture`).

Règles :
- Le `codeFacture` est vérifié contre la **vente liée à l'étape `ACTIVATION` du parrain uniquement** — pas une vente ultérieure. (Sinon n'importe quel reçu d'occasion pourrait prouver l'identité.)
- Parrain encore `EN_COURS` → 400 (il doit d'abord activer ; la voie normale est §4.2).
- Parrain `ACTIF`, claims `EN_ATTENTE` ≥ 1, code valide → même routine que §4.3.
- Aucun claim `EN_ATTENTE` → 409 `ERR_CLAIM_ALREADY_LIE` / 404 si le client n'a jamais eu de claims.
- Accès : `ADMIN`, `GERANT`, `AGENT` (guichet) + parrain lui-même (portail).

### 4.5 Lecture

- `GET /api/v1/mlm/claims?statut=EN_ATTENTE` (admin) — file d'attente, avec filleul (nom, tél, statut onboarding), parrain (nom, tél, statut).
- La voie `GET /clients/:id` existante inclut désormais `parrainClaim: { statut, parrain: {...} } | null` pour le bandeau frontend.
- `GET /portal/me` inclut `filleulsEnAttenteCount` (pour la carte portail).

## 5. Frontend

1. **Création client / onboarding RECIT** : placeholder du champ « Code parrain » → « Code parrain ou téléphone du parrain ». Si réponse avec `warning: PARRAIN_NON_ACTIVE` → bannière d'info verte/orange sous le formulaire reprenant le message du backend, la création a bien réussi.
2. **Écran d'activation (onboarding Activate)** : sur 409 `ERR_CLAIM_CODE_REQUIRED`, afficher un champ *« Saisissez le code de la facture d'activation (ex. les 4 derniers chiffres : 0047) »* + le `factureHint` renvoyé, puis re-soumettre avec `codeFacture`. Sur 400 `ERR_CLAIM_CODE_INVALID`, message inline rouge, le client n'est pas activé.
3. **Portail client (parrain)** : carte « Mes filleuls en attente (N) » → champ code facture → `POST /portal/claims/confirm`. Après succès : liste des filleuls rattachés.
4. **Portail filleul + Admin Clients** : bandeau orange tant que le claim est `EN_ATTENTE` : « Parrain en attente d'activation — lien à confirmer ». Dans la section **Parrainage** admin : colonne/statut « Réclamation en attente » sur la liste des parrainages.

## 6. Erreurs & edge cases

| Cas | Comportement |
|---|---|
| Téléphone parrain introuvable à l'enregistrement | 400 `ERR_PARRAIN_NOT_FOUND` — pas de création |
| Activation avec claims sans `codeFacture` | 409 `ERR_CLAIM_CODE_REQUIRED` + `{ nbFilleulsEnAttente, factureHint }` — client **non activé** |
| `codeFacture` invalide | 400 `ERR_CLAIM_CODE_INVALID` — client **non activé** (tout est pré-committed dans la transaction) |
| Claim déjà `LIE`, re-confirmation | 409 `ERR_CLAIM_ALREADY_LIE` |
| Filleul rattaché entre-temps à un **autre** parrain avant la confirmation | claim reste `EN_ATTENTE`, log `warn` (conflit rare — l'admin tranche) ; on n'écrase jamais un `parrainId` existant |
| Parrain se rattache à lui-même (même Client) | 400 à la création du claim |
| Le parrain active avec **plusieurs** filleuls en attente | tous confirmés d'un coup avec **le même** code (une seule vente d'activation = une seule preuve) |
| Double-activation concurrente / retry auto-heal | idempotent : `onClientActivated` existant est idempotent (`referenceId` de Commission unique, guard `parrainId` déjà posé) ; le claim ne passe à `LIE` qu'une fois (`statut` vérifié dans la transaction) |
| `codeParrain` fourni à l'enregistrement match un client `BLOQUE`/autre statut | inchangé vs aujourd'hui (seuls ACTIF/EN_COURS ouvrent un lien) |

## 7. Compatibilité / non-régression

- Activation d'un client **sans** claim : chemin de code strictement inchangé, aucun champ requis.
- `onClientActivated`, `_fillParrainPosition`, `_triggerPromotion` : **aucune modification** — réutilisation pure.
- Tests existants `mlm-parrain-link.spec.ts` : doivent passer sans modification.
- Les filleuls `EN_COURS` liés à un parrain `ACTIF` (cas actuel) ne créent **pas** de claim (pas de régression).

## 8. Tests (nouveaux)

**Unitaires `clients.service`**
- `createClient` avec téléphone d'un client `EN_COURS` → client créé + claim `EN_ATTENTE` ; réponse `warning: PARRAIN_NON_ACTIVE`.
- `createClient` avec téléphone introuvable → 400, aucun client créé.
- `createClient` avec `codeParrain` d'un ACTIF → aucun claim (inchangé).
- `createRecit` (Kpay) : mêmes cas.
- Filleul qui se rattache à lui-même → 400.

**`onboardingActivate`**
- Claims ≥ 1, `codeFacture` absent → 409 + client toujours `EN_COURS` + zéro vente créée (transaction rollback).
- Claims ≥ 1, `codeFacture` = suffixe valide → activation OK + claims `LIE` + `onClientActivated` appelé pour chaque filleul ACTIF.
- Claims ≥ 1, `codeFacture` = forme complète valide → OK (normalisation tirets/casse).
- `codeFacture` invalide → 400 + client `EN_COURS`.
- Aucun claim → comportement actuel exact.

**`mlm.service` claims**
- `confirmParrainClaim` : happy path ; parrain non-ACTIF → 400 ; déjà `LIE` → 409 ; code = vente non-activation → 400.
- Idempotence : confirmation de 3 claims, re-confirmer → 409 sans effet.
- Conflit « filleul déjà rattaché ailleurs » → claim reste `EN_ATTENTE`.

**Régression** : suite MLM existante + `mlm-parrain-link.spec.ts` verts.

## 9. Fichiers touchés

**Backend**
- `prisma/schema.prisma` + migration `add_parrain_claim`
- `src/modules/clients/clients.service.ts` (résolution parrain ×2, `onboardingActivate` code facture)
- `src/modules/mlm/mlm.service.ts` ou nouveau `parrain-claim.service.ts` (confirm/list)
- `src/modules/mlm/mlm.controller.ts` (+ route portal dans `portal.controller.ts`)
- DTOs : `OnboardingActivateDto` (+ `codeFacture?`), nouveau `ConfirmClaimDto`

**Frontend**
- `pages/clients/...` (création client, écran activation) — affichage warning + champ code facture
- `pages/portal/...` — carte « filleuls en attente » + saisie code
- `pages/parrainage/...` admin — statut réclamations

**Hors périmètre (explicitement)** : expiration/délai des claims, réattribution admin d'un filleul orphelin, auto-rattachement sans preuve, multi-factures. Le `statut` enum est extensible (`EXPIRE`, `REATRIBUE`) sans migration si besoin plus tard.
