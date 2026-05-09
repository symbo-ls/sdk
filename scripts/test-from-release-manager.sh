#!/usr/bin/env bash
# Triggered by release-manager's downstream-deploy dispatch after it
# tags vX.Y.Z. Runs sdk's smoke + integration tests against the
# tag — same surface as push-tests.yaml + pull-test-workflow.yaml,
# but pinned to the released version.
#
# Inputs:
#   VERSION       — the release tag (e.g. "3.14.6")
#   SOURCE_REPO   — the consumer repo whose push triggered the release
#   NODE_ENV      — channel to test against (defaults to `test` —
#                   isolated test API, never mutates prod)

set -euo pipefail

VERSION="${VERSION:-unknown}"
SOURCE_REPO="${SOURCE_REPO:-release-manager}"
NODE_ENV="${NODE_ENV:-test}"
export NODE_ENV

echo "[test-from-release-manager] sdk @ v${VERSION} → ${NODE_ENV} (triggered by ${SOURCE_REPO})"

# Build first so the test suite can resolve dist/ paths.
echo "::group::Build sdk"
npm run build --if-present 2>&1 | tail -30
echo "::endgroup::"

# Unit tests + smoke / integration tests. push-tests.yaml runs both.
echo "::group::Unit tests"
npm test --if-present 2>&1 | tail -50
echo "::endgroup::"

if [ -d "integration-tests" ]; then
  echo "::group::Integration tests against ${NODE_ENV}"
  if [ -f "integration-tests/package.json" ] && grep -q '"test"' integration-tests/package.json; then
    ( cd integration-tests && npm test ) 2>&1 | tail -100
  else
    echo "::notice::integration-tests/ exists but no test script — skipping"
  fi
  echo "::endgroup::"
fi

echo "[test-from-release-manager] sdk tests passed at v${VERSION}"
