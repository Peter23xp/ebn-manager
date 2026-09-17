# Remontée automatique des branches MLM

## Règle approuvée

Un membre actif ayant quatre positions directes validées peut dépasser son parent matriciel incomplet. Il conserve tous ses descendants et son recruteur. Le parent dépassé conserve sa position, son propre parent et ses autres enfants.

Le membre rejoint en priorité la première position libre, dans l'ordre 1 à 4, du parent matriciel de son ancien parent. Une remontée gagne une génération et peut se répéter.

Complément approuvé le 17 septembre 2026 : si les quatre positions du grand-parent sont occupées, choisir parmi les trois autres branches, en excluant le propre parent matriciel du membre. La cible doit avoir moins de quatre positions directes occupées. Compter les occupants réels, même non validés, et non les recrues personnelles, le total des descendants ou le rang. Retenir le plus petit nombre, puis la première position en cas d'égalité. Les deux occupants échangent leurs positions entrantes, chacun avec toute sa descendance, sans modifier les recruteurs, l'activité ni les dates/états de validation. Le parent dépassé reçoit la branche remplacée dans la position libérée par le membre.

Arrêt devant un parent complet, sans cible remplaçable, devant une destination inactive ou une racine sans parent. Aucune cinquième place, aucun échange avec son propre parent, aucune nouvelle racine artificielle.

## Intégration

Étendre MlmPlacementService, sans seconde arborescence. Les positions réelles, non le rang historique ni le nombre de recrues personnelles, déterminent l'éligibilité. Quatre places occupées chez le parent arrêtent le dépassement, même si une place n'est pas encore validée. Une branche inactive/non validée ne remonte pas.

Réévaluer après placement et opérations administratives les membres affectés et les candidats voisins dont le parent ou la destination change de disponibilité. Une file déterministe bornée aux voisinages concernés évite de charger le réseau entier. La sélection de remplacement agrège au plus trois matrices de génération 1. Une branche à quatre places occupées ne peut jamais être une cible descendante.

La même transaction et le verrou PostgreSQL 604008 couvrent placement, remontées, historique et agrégats. Réutiliser les primitives d'échange manuel, vérifier les cycles dans les deux directions et libérer les positions sous condition de leur occupant attendu. Préserver la date de validation des positions déplacées. Journaliser AUTO_ASCEND et, pour la branche remplacée, AUTO_DESCEND avec une clé d'événement commune : membre, recruteur, anciens/nouveaux parents et positions, raison du choix, événement déclencheur, date et acteur (null signifie système). Le rejeu renvoie les deux lignes sans répéter l'échange ; le compteur de l'interface compte seulement les remontées.

Les compteurs/rangs sont recalculés via le moteur existant. Garder les montants, la validation administrative, les commissions déjà acquises et leur clé generation:membre:niveau. Aucune validation financière ou transfert réel ajouté.

## Données et interfaces

Prisma possède déjà les colonnes nécessaires : aucune migration ni purge. L'arbre, les listes et l'historique consomment les positions réelles et doivent refléter le résultat. Les opérations MOVE/SWAP existantes restent disponibles et protégées. Les membres déjà complets peuvent être réévalués explicitement via le même moteur, sans redémarrage destructif ni recalcul financier parallèle. Ne pas exécuter une correction distante pendant les tests.

## Validation

Tests PostgreSQL synthétiques : 3/4 contre 4/4, descendants conservés, recruteurs inchangés, remontées successives, parent complet, destination pleine/inactive, racine, membre non valide, historique, concurrence, idempotence, rollback, agrégats, commissions uniques et arbre/générations. Régression backend/frontend, compilation, validation Prisma et comparaison du schéma local.

Pour l'échange en destination pleine : minimum des enfants directs (indépendamment du total des descendants), égalités par position, exclusion du propre parent même moins rempli, autres branches toutes complètes, places occupées non validées, validation/activité conservées, concurrence sur une seule branche remplaçable, cascade d'un descendant complet de la branche déplacée, rejeu et conservation d'une commission validée. Vérifier le rollback à la libération partielle, au second placement et à l'écriture de l'historique descendant, pour les échanges manuels et automatiques concernés. Dans l'interface, distinguer la descente de la remontée sans compter deux remontées pour un échange.
