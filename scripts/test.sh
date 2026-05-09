#!/usr/bin/env bash
# sdk's test entrypoint, invoked by .github/workflows/test.yml's
# generic "if scripts/test.sh exists, run it" branch.
#
# What it does:
#   1. Logs into Infisical (universal-auth machine identity)
#   2. Builds with NODE_ENV=$CHANNEL (default `upcoming`)
#   3. Runs the smoke suite against the matching live API channel
#
# Channel routing (server/packages/channels/channels.json):
#   main      → test.api.symbols.app    (isolated test API)
#   next      → next.api.symbols.app
#   upcoming  → upcoming.api.symbols.app
#
# The branch → channel mapping is set by the workflow before invoking
# this script via $CHANNEL. If unset, defaults to `upcoming`.
#
# Required env (passed in by the workflow):
#   - INFISICAL_CLIENT_ID
#   - INFISICAL_CLIENT_SECRET
#   - INFISICAL_PROJECT_ID
#   - INFISICAL_DOMAIN
# When any of these are missing, the script exits 0 with a notice —
# the test gate stays green so non-sdk-context CI runs (e.g. PRs that
# don't have org secrets) aren't blocked by infrastructure absence.

set -euo pipefail

CHANNEL="${CHANNEL:-${NODE_ENV:-upcoming}}"
SUITE="${SUITE:-smoke}"

if [ -z "${INFISICAL_CLIENT_ID:-}" ] || [ -z "${INFISICAL_CLIENT_SECRET:-}" ]; then
  echo "::notice::INFISICAL_CLIENT_ID/SECRET not set — sdk smoke tests need live API auth from Infisical. Skipping."
  echo "(Set on sdk repo if you want push-time smoke tests against $CHANNEL.api.symbols.app)"
  exit 0
fi

# Install Infisical CLI on demand (the test.yml workflow doesn't pre-
# install it because most repos don't need it).
if ! command -v infisical > /dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
  sudo apt-get install -y infisical
fi

echo "Logging into Infisical at $INFISICAL_DOMAIN..."
INFISICAL_TOKEN=$(infisical login \
  --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" \
  --client-secret="$INFISICAL_CLIENT_SECRET" \
  --domain="$INFISICAL_DOMAIN" \
  --plain --silent)
export INFISICAL_TOKEN

echo "Building sdk for NODE_ENV=$CHANNEL..."
NODE_ENV="$CHANNEL" bun run build

echo "Running test:$SUITE against $CHANNEL.api.symbols.app..."
NODE_ENV="$CHANNEL" bun run "test:$SUITE"
