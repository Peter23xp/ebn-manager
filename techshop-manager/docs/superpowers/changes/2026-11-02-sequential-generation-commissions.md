# Commissions : déblocage séquentiel des générations

Les nouvelles tranches d'une génération attendent que toutes les générations
précédentes du même membre soient complètes : 4 positions validées pour la
génération 1, 16 pour la génération 2, puis 4 puissance n.

La génération 1 rapporte toujours progressivement. Une génération bloquée garde
ses positions, sans les comptabiliser ni figer un budget inutilisé. Lors du
recalcul qui complète la précédente, les positions présentes deviennent
comptabilisables dans la même transaction. Le rattrapage utilise la même règle.

Le contrôle utilise les compteurs validés actuels, et non le rang historique.
Si une génération précédente redevient incomplète après déplacement, les
nouvelles tranches des suivantes attendent sa nouvelle complétion.

Les commissions historiques, budgets déjà figés, plafonds comptabilisés,
portefeuilles, validations et retraits sont conservés. Aucun recalcul rétroactif
ni annulation automatique des anciennes commissions n'est exécuté. Les règles
de rang et de bonus à génération complète restent inchangées.

Les vues administratives et le portail client expliquent le déblocage
séquentiel. Le résumé serveur expose la génération bloquante via
`suspendedReason`, tout en conservant les montants historiques consultables.

Aucune migration de base n'est nécessaire.

## Vérifications

- Backend : 139 tests réussis sur le calcul progressif, les résumés, le
  rattrapage, le placement et les matrices (les suites nécessitant une base
  dédiée sont désactivées dans cette première commande).
- PostgreSQL local isolé : les 6 tests de `mlm-progressive.integration.spec.ts`
  passent, dont l'activation qui débloque la génération 2, la remontée
  automatique, la concurrence et la compatibilité des commissions anciennes.
- Frontend : 53 tests réussis sur les composants et pages de progression et
  de parrainage.
- Compilations backend et frontend réussies. Base temporaire arrêtée.
