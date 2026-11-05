# Sources et éléments redistribués

Références consultées le 5 novembre 2026.

| Sujet | Source officielle |
| --- | --- |
| Architecture Coroot | https://docs.coroot.com/installation/architecture/ |
| Prérequis eBPF et limites d'imbrication | https://docs.coroot.com/installation/requirements/ |
| Installation Kubernetes | https://docs.coroot.com/installation/kubernetes/ |
| Symbolisation des profils Node.js | https://docs.coroot.com/profiling/ebpf-based-profiling/ |
| Charts officiels | https://github.com/coroot/helm-charts |
| Opérateur versionné | https://github.com/coroot/coroot-operator/tree/v1.10.6 |
| Installation et prérequis Multipass | https://canonical.com/multipass/docs/stable/how-to-guides/install-multipass/ |
| Installation K3s | https://docs.k3s.io/quick-start |
| Helm | https://helm.sh/docs/intro/install/ |

Les archives des charts officiels sont conservées dans `coroot/vendor/`, sans modification. `SHA256SUMS` enregistre leurs empreintes pour contrôler l'intégrité des fichiers livrés. Ces empreintes ont été relevées depuis l'index officiel lors de la préparation. Les sources sont les releases `coroot-ce-0.3.3` et `coroot-operator-0.10.6` du dépôt des charts.

La police Comfortaa est redistribuée avec sa licence SIL Open Font License dans `app/public/assets/OFL-Comfortaa.txt`. Les projets Coroot et son opérateur utilisent la licence Apache 2.0. La copie de cette licence figure dans `coroot/vendor/LICENSE-Apache-2.0.txt`.

Les références d’images Coroot, de ses agents et de leurs stockages sont verrouillées par empreinte dans `coroot/values.yaml`. Le relevé de résolution figure dans `coroot/images.lock.json`.

Pour relever les images et versions effectivement démarrées, exécuter les commandes suivantes dans la VM et conserver le résultat avec les observations de démonstration.

```bash
sudo k3s kubectl -n coroot get pods \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{range .status.containerStatuses[*]}{.name}{" "}{.image}{" "}{.imageID}{"\n"}{end}{end}'
sudo k3s --version
sudo helm list -n coroot
```

K3s et Helm sont téléchargés à la préparation. Les paquets Ubuntu et les correctifs de l'image Ubuntu 24.04 peuvent évoluer. Les tests effectués et les limites de reproduction sont décrits dans VALIDATION.md.
