# Dépanner la démonstration

## Le lanceur ne démarre pas

Vérifier `multipass version` puis `multipass list` dans le terminal de l'hôte. Sur Windows, rouvrir PowerShell après l'installation et le redémarrage demandé par l'activation de la virtualisation. Sur macOS, l'édition actuelle de Multipass exige macOS 14 ou ultérieur. Le modèle Intel 2019 peut utiliser un système compatible, mais un ancien macOS doit être mis à niveau avant ce parcours.

Une VM nommée `coroot-demo` déjà présente doit avoir le marqueur `/etc/coroot-demo`. Le lanceur refuse de préparer une VM étrangère portant ce nom. Vérifier son usage avant toute suppression.

Après un arrêt volontaire, utiliser `start`, puis `status` et `verify`. Après un échec d'installation initiale, relancer `up`. Le script conserve le Secret PostgreSQL s'il existe, ce qui évite de désynchroniser le mot de passe et un volume déjà initialisé.

## Le téléchargement échoue

La première préparation télécharge Ubuntu, des paquets, K3s, Helm et les images des conteneurs. Un proxy, un VPN ou un filtrage d'entreprise peut bloquer les registres publics. Relever le domaine et l'erreur concernés avant de relancer. Le guide ne configure pas automatiquement votre proxy système.

## Les Pods restent Pending ou redémarrent

Entrer dans la VM depuis macOS ou Windows avec la même commande Multipass.

```bash
multipass shell coroot-demo
k() { sudo k3s kubectl -n parcelflow "$@"; }
k get pods -o wide
k get events --sort-by=.metadata.creationTimestamp
sudo k3s kubectl -n coroot get pods,pvc
sudo k3s kubectl describe nodes
```

Chercher `Insufficient memory`, un volume non lié, `ImagePullBackOff` ou `OOMKilled`. Le disque et la mémoire de la VM doivent suffire aux charges applicatives et aux composants d'observabilité. Les valeurs de ce dépôt sont des valeurs de départ à confirmer sur votre machine.

## L'interface Coroot est inaccessible

Relancer `urls` pour obtenir l'IP actuelle. Le port de Coroot est 30080, celui de ParcelFlow est 30081.

```bash
sudo k3s kubectl -n coroot get svc coroot-coroot
curl -I http://127.0.0.1:30080/
```

Si l'accès fonctionne dans la VM et échoue depuis l'hôte, vérifier le réseau Multipass, le pare-feu et les interfaces VPN. Les ports NodePort sont accessibles sur les interfaces de la VM. Conserver ce réseau dans le périmètre local de démonstration. Coroot utilise le compte généré. ParcelFlow utilise des données fictives.

## Coroot est ouvert mais la carte reste vide

Lancer `traffic`, puis vérifier le générateur et l'agent.

```bash
k logs deployment/traffic --tail=10
sudo k3s kubectl -n coroot get daemonsets
sudo k3s kubectl -n coroot rollout status daemonset/coroot-node-agent --timeout=120s
sudo k3s kubectl -n coroot logs daemonset/coroot-node-agent --tail=80
sudo k3s kubectl -n coroot logs deployment/coroot-operator --tail=80
uname -r
ls -l /sys/kernel/btf/vmlinux
mount | grep tracefs
```

Le nombre d'agents prêts doit correspondre au nombre de nœuds. Chercher les erreurs de chargement eBPF, de permissions, de résolution de service ou d'envoi de télémétrie. Vérifier la fenêtre temporelle et le projet sélectionnés dans Coroot.

Si une fonctionnalité reste vide, conserver cette observation comme un échec de recette à investiguer. Les observations décrites dans DEMONSTRATION.md sont des critères à constater sur le poste.

## Le scénario semble ne rien changer

Le lanceur attend la propagation du fichier ConfigMap. Vérifier le mode et le trafic. Les commandes restent dans la VM.

```bash
k get configmap faults -o yaml
k exec deployment/catalog -- cat /faults/mode
k exec deployment/payment -- cat /faults/mode
k get deployment traffic
k logs deployment/traffic --tail=10
```

La modification de ConfigMap se propage avec un délai. Les scénarios CPU et SQL sont activés par lecture du fichier à chaque requête. Le scénario de régression provoque une nouvelle révision du Deployment payment. La fenêtre du tableau de bord doit inclure le début de la panne et une référence antérieure.

## Après les incidents

Lancer `reset`, puis `verify`. `pause` coupe seulement le trafic synthétique. `stop` arrête la VM en conservant ses données. Pour une suppression ciblée et définitive, utiliser `multipass delete --purge coroot-demo` depuis l'hôte.

## Une ligne de bilan est classée comme une erreur

La première édition écrivait un champ `errors` dans les bilans de trafic, sans niveau de sévérité ni message explicites. Un bilan contenant `errors: 0` pouvait être classé comme erreur par l'analyse des logs. L'édition corrigée écrit `level: info`, `message: traffic_summary`, `failed_total` et `failed_window`. Les logs HTTP incluent aussi un niveau et un message stables. Les échecs de transport incluent désormais `cause_code` et `cause_message`.

Pour appliquer cette correction, extraire la nouvelle archive dans un dossier local, puis lancer `up`, `verify` et `traffic` avec le lanceur habituel. `up` reconstruit et réimporte l'image, renouvelle les services et remet les scénarios au nominal. La VM et les données Coroot sont conservées. L'ancien trafic est arrêté lors de l'application des manifestes, puis relancé avec `traffic`.

Sélectionner ensuite dans Coroot une période entièrement postérieure à la mise à jour. Les anciennes lignes déjà collectées conservent leur classification dans l'historique.

Un message `request_failed` avec `fetch failed` correspond à un appel réseau qui a échoué. Une occurrence isolée peut provenir d'une transition de déploiement ou d'un incident, mais sa cause doit être établie à partir du contexte et des champs diagnostiques. Si le défaut revient en régime nominal, relever les nouveaux logs, l'état des Pods et les EndpointSlices des services catalog et payment.
