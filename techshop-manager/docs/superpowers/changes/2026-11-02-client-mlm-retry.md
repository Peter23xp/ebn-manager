# Relancer l'intégration MLM d'un client actif

L'activation commerciale est enregistrée avant l'intégration MLM. Une erreur
entre ces opérations peut laisser un client ACTIF sans membre. La reprise
automatique existante masque ses erreurs dans les journaux.

La fiche client propose désormais « Relancer le MLM » près de « MLM non activé »
pour un client ACTIF sans membre, à partir du rôle CAISSIER et dans le périmètre
de site autorisé. Le bouton affiche l'attente, empêche les doubles clics et
présente l'erreur si la création n'est pas confirmée.

`POST /clients/:id/mlm/retry` reprend uniquement l'intégration MLM existante,
avec le recruteur enregistré et l'identifiant de l'opérateur. Les relances
concurrentes utilisent le verrou transactionnel MLM. Un membre déjà présent
est conservé. La vente, le stock, la date d'activation, le code parrain et les
identifiants du portail ne sont pas recréés.

Après succès, la fiche et les caches du réseau sont actualisés. Une réponse
reçue après la déconnexion ne réintroduit pas de données privées dans le cache.

Vérifications : 422 tests backend réussis, dont un test PostgreSQL isolé de
relances concurrentes et de conservation de la vente ; 107 tests frontend
réussis. La suite de navigation a nécessité des délais d'attente élargis dans
une configuration locale temporaire, sans modifier ses assertions ni la
configuration versionnée. Le parcours a été vérifié dans Edge à 320, 390 et
1440 pixels avec des données synthétiques. La base de test a été arrêtée.

Aucune donnée de production n'a été modifiée et aucune migration n'est requise.
