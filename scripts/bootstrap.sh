#!/usr/bin/env bash
# Exécuté par les lanceurs dans la VM Ubuntu dédiée.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ "$EUID" == 0 ]] || { echo 'Exécuter avec sudo.' >&2; exit 1; }
[[ -f /etc/coroot-demo ]] || { echo 'VM dédiée non identifiée.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl docker.io openssl
systemctl enable --now docker
mkdir -p .local
chmod 700 .local

if ! command -v k3s >/dev/null; then
  curl -fsSL https://get.k3s.io -o .local/install-k3s.sh
  INSTALL_K3S_VERSION='v1.35.8+k3s1' INSTALL_K3S_EXEC='server --disable traefik --disable servicelb' \
    sh .local/install-k3s.sh
fi
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
for ((i=0; i<90; i++)); do
  if k3s kubectl wait --for=condition=Ready nodes --all --timeout=5s; then break; fi
  sleep 2
done
k3s kubectl wait --for=condition=Ready nodes --all --timeout=60s
[[ -e /sys/kernel/btf/vmlinux ]] || { echo 'BTF du noyau absent. Vérifier le noyau de la VM.' >&2; exit 1; }
mountpoint -q /sys/kernel/tracing || mount -t tracefs tracefs /sys/kernel/tracing

if ! command -v helm >/dev/null; then
  case "$(uname -m)" in
    x86_64) arch=amd64 ;;
    aarch64) arch=arm64 ;;
    *) echo 'Architecture non prise en charge.' >&2; exit 1 ;;
  esac
  base="https://get.helm.sh/helm-v3.19.0-linux-$arch.tar.gz"
  curl -fsSL "$base" -o .local/helm.tar.gz
  curl -fsSL "$base.sha256sum" -o .local/helm.sha256sum
  expected=$(cut -d ' ' -f1 .local/helm.sha256sum)
  echo "$expected  .local/helm.tar.gz" | sha256sum -c -
  tar -xzf .local/helm.tar.gz -C .local
  install -m 755 ".local/linux-$arch/helm" /usr/local/bin/helm
fi
bash scripts/deploy.sh
