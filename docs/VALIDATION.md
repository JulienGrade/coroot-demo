# État de validation de cette livraison

Un essai sur macOS a confirmé le démarrage de l'installation, les neuf Pods Coroot prêts sans redémarrage, les trois adresses ClickHouse Keeper et la remontée des mesures dans l'interface. Pendant le scénario SQL, les latences affichées étaient de 977 ms pour PostgreSQL, 982 ms pour catalog et gateway, et 5 ms pour payment. Ces observations concernent la première édition déployée.

La correction du format des logs a été testée côté application. Son classement effectif dans Coroot après redéploiement reste à confirmer. Les scénarios CPU, indisponibilité et régression, leur retour nominal, ainsi que l'exécution native Windows restent à terminer sur les postes cibles.

L'environnement de réalisation dispose des outils de test applicatif, sans moteur Docker ni hyperviseur permettant d'y exécuter l'installation complète.

## Contrôles exécutés

| Contrôle | Résultat et portée |
| --- | --- |
| Parcours HTTP multi-service | Passé. Gateway, catalogue et paiement ont été démarrés et appelés réellement par HTTP. Création 201, catalogue 200, version défectueuse 503, dépendance inaccessible et séparation live/ready contrôlées. |
| Incident SQL | Passé sur PostgreSQL 18.6 embarqué WebAssembly avec le driver pg et un socket PostgreSQL. Le `pg_sleep(0.7)` exécuté par la base ralentit réellement la chaîne HTTP. |
| Suite de tests | La suite initiale de 3 tests a passé avec le moteur embarqué. Après correction des logs, 3 tests passent sans base, dont un générateur réel de trafic HTTP sur une fenêtre de 10 secondes. Le test SQL supplémentaire se déclare ignoré sans TEST_DATABASE_URL. |
| PostgreSQL 17 | Un test d'intégration et un service GitHub Actions sont fournis. L'essai macOS du scénario SQL a utilisé le PostgreSQL 17 du projet. Le workflow d'intégration reste à exécuter. |
| Navigateur Chromium | Passé. Catalogue, commande, chargement réel de Comfortaa, absence d'erreur JavaScript et écran mobile sans débordement horizontal. |
| Lanceur Bash | Syntaxe passée. Transmission des arguments Multipass et archive de transfert vérifiées avec un exécutable Multipass simulé. |
| Lanceur PowerShell | Analysé et exécuté avec PowerShell 7.5.3 sous Linux et un exécutable Multipass simulé. Les arguments `--`, les chemins et l'action sont transmis correctement. L'exécution native Windows PowerShell reste à faire. |
| Manifestes Kubernetes | 12 objets validés contre les schémas stricts Kubernetes 1.35.0, puis liens entre Services, labels, Secrets, ConfigMaps, ports et volumes revus. |
| Charts Coroot | Les deux charts officiels ont été rendus avec Helm 3.19.0. Leurs empreintes correspondent à l'index officiel. La ressource Coroot produite est conforme au schéma de l'opérateur 1.10.6. |
| Images Coroot | Les cinq index d'images verrouillés ont été récupérés dans le registre public et contiennent amd64 et arm64. Leur disponibilité a été vérifiée. L'essai macOS a également montré les composants démarrés. |
| Dépendances npm de production | Audit exécuté, aucune vulnérabilité signalée au moment du contrôle. |

Le moteur PostgreSQL embarqué confirme la logique SQL, les protocoles et les routes exécutées. Le test d'intégration isolé du workflow et la reprise du stockage restent à confirmer.

## Correction des logs après essai utilisateur

Un essai utilisateur a montré un bilan `traffic` contenant `errors: 0` classé comme erreur dans Coroot. Le format des logs a été corrigé avec les champs explicites `level` et `message`, et les compteurs ont été renommés en `failed_total` et `failed_window`. Un test de régression lance réellement le générateur contre un serveur HTTP et vérifie son bilan. Les tests HTTP contrôlent la sévérité des réussites et le détail des échecs de transport.

Le classement de ces nouveaux logs dans Coroot reste à constater après reconstruction de l'image sur la VM utilisateur.

## Recette complète à terminer

Sur un Mac compatible, puis sur Windows, suivre le README depuis une extraction neuve.

1. Lancer `up` et conserver les versions et les sorties de préparation.
2. Ouvrir les deux interfaces. Vérifier l'authentification Coroot avec le mot de passe généré.
3. Lancer `verify`, puis `traffic`.
4. Constater dans Coroot la carte de dépendances, les métriques HTTP, les logs et les mesures de ressources. Un agent prêt doit être présent pour le nœud.
5. Réaliser chaque investigation de DEMONSTRATION.md, avec `reset` et `verify` entre les cas.
6. Conserver les observations avant, pendant et après chaque incident. Noter les écrans absents et les résultats différents des critères attendus.
7. Arrêter la VM avec `stop`, la redémarrer avec `start`, puis confirmer le retour des composants avec `status` et `verify`.

La compatibilité macOS et Windows est prise en charge par l'architecture et les deux lanceurs. La qualification de bout en bout sur ces systèmes reste ouverte jusqu'à l'exécution de cette recette.
