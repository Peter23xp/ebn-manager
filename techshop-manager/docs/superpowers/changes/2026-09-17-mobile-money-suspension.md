# Suspension temporaire des nouvelles opérations Mobile Money

Message présenté lors du choix d'un paiement mobile : « Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces. »

## Portée

- Les nouveaux paiements d'inscription, fiche, activation et vente, les remboursements mobiles, les demandes de retrait mobile et leur déclenchement sont suspendus.
- Les routes HTTP sont protégées avant l'exécution des services métier. Les anciens modes `MPESA`, `AIRTEL_MONEY`, `MOBILE_MONEY` et `KPAY` ne permettent pas de contourner le blocage via les routes ordinaires.
- Le connecteur KPay refuse également les nouvelles demandes de dépôt, retrait et remboursement. L'API renvoie HTTP 503 et le code `MOBILE_MONEY_UNAVAILABLE` avec le même message.
- L'approbation des demandes de retrait examine leur type enregistré en base, avant tout débit. Un type différent fourni dans la requête ne change pas ce contrôle.
- Les paiements en espèces et les virements non mobiles ne sont pas désactivés. Aucune opération mobile n'est transformée automatiquement en espèces.

## Transactions existantes

Les historiques, statuts, notifications de paiement KPay, finalisations des paiements déjà initiés, annulations, rejets et rapprochements des demandes déjà approuvées restent accessibles. Les transferts automatiques vers l'administrateur ne sont pas initiés pendant la suspension ; les paiements clients déjà confirmés continuent à être finalisés. Aucun transfert différé n'est créé ni rejoué automatiquement.

## Déploiement et réactivation

Déployer le backend et le frontend ensemble. Aucun changement de schéma ni migration de données n'est nécessaire. La suspension est définie dans les modules de politique Mobile Money du backend et du frontend ; elle ne dépend pas du navigateur, des clés KPay existantes ou d'une préférence utilisateur. La réactivation exige une modification explicite de ces politiques, suivie de tests des parcours financiers, avant déploiement.

Les tests couvrent les routes de création, les modes historiques, l'absence d'appel à la passerelle ou de débit lors du refus, le maintien des espèces et le suivi des transactions existantes.
