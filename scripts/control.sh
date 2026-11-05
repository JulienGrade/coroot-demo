#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f /etc/coroot-demo ]] || { echo 'Commande réservée à la VM de démonstration.' >&2; exit 1; }
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
k() { k3s kubectl -n parcelflow "$@"; }
[[ "$(k get namespace parcelflow -o jsonpath='{.metadata.labels.demo\.coroot\.local/owner}')" == parcelflow ]] || exit 1
set_mode() {
  local wanted=$1 observed=''
  k patch configmap faults --type=merge -p "{\"data\":{\"mode\":\"$wanted\"}}"
  # Le montage complet de ConfigMap est actualisé par le kubelet, sans subPath.
  for role in catalog payment; do
    for ((i=0; i<90; i++)); do
      observed=$(k exec "deployment/$role" -- node -e 'process.stdout.write(require("node:fs").readFileSync("/faults/mode","utf8").trim())' 2>/dev/null || true)
      [[ "$observed" == "$wanted" ]] && break
      sleep 2
    done
    [[ "$observed" == "$wanted" ]] || { echo "Mode non propagé à $role." >&2; exit 1; }
  done
}
reset() {
  k scale deployment/payment --replicas=1
  k set env deployment/payment APP_VERSION=1.0
  k rollout status deployment/payment --timeout=180s
  set_mode normal
}
action=${1:-status}
case "$action" in
  sql|cpu)
    reset
    set_mode "$action"
    ;;
  outage)
    reset
    k scale deployment/payment --replicas=0
    k wait --for=delete pod -l app=payment --timeout=120s
    ;;
  regression)
    reset
    k set env deployment/payment APP_VERSION=2.0
    k rollout status deployment/payment --timeout=180s
    ;;
  reset) reset ;;
  traffic) k scale deployment/traffic --replicas=1 ;;
  pause) k scale deployment/traffic --replicas=0 ;;
  status)
    k get deployments,pods,services
    k get configmap faults -o jsonpath='{.data.mode}'
    echo
    k3s kubectl -n coroot get pods
    ;;
  logs)
    for role in gateway catalog payment traffic; do
      echo "=== $role ==="
      k logs "deployment/$role" --tail=20 || true
    done
    ;;
  urls)
    ip=$(hostname -I | awk '{print $1}')
    echo "Application http://$ip:30081"
    echo "Coroot http://$ip:30080"
    echo 'Compte Coroot admin'
    echo 'Mot de passe Coroot'
    k3s kubectl -n coroot get secret coroot-admin -o jsonpath='{.data.password}' | base64 -d
    echo
    ;;
  verify)
    curl -fsS http://127.0.0.1:30081/api/products > /dev/null
    code=$(curl -sS -o /tmp/parcelflow-receipt.json -w '%{http_code}' -X POST http://127.0.0.1:30081/api/checkout)
    [[ "$code" == 201 ]] || { cat /tmp/parcelflow-receipt.json; echo "HTTP $code au lieu de 201" >&2; exit 1; }
    echo 'Catalogue HTTP 200 et commande HTTP 201 vérifiés.'
    ;;
  *) echo 'Actions disponibles sql cpu outage regression reset traffic pause status logs urls verify' >&2; exit 2 ;;
esac
case "$action" in
  sql|cpu|outage|regression|reset)
    mkdir -p .local
    printf '%s %s\n' "$(date -u +%FT%TZ)" "$action" >> .local/incidents.log
    echo "Action $action appliquée. Laisser le trafic actif et observer Coroot."
    ;;
esac
