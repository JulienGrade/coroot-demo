# Démontrer les apports de Coroot

## Entrer dans le contexte métier

« Des clients signalent que passer une commande prend trop de temps, puis que certains paiements échouent. Quel service est concerné, quelle dépendance intervient et quel changement a déclenché la dégradation ? »

Le catalogue est lu dans PostgreSQL. La gateway appelle le catalogue puis le paiement. Le paiement simule une autorisation et renvoie un identifiant, sans transaction financière réelle.

L'observabilité réunit plusieurs signaux. Les métriques décrivent l'évolution d'un comportement, les logs donnent des événements détaillés, les traces relient les opérations d'un parcours et le profilage montre où le CPU est utilisé. Un SLO, Service Level Objective, fixe un objectif mesurable de qualité de service. La démonstration commence par comparer les mêmes requêtes avant et pendant un incident.

## Valider la collecte avant de présenter

1. Lancer `verify`. La lecture du catalogue doit répondre HTTP 200 et la commande HTTP 201.
2. Lancer `traffic`. Quatre travailleurs produisent un mélange de lectures et de commandes. Le débit résulte des réponses et du délai entre les appels. Il baisse donc lorsque le parcours ralentit.
3. Ouvrir Coroot et choisir une fenêtre temporelle récente. Attendre que le trafic alimente plusieurs cycles de collecte.
4. Retrouver les applications du namespace `parcelflow`. La carte doit permettre d'identifier gateway, catalog, payment et PostgreSQL, avec des liens alimentés par le trafic.
5. Ouvrir la gateway puis le catalogue et vérifier la présence de mesures de requêtes, de latence et de ressources. Ouvrir les logs d'un service et retrouver les lignes JSON produites par l'application.
6. Consigner l'heure, le nombre de requêtes, la latence p95 et la proportion d'erreurs. Le p95 est le seuil sous lequel se trouvent 95 % des durées observées dans la fenêtre retenue.

**Porte de validation.** Si la carte reste vide ou si les métriques applicatives sont absentes, suivre DEPANNAGE.md avant de présenter la démonstration. Des Pods Running et une interface Coroot accessible valident le déploiement de composants, tandis que cette étape établit la collecte réelle.

Les noms exacts des onglets peuvent évoluer selon la version de Coroot. Partir de la carte des services et de la fiche de chaque application. Consigner les versions réellement démarrées avec la commande fournie dans SOURCES.md.

## Comparer les méthodes

Pour chaque incident, effectuer d'abord une recherche avec `k get pods`, `k describe` et `k logs`, puis chercher les mêmes faits dans Coroot. Relever le temps nécessaire pour identifier le service responsable, le nombre de commandes utilisées et les preuves qui établissent la cause.

Dans la VM, préparer le raccourci suivant avant les commandes Kubernetes.

```bash
multipass shell coroot-demo
k() { sudo k3s kubectl -n parcelflow "$@"; }
k get pods
```

Le générateur de trafic doit rester actif. Chaque commande d'incident rétablit d'abord l'état nominal, puis applique une seule cause. Entre deux incidents, exécuter `reset`, puis `verify` et laisser se former une nouvelle référence nominale. Utiliser les commandes macOS ou Windows du README pour les actions.

## Incident SQL lent

Lancer l'action `sql`. Le catalogue exécute désormais `SELECT pg_sleep(0.7)` dans PostgreSQL avant la lecture des produits. Le fichier ConfigMap monté est actualisé par Kubernetes. Le lanceur attend que les deux services concernés aient reçu la valeur.

Le catalogue répond encore, mais ses appels SQL durent plus longtemps. Les commandes ralentissent aussi puisqu'elles commencent par un accès au catalogue. Le CPU du paiement doit rester proche de sa référence. Avec quatre travailleurs, l'application conserve une charge bornée.

Dans Coroot, examiner la latence de la gateway puis celle du catalogue et de sa dépendance PostgreSQL. Comparer une fenêtre nominale et une fenêtre d'incident. Les logs JSON du catalogue contiennent également `duration_ms`.

**Plus-value à démontrer.** Localiser la dépendance qui contribue à la lenteur et relier son temps de réponse à l'impact côté utilisateur.

L'observation du protocole PostgreSQL via eBPF peut fournir des informations sur les requêtes. Les tableaux avancés de statistiques internes de base de données nécessitent une configuration d'accès au cluster-agent. Cette configuration complémentaire est hors du parcours livré. Ne pas annoncer ces tableaux comme automatiquement disponibles.

Lancer `reset`, puis `verify`. Comparer de nouveau le même indicateur sur une fenêtre entièrement postérieure au retour nominal.

## Incident CPU

Lancer l'action `cpu`. Le paiement exécute un calcul cryptographique synchrone borné pour chaque autorisation. La limite CPU reste fixée à 500m, soit la moitié d'un cœur.

Les commandes doivent ralentir davantage que les lectures simples du catalogue. Examiner le CPU et le throttling du paiement, c'est-à-dire le bridage de son temps CPU par la limite Kubernetes, puis les durées HTTP de la gateway. Selon le poste et la charge, certains appels peuvent dépasser le délai client et compter comme des erreurs.

Ouvrir le profil CPU du paiement si les échantillons sont disponibles. Les options Node.js fournissent les symboles du programme à l'agent. Le calcul PBKDF2 passe largement par des fonctions natives de cryptographie. Un profil dominé par ces fonctions reste cohérent avec l'incident. La résolution exacte des noms dépend du runtime et de l'agent.

**Plus-value à démontrer.** Distinguer une saturation CPU d'une attente SQL à partir de signaux concordants, puis attribuer le travail au service concerné.

Lancer `reset`, puis `verify`. L'interface ne doit plus afficher la dégradation au fil de la nouvelle fenêtre.

## Incident de dépendance

Lancer l'action `outage`. Le Deployment payment passe à zéro instance. Les requêtes de commande échouent avec HTTP 503. La gateway continue de répondre à sa liveness et le catalogue reste accessible.

```bash
k get deployments
k get endpointslices -l kubernetes.io/service-name=payment -o yaml
k logs deployment/gateway --tail=20
```

Dans Coroot, rechercher l'application paiement et les erreurs d'accès qui apparaissent côté gateway. Selon le mécanisme de rejet réseau, le signal peut prendre la forme d'échecs de connexion, d'erreurs de requêtes ou de dépendance indisponible. Le résultat attendu est la corrélation temporelle avec la disparition des instances.

**Plus-value à démontrer.** Établir qu'un processus web vivant peut dépendre d'un service indisponible et identifier le périmètre métier affecté.

Lancer `reset`, puis `verify`. La suppression du défaut doit permettre de retrouver HTTP 201.

## Incident après déploiement

Lancer l'action `regression`. Le paiement reçoit `APP_VERSION=2.0`. Cela modifie le template du Deployment et crée une nouvelle révision. Le même artefact contient une branche de démonstration activée par cette version. Les Pods démarrent normalement et les sondes restent positives, mais toute autorisation de paiement répond HTTP 503.

```bash
k rollout history deployment/payment
k get pods -l app=payment
k logs deployment/payment --tail=20
```

Dans Coroot, rapprocher l'heure du déploiement de la hausse des erreurs du paiement et de la gateway. Les logs incluent `version`, `status`, `request_id` et `parent_request_id`. Ces identifiants permettent de rapprocher les logs de deux services. Ils ne constituent pas à eux seuls une trace OpenTelemetry.

**Plus-value à démontrer.** Relier une dégradation métier à une modification livrée alors que Kubernetes signale une mise en service réussie.

Lancer `reset`. Le template repasse à `APP_VERSION=1.0` et une nouvelle révision est déployée. Il s'agit d'un retour explicite à la configuration stable. Lancer `verify` et comparer les erreurs après rétablissement.

## Restitution

| Scénario | Observation client | Service ou dépendance responsable | Preuve attendue |
| --- | --- | --- | --- |
| Référence | Catalogue 200, commande 201 | Parcours sain | Mesures nominales et carte alimentée |
| SQL | Durées plus élevées | Catalogue vers PostgreSQL | Temps SQL et HTTP corrélés |
| CPU | Paiement et commandes ralentis | Paiement | CPU, bridage éventuel et profil |
| Arrêt | Commandes 503, catalogue 200 | Paiement sans instance | Instances et échecs côté gateway |
| Version 2.0 | Commandes 503, sondes positives | Version du paiement | Déploiement, erreurs et logs versionnés |

Pour chaque ligne, conserver la fenêtre temporelle, l'hypothèse, deux signaux concordants, la correction et le résultat final. Des valeurs chiffrées identiques sur tous les postes ne sont pas attendues. La relation entre cause et symptômes est l'objet de la démonstration.

L'analyse assistée par IA et les fonctionnalités dépendant d'une offre Enterprise ne sont pas nécessaires à ce parcours Community Edition. Le gain à mesurer vient de la découverte des dépendances et de la corrélation des informations accessibles dans votre installation.
