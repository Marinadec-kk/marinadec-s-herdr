#!/bin/sh
# Install Marinadec's Herdr into a Herdr home.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
home=${HERDR_APP_HOME:-"$HOME/.config/herdr-app"}
switch=1

usage() {
  cat <<'EOF'
Usage: ./install.sh [--no-switch]

Copies layouts/main-status.json and mods/spaces-status/ into the Herdr home
($HERDR_APP_HOME, else ~/.config/herdr-app). With a running Herdr window it
switches to the main-status layout; --no-switch only installs the files.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --no-switch) switch=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install.sh: unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

if [ ! -d "$home" ]; then
  echo "install.sh: Herdr home not found: $home" >&2
  echo "Start Herdr once, or set HERDR_APP_HOME to its config folder." >&2
  exit 1
fi

mkdir -p "$home/layouts" "$home/mods/spaces-status"
cp "$here/layouts/main-status.json" "$home/layouts/main-status.json"
cp "$here/layouts/main-status.png" "$home/layouts/main-status.png"
cp -R "$here/mods/spaces-status/." "$home/mods/spaces-status/"
echo "Installed into $home"

if [ "$switch" = 1 ]; then
  if command -v herdr-app >/dev/null 2>&1 && herdr-app status >/dev/null 2>&1; then
    herdr-app do layout.switch --name main-status
    echo "Switched to main-status"
  else
    echo "Herdr is not running. Start it, then run:"
    echo "  herdr-app do layout.switch --name main-status"
  fi
fi
