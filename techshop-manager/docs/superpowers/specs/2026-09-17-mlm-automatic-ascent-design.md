# Remontée automatique des branches MLM

## Règle approuvée

Un membre actif ayant quatre positions directes validées peut dépasser son parent matriciel incomplet. Il conserve tous ses descendants et son recruteur. Le parent dépassé conserve sa position, son propre parent et ses autres enfants. Il ne s'agit donc plus d'un échange de deux occupants.

Le membre rejoint la première position libre, dans l'ordre 1 à 4, du parent matriciel de son ancien parent. Une remontée gagne une génération et peut se répéter. Arrêt devant un parent complet, une destination pleine/inactive ou une racine sans parent : aucune cinquième place, aucun déplacement forcé d'une autre branche, aucune nouvelle racine artificielle.

## Intégration

Étendre MlmPlacementService, sans seconde arborescence. Les positions réelles, non le rang historique ni le nombre de recrues personnelles, déterminent l'éligibilité. Quatre places occupées chez le parent arrêtent le dépassement, même si une place n'est pas encore validée. Une branche inactive/non validée ne remonte pas.

Réévaluer après placement et opérations administratives les membres affectés et les candidats voisins dont le parent ou la destination change de disponibilité. Une file déterministe bornée aux voisinages concernés évite de charger le réseau entier. Chaque déplacement diminue strictement la profondeur du sous-arbre, sans échange inverse automatique.

La même transaction et le verrou PostgreSQL 604008 couvrent placement, remontées, historique et agrégats. Préserver la date de validation des positions déplacées. Journaliser AUTO_ASCEND, membre, recruteur, anciens/nouveaux parents et positions, événement déclencheur, date et acteur (null signifie système).

Les compteurs/rangs sont recalculés via le moteur existant. Garder les montants, la validation administrative, les commissions déjà acquises et leur clé generation:membre:niveau. Aucune validation financière ou transfert réel ajouté.

## Données et interfaces

Prisma possède déjà les colonnes nécessaires : aucune migration ni purge. L'arbre, les listes et l'historique consomment les positions réelles et doivent refléter le résultat. Les opérations MOVE/SWAP existantes restent disponibles et protégées. Les membres déjà complets peuvent être réévalués explicitement via le même moteur, sans redémarrage destructif ni recalcul financier parallèle. Ne pas exécuter une correction distante pendant les tests.

## Validation

Tests PostgreSQL synthétiques : 3/4 contre 4/4, descendants conservés, recruteurs inchangés, remontées successives, parent complet, destination pleine/inactive, racine, membre non valide, historique, concurrence, idempotence, rollback, agrégats, commissions uniques et arbre/générations. Régression backend/frontend, compilation, validation Prisma et comparaison du schéma local.
