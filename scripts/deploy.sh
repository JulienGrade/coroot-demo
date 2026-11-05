#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f /etc/coroot-demo ]] || { echo 'La VM dédiée est requise.' >&2; exit 1; }
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
k() { k3s kubectl -n parcelflow "$@"; }
mkdir -p .local
chmod 700 .local
umask 077
docker build -t parcelflow:1.0 ./app
docker save parcelflow:1.0 | k3s ctr images import -
k apply -f k8s/00-namespace.yaml
if ! k get secret postgres-credentials >/dev/null 2>&1; then
  openssl rand -hex 24 | tr -d '\n' > .local/database-password
  k create secret generic postgres-credentials --from-file=password=.local/database-password
  rm .local/database-password
fi
k apply -f k8s/01-faults.yaml
k apply -f k8s/02-postgres.yaml
k rollout status statefulset/postgres --timeout=240s
k apply -f k8s/03-app.yaml
for role in gateway catalog payment; do
  k rollout restart "deployment/$role"
  k rollout status "deployment/$role" --timeout=180s
done
k apply -f k8s/04-traffic.yaml

k3s kubectl create namespace coroot --dry-run=client -o yaml | k3s kubectl apply -f -
k3s kubectl label namespace coroot pod-security.kubernetes.io/enforce=privileged --overwrite
if ! k3s kubectl -n coroot get secret coroot-admin >/dev/null 2>&1; then
  openssl rand -hex 18 | tr -d '\n' > .local/coroot-password
  k3s kubectl -n coroot create secret generic coroot-admin --from-file=password=.local/coroot-password
fi
(cd coroot/vendor && sha256sum -c SHA256SUMS)
helm upgrade --install coroot-operator coroot/vendor/coroot-operator-0.10.6.tgz \
  -n coroot --wait --timeout 5m
k3s kubectl wait --for=condition=Established crd/coroots.coroot.com --timeout=120s
helm upgrade --install coroot coroot/vendor/coroot-ce-0.3.3.tgz \
  -n coroot -f coroot/values.yaml
# Helm déploie une ressource Coroot. Son statut Helm seul ne garantit pas que les Pods sont prêts.
for ((i=0; i<120; i++)); do
  if k3s kubectl -n coroot get service coroot-coroot >/dev/null 2>&1 && \
    curl -fsS http://127.0.0.1:30080/ -o /dev/null; then
    k3s kubectl -n coroot rollout status daemonset/coroot-node-agent --timeout=180s
    k3s kubectl -n coroot rollout status deployment/coroot-cluster-agent --timeout=180s
    echo 'Interface Coroot accessible et agents prêts. Valider la collecte dans le guide.'
    bash scripts/control.sh verify
    bash scripts/control.sh urls
    exit 0
  fi
  sleep 5
done
k3s kubectl -n coroot get pods -o wide
echo 'Coroot ne répond pas encore. Consulter docs/DEPANNAGE.md.' >&2
exit 1
