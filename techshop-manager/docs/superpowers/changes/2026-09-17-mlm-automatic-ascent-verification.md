# Vérification de la remontée automatique MLM

Le rapport initial ci-dessous décrit la première livraison. Le complément en fin de document remplace la règle de blocage systématique devant un grand-parent complet.

## Livraison locale

- MlmPlacementService applique les remontées après placement, déplacement et échange, dans la transaction et sous le verrou existants.
- Une branche active à quatre places validées dépasse son parent incomplet vers la première place libre chez le grand-parent. Le parent dépassé, les recruteurs et les descendants sont conservés.
- Arrêt devant un parent complet, une destination pleine/inactive, une position non validée ou une racine. Aucune cinquième place ni remplacement artificiel de racine.
- Historique AUTO_ASCEND, agrégats et progression mis à jour ; dates de validation des positions conservées. Commissions déjà validées et retenues inchangées ; aucun doublon de rémunération.
- POST `/mlm/matrix/:memberId/reconcile-ascents` réservé aux SUPER_ADMIN/DIRECTEUR_REGIONAL, UUID et motif obligatoires, acteur issu du JWT, rejeu idempotent. Bouton « Vérifier la remontée » dans les détails de l'arbre pour les membres existants.
- Arbre/liste et détails actualisés : génération relative corrigée après remontée, sélection fermée si la branche n'est plus visible/autorisée, clé de requête conservée après réponse réseau perdue.
- Aucun changement de schéma, aucune nouvelle migration, aucune purge, aucun commit/push/déploiement. Les modifications Mobile Money préexistantes sont conservées.

## Vérifications finales

Depuis `backend`, avec `MLM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/mlm_integration` :

- `npm test -- --runInBand` : **489 tests passés, 96 ignorés**, 35 suites passées, quatre suites opt-in ignorées, aucun échec.
- La nouvelle suite comprend 21 scénarios PostgreSQL : remontées successives, limites de capacité/activité, conservation des branches, concurrence entre deux branches pour la dernière place, historique, rollback PLACE/SWAP, rejeu MOVE/SWAP/réconciliation, agrégats, absence de cycle et conservation d'une commission effectivement validée avec son portefeuille et son lot retenu.
- `npx tsc -p tsconfig.build.json` : succès.
- Audit final de la base synthétique : aucun doublon, slot invalide, parent surchargé, cycle, dérive de génération, total ou rang.
- `prisma validate`, `prisma migrate status` et `prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma --exit-code` : schéma valide, huit migrations locales appliquées, aucune différence. Les URL ont été explicitement fixées à la base de test locale.

Depuis `frontend` :

- `npm test -- src/components/mlm src/pages/mlm src/lib/mobile-money-api.test.ts --maxWorkers=1` : **116 tests passés**, 11 fichiers.
- `npm run build` : succès ; avertissements préexistants concernant lottie/eval et un bundle de plus de 500 kB.
- Suite frontend complète également exécutée : **273 tests passés, 21 échecs préexistants**. Dix-neuf échecs dans PortalPointsPage.test.tsx utilisent l'ancien mock usePortalPoints au lieu de usePortalWalletHistory, déjà appelé dans HEAD. Deux échecs dans NotFoundPage.test.tsx attendent d'anciens textes/liens. Les fichiers de test correspondants, le hook et la page 404 n'ont pas été modifiés par cette tâche.
- Un premier passage chargé a eu un timeout de sélection initiale dans NetworkNavigation ; le passage ciblé final et la suite complète ne reproduisent pas cet échec.

Contrôle navigateur local avec API interceptée et données synthétiques : largeurs 1440 et 390 px, une seule requête de réconciliation, génération 2 vers 1, recruteur conservé, parent actualisé, vue liste, aucun débordement horizontal ni erreur JavaScript. Captures inspectées hors dépôt.

`git diff --check` : succès. Revue indépendante sans défaut d'implémentation bloquant ; les lacunes de couverture signalées ont été ajoutées.

## Incidents de test résolus

Les fixtures négatives qui modifient activité/validation doivent aussi recalculer leurs projections avant l'évaluation. Le premier passage étendu a laissé 28 agrégats synthétiques incohérents et fait échouer l'audit global au passage suivant. Le setup est corrigé ; seuls les anciens membres du site synthétique « Ascent fixtures » dans la base loopback ont été recalculés. L'audit final est vierge avant toute réparation : aucune réécriture n'était nécessaire à ce dernier passage.

## Base distante

Deux lectures SQL ciblées, dans des transactions READ ONLY terminées par ROLLBACK, ont contrôlé le cas signalé. Le membre est à 4/4 et son parent matriciel à 3/4, mais la destination chez le grand-parent est déjà à 4/4. La remontée y est donc bloquée par la règle approuvée. Le lien recruteur est distinct du parent matriciel. Aucun déplacement, recalcul, changement financier ou autre écriture distante n'a été exécuté.

Après déploiement, les nouveaux placements déclenchent automatiquement le moteur. Pour un membre déjà complet, utiliser « Vérifier la remontée » avec un rôle autorisé ; une destination pleine reste bloquante et ne provoque pas le déplacement forcé d'une autre branche.

## Complément — échange entre branches, approuvé le 17 septembre 2026

- Si aucune place libre n'existe chez le grand-parent, remplacer la moins remplie des trois autres branches ayant moins de quatre enfants matriciels. Exclure le propre parent du membre ; départager les égalités par position.
- L'échange réutilise une primitive commune avec les échanges manuels. Les deux sous-arbres, recruteurs, états et dates de validation sont conservés. Historique AUTO_ASCEND/AUTO_DESCEND relié par une même clé ; le compteur de l'interface compte une seule remontée.
- Tests écrits avant la modification : cinq échecs backend et un échec frontend observés sur les nouveaux comportements, puis corrigés.
- Validation finale backend : `npm test -- --runInBand` avec la base synthétique loopback : **502 tests passés, 96 ignorés**, dont **34 scénarios de remontée/échange**. Couverture complémentaire de cascade après descente, conflits à la libération/au second placement, rollback manuel/automatique, concurrence, rejeu et commissions déjà créditées.
- Validation frontend : **103 tests MLM passés**, compilation de production réussie. La suite frontend complète n'a pas été relancée pour ce complément ; les 21 échecs préexistants du rapport initial restent hors périmètre.
- TypeScript backend et Prisma valides ; huit migrations locales appliquées, aucune différence de schéma. Audit final synthétique en lecture seule : aucun doublon, cycle, parent surchargé ou écart de compteurs/rangs.
- Contrôle navigateur local à 390 et 1440 px avec API simulée : bouton, actualisation de la génération, recruteur conservé, vue liste, aucune erreur JavaScript ni débordement. Historique descendant et comptage d'un échange vérifiés par les tests de composant.
- Revue indépendante sans défaut bloquant ; les deux compléments de couverture signalés sont intégrés. Aucun changement de schéma, aucune écriture distante, aucune purge. Ce complément est local, non commité et non déployé au moment de cette vérification.
