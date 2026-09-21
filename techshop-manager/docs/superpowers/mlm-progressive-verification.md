# Commissions progressives — livraison et vérifications

Date : 21 septembre 2026. Base de travail : `2b6b9ee`.

## Fonctionnement livré

- Une nouvelle position matricielle valide génère une tranche `EN_ATTENTE`, sans attendre la génération complète. Builder : 10 USD au total, dont 6 USD disponibles après validation et 4 USD retenus.
- Les huit générations rapportent indépendamment, dans leurs budgets existants. Le bénéficiaire suit la matrice ; le recruteur personnel reste inchangé.
- Les cumuls immédiats et retenus sont arrondis en Decimal à deux décimales, puis différenciés. Leur somme constitue le total. Aucun calcul financier n'est refait dans l'interface.
- Les placements, déplacements et remontées produisent des commissions sur leur état final transactionnel, pas sur des positions transitoires.
- Le plafond déjà comptabilisé ne diminue pas après déplacement ou annulation. Le budget est figé à la première comptabilisation. Les reprises ne rémunèrent pas deux fois les mêmes droits.
- La dernière tranche ne crée aucune commission complète supplémentaire. Rangs, promotions et bonus restent soumis à leurs conditions de génération complète et disposent d'une garde indépendante.
- La validation et les retraits existants restent obligatoires. Une retenue devient restituable après 30 jours ouvrables à compter de sa validation, lundi–samedi hors jours fériés RDC. Un calendrier manquant n'est pas contourné.

## Schéma et compatibilité

Migration additive : `backend/prisma/migrations/20260921000000_mlm_progressive_commissions/migration.sql`.

Elle ajoute les plafonds/budgets figés et la provenance des tranches. Elle ne réécrit ni ne supprime les commissions, relations, paiements ou portefeuilles existants. Le déclencheur d'un rattrapage peut être nul ; aucun faux filleul n'est créé.

La reconnaissance des anciennes commissions complètes utilise leurs montants historiques, y compris si la configuration a changé. Tous les statuts consomment les droits. Les historiques inconnus, incomplets, dupliqués ou incohérents nécessitent une revue, plutôt qu'une régénération silencieuse d'argent.

Le rattrapage des membres déjà présents est un outil d'exploitation distinct, partageant le même moteur : voir `mlm-progressive-catchup-runbook.md`. Il exige aperçu, sauvegarde réellement restaurée et vérifiée, maintenance exclusive, acteur SUPER_ADMIN et exécution explicite. Il crée uniquement des commissions en attente, jamais des paiements.

## API et interface

- `GET /mlm/members/:memberId/progress`, `GET /mlm/wallet/:memberId` et `GET /portal/wallet` exposent les agrégats `progressiveCommissions`.
- La réponse tableau existante des revenus par niveau reste inchangée.
- Les écrans de progression, portefeuille, commissions et portail distinguent tranches, budgets, gains générés, disponible, retenues et restitution. La configuration explique le gel des budgets déjà commencés.
- Une anomalie rend uniquement les droits incertains de la génération indisponibles ; les soldes connus et les autres générations restent consultables.
- Les lectures staff ajoutées respectent les règles rôle/site existantes. Les caches privés sont cloisonnés par identité, session, rôle et site, y compris lors de réponses tardives ou de relances manuelles.
- Les agrégats utilisent les compteurs et regroupements SQL, sans charger l'arbre entier. La réconciliation d'écriture parcourt tout l'historique d'une génération par pages de 256 : chaque réponse est bornée, mais le coût total et la mémoire de l'historique restent proportionnels à celui-ci.

## Vérifications

Les tests utilisent des données synthétiques sur PostgreSQL local uniquement. Les URL Prisma sont explicitement remplacées par des URL loopback ; aucun serveur applicatif n'est lancé contre la configuration de production.

- Suite backend complète finale : 1 381 tests réussis, 199 tests d'intégration conditionnels ignorés, 52 suites réussies.
- Build backend, génération/validation Prisma et état des 11 migrations locales : réussis.
- Tests unitaires monétaires : toutes les capacités de 4 à 65 536, sommes finales, arrondis, tranches nulles et entrées invalides.
- Revue indépendante du moteur : défauts de réconciliation, de validation des montants et d'avantages historiques corrigés avec régressions.
- Revue indépendante API/frontend : six constats corrigés, dont les accès intersites, les caches privés et les anomalies historiques. Les contre-exemples et témoins valides ont été revérifiés.
- Intégration PostgreSQL : 61 tests réussis dans cinq suites (remontées, endpoints, tranches, conservation des historiques à la migration et rattrapage transactionnel), un scénario natif conditionnel ignoré dans cette commande. Le test de progression auparavant interrompu par un délai pendant les builds parallèles passe lors de cette réexécution complète.
- Suite frontend stable : 862 tests réussis et 21 échecs préexistants, dans les deux fichiers historiques détaillés ci-dessous. Les nouveaux tests de progression et de confidentialité passent.
- Build frontend : réussi. Contrôles Edge avec API synthétiques interceptées : huit scénarios staff/client réussis aux largeurs 320, 390, 768 et 1 440 px, sans débordement du composant financier, erreur de page ni requête inattendue. Navigation clavier vérifiée ; captures mobile examinées.
- Rattrapage : 63 tests réussis dans trois suites, avec sauvegarde/restauration PostgreSQL native, reprise sans doublon, maintien du portefeuille et refus des modifications de schéma/triggers après sauvegarde. Les trois constats de revue ont été corrigés et revérifiés par le contrôleur ; la seconde revue indépendante n'a pas pu être exécutée à cause d'une limite du fournisseur.

Les journaux détaillés locaux se trouvent dans `.superpowers/progressive-*.log` à la racine du dépôt. Ils ne constituent pas des rapports financiers de production.

Les services PostgreSQL de test et de restauration ont été arrêtés après vérification. Les bases temporaires allouées aux migrations/rattrapages sont supprimées par leurs tests ; les bases et sauvegardes préexistantes restent intactes. Les contrôles navigateur ferment leur serveur et leurs contextes.

## Limites et opérations non exécutées

- Au terme des vérifications locales, aucun commit, push, déploiement, migration distante, purge ou rattrapage réel n'avait été effectué.
- Avant mise en production : autoriser le déploiement, vérifier les sauvegardes et appliquer la migration avec le processus habituel. Avant rattrapage : suivre séparément le runbook et examiner les anomalies de l'aperçu.
- La suite frontend historique comporte des échecs déjà reproduits sur le commit de base : 19 tests `PortalPointsPage` utilisent un mock sans `usePortalWalletHistory`, et deux assertions `NotFoundPage` ne correspondent plus à la page. Ils ne sont ni masqués ni modifiés dans cette évolution.
- Les avertissements existants de build frontend concernant `lottie-web` et la taille des bundles ne sont pas traités ici.

## Publication autorisée

Après présentation de ces résultats et des échecs frontend préexistants, l'utilisateur a demandé le 21 septembre 2026 : « deploy sur main tout ca ». Cette demande autorise le commit, le push sur `main` et le déploiement de cette évolution avec sa migration additive via le démarrage habituel. Elle n'autorise ni purge ni exécution du rattrapage financier. Les contrôles avant publication sont relancés ; les statuts Vercel/Render et l'état des migrations restent à confirmer après le push.
