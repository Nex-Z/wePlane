#!/usr/bin/env bash
set -euo pipefail

BIN_PATH="${1:-./weplane-linux-amd64}"
if [[ ! -f "$BIN_PATH" ]]; then
  echo "Binary not found: $BIN_PATH"
  exit 1
fi

if ! id -u weplane >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin weplane
fi

if getent group systemd-journal >/dev/null; then
  usermod -aG systemd-journal weplane
fi
if getent group docker >/dev/null; then
  usermod -aG docker weplane
fi

install -d -o weplane -g weplane -m 0700 /var/lib/weplane
install -m 0755 "$BIN_PATH" /usr/local/bin/weplane

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -m 0644 "$SCRIPT_DIR/50-weplane.rules" /etc/polkit-1/rules.d/50-weplane.rules
install -m 0644 "$SCRIPT_DIR/weplane.service" /etc/systemd/system/weplane.service

systemctl daemon-reload
systemctl enable --now weplane.service

echo "wePlane installed. Initialize your admin account with:"
echo "  sudo -u weplane /usr/local/bin/weplane user add --username admin --password <your-password> --data-dir /var/lib/weplane"
