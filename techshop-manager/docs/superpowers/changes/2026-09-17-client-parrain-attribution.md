# Attribution d'un parrain manquant

La fiche client permet au super administrateur, ou au gérant du site du client, d'attribuer un parrain lorsqu'aucun parrain ni aucune réclamation ne sont déjà enregistrés. La sélection et un motif sont confirmés avant envoi.

- `POST /clients/:id/parrain` reçoit `codeParrain` et `reason` ; l'acteur provient exclusivement de la session authentifiée.
- `GET /clients/:id/parrain/attribution` retourne l'attribution et ses identités publiques, ou aucune attribution.
- Un client en cours d'inscription conserve le parrain pour son activation normale.
- Si un parrain actif n'a pas encore de membre MLM, son initialisation est réparée dans la même transaction, même avant l'activation du filleul.
- Un client actif est rattaché dans la même transaction par le moteur MLM existant. Sa position existante et ses descendants sont conservés ; s'il n'est pas positionné, le placement/spillover normal s'applique.
- Un parrain en cours d'inscription utilise le processus existant de `parrainClaim`, sans contourner sa confirmation.
- Auto-parrainage, cycles de recrutement/placement et remplacement d'une relation existante sont interdits. Une réémission identique par le même acteur retourne l'attribution initiale.
- L'attribution et le placement sont atomiques. La progression peut générer une commission en attente via le moteur habituel, jamais un paiement immédiat ni une seconde commission pour un événement déjà traité.

## Déploiement

La migration additive `20260917180000_client_parrain_attribution` crée uniquement l'historique `client_parrain_attributions`. Elle ne supprime ni ne réattribue les relations existantes. Déployer cette migration et le backend avant le frontend. Les clients affectés précédemment sont corrigés individuellement avec ce nouvel écran, jamais par déduction automatique du parrain.

Le catalogue de maintenance reconnaît cette table et ses clés étrangères pour conserver la compatibilité des sauvegardes/restaurations et de l'ordre de suppression contrôlé. Aucune purge n'est exécutée par cette fonctionnalité.

## Vérifications

Les tests de service et d'API couvrent les droits, le site, les données forgées, les conflits, les cycles, les statuts et les répétitions. La suite `client-parrain.postgres.spec.ts`, activée par `CLIENT_PARRAIN_TEST_PG_BIN`, crée son propre serveur PostgreSQL temporaire sur loopback, applique les migrations et teste les transactions et le placement réels. Ne pas la diriger vers une base applicative.
