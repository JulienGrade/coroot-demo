#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
VM=coroot-demo
action=${1:-status}
command -v multipass >/dev/null || { echo 'Installer Multipass, puis rouvrir le terminal.' >&2; exit 1; }
case "$action" in
  up)
    if multipass info "$VM" >/dev/null 2>&1; then
      multipass start "$VM"
      multipass exec "$VM" -- test -f /etc/coroot-demo || { echo 'VM existante sans marqueur. Choisir une VM dédiée.' >&2; exit 1; }
    else
      multipass launch 24.04 --name "$VM" --cpus 6 --memory 10G --disk 45G
      multipass exec "$VM" -- sudo touch /etc/coroot-demo
    fi
    mkdir -p .local
    tar --exclude='./.local' --exclude='./app/node_modules' --exclude='./.git' -czf .local/project.tgz .
    multipass transfer .local/project.tgz "$VM:/tmp/coroot-demo.tgz"
    multipass exec "$VM" -- mkdir -p /home/ubuntu/coroot-demo
    multipass exec "$VM" -- tar -xzf /tmp/coroot-demo.tgz -C /home/ubuntu/coroot-demo
    multipass exec "$VM" -- sudo bash /home/ubuntu/coroot-demo/scripts/bootstrap.sh
    ;;
  sql|cpu|outage|regression|reset|traffic|pause|status|logs|urls|verify)
    multipass exec "$VM" -- sudo bash /home/ubuntu/coroot-demo/scripts/control.sh "$action"
    ;;
  stop) multipass stop "$VM" ;;
  start)
    multipass start "$VM"
    echo 'La VM démarre. Attendre le retour des Pods, puis lancer status et verify.'
    ;;
  *) echo 'Actions up start stop traffic pause sql cpu outage regression reset verify status logs urls' >&2; exit 2 ;;
esac
