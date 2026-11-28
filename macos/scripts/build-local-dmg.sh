#!/usr/bin/env bash
# Explicit local development path; output cannot enter the public publisher.
set -euo pipefail
# shellcheck source=former-names.sh
source "$(dirname "${BASH_SOURCE[0]}")/former-names.sh"
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DERIVED_DATA_DIRECTORY="${CLEMII_DERIVED_DATA_PATH:-/tmp/hush-local-release}"
cd "${SCRIPT_DIRECTORY}/.."
xcodebuild -project Clemii/Clemii.xcodeproj -scheme Clemii -configuration Release \
  -destination 'generic/platform=macOS' -derivedDataPath "${DERIVED_DATA_DIRECTORY}" \
  -onlyUsePackageVersionsFromResolvedFile -skipPackagePluginValidation -skipMacroValidation \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=NO \
  CLEMII_PROOF_SERVICE_URL="${CLEMII_PROOF_SERVICE_URL:-http://127.0.0.1:3000}" \
  CLEMII_PROOF_SHORT_URL="${CLEMII_PROOF_SHORT_URL:-http://127.0.0.1:3000/s/}" \
  CLEMII_UPDATE_FEED_URL="${CLEMII_UPDATE_FEED_URL:-http://127.0.0.1:8088/alpha/appcast.xml}" \
  CLEMII_RELEASE_CHANNEL='Local Development' CLEMII_RELEASE_SLUG=alpha.1-local build
ARGS=(--local --app "${DERIVED_DATA_DIRECTORY}/Build/Products/Release/clemii.app")
[[ $# == 0 ]] || ARGS+=(--output "$1")
"${SCRIPT_DIRECTORY}/release-dmg.sh" "${ARGS[@]}"
