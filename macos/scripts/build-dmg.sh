#!/usr/bin/env bash
# Developer ID distribution. Use build-local-dmg.sh for local development.
set -euo pipefail
# shellcheck source=former-names.sh
source "$(dirname "${BASH_SOURCE[0]}")/former-names.sh"

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_DIRECTORY="$(cd "${SCRIPT_DIRECTORY}/.." && pwd)"
DERIVED_DATA_DIRECTORY="${CLEMII_DERIVED_DATA_PATH:-/tmp/hush-release}"
RELEASE_DIRECTORY="${CLEMII_RELEASE_DIRECTORY:-${REPOSITORY_DIRECTORY}/artifacts/release}"
TEAM="${CLEMII_DEVELOPMENT_TEAM:-3A22UK7C9L}"
APP_PATH="${RELEASE_DIRECTORY}/export/clemii.app"
export CLEMII_DEVELOPMENT_TEAM="${TEAM}"
# The notarytool Keychain profile on the release Mac: a stored credential, so it keeps its name (docs/reference/former-name.md).
export CLEMII_NOTARY_KEYCHAIN_PROFILE="${CLEMII_NOTARY_KEYCHAIN_PROFILE:-HushNotary}"

if [[ $# -gt 1 || ! "${CLEMII_NOTARIZE:-0}" =~ ^[01]$ ]]; then
  echo "Usage: $0 [output.dmg]. Submission requires explicit CLEMII_NOTARIZE=1." >&2
  exit 1
fi
if [[ -e "${RELEASE_DIRECTORY}/Clemii.xcarchive" || -e "${RELEASE_DIRECTORY}/export" ]]; then
  echo "Release output already exists. Resume notarization or choose a new CLEMII_RELEASE_DIRECTORY." >&2
  exit 1
fi
mkdir -p "${RELEASE_DIRECTORY}/reports"
cd "${REPOSITORY_DIRECTORY}"
git rev-parse HEAD > "${RELEASE_DIRECTORY}/reports/source-revision.txt"
git diff --binary HEAD > "${RELEASE_DIRECTORY}/reports/source-changes.patch"
xcodebuild -version > "${RELEASE_DIRECTORY}/reports/xcode-version.txt"
cp Clemii/Clemii.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved \
  "${RELEASE_DIRECTORY}/reports/Package.resolved"
cp "${SCRIPT_DIRECTORY}/DeveloperID-ExportOptions.plist" "${RELEASE_DIRECTORY}/ExportOptions.plist"
/usr/libexec/PlistBuddy -c "Set :teamID ${TEAM}" "${RELEASE_DIRECTORY}/ExportOptions.plist"

RELEASE_ARGUMENTS=()
[[ -z "${CLEMII_RELEASE_CHANNEL:-}" ]] || RELEASE_ARGUMENTS+=(CLEMII_RELEASE_CHANNEL="${CLEMII_RELEASE_CHANNEL}")
[[ -z "${CLEMII_RELEASE_SLUG:-}" ]] || RELEASE_ARGUMENTS+=(CLEMII_RELEASE_SLUG="${CLEMII_RELEASE_SLUG}")
# Explicit trust in reviewed pinned packages, never global Xcode defaults.
TRUST_ARGUMENTS=()
if [[ "${CLEMII_TRUST_PINNED_BUILD_TOOLS:-0}" == "1" ]]; then
  TRUST_ARGUMENTS+=(-skipMacroValidation -skipPackagePluginValidation)
fi

xcodebuild -project Clemii/Clemii.xcodeproj -scheme Clemii -configuration Release \
  -destination 'generic/platform=macOS' -derivedDataPath "${DERIVED_DATA_DIRECTORY}" \
  -onlyUsePackageVersionsFromResolvedFile ${TRUST_ARGUMENTS[@]+"${TRUST_ARGUMENTS[@]}"} \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="${TEAM}" CODE_SIGN_ENTITLEMENTS=Clemii/Clemii-Team.entitlements \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=NO \
  CLEMII_PROOF_SERVICE_URL="${CLEMII_PROOF_SERVICE_URL:-https://clemii.com}" \
  CLEMII_PROOF_SHORT_URL="${CLEMII_PROOF_SHORT_URL:-https://clemii.com/s/}" \
  CLEMII_UPDATE_FEED_URL="${CLEMII_UPDATE_FEED_URL:-https://updates.clemii.com/alpha/appcast.xml}" \
  ${RELEASE_ARGUMENTS[@]+"${RELEASE_ARGUMENTS[@]}"} archive -archivePath "${RELEASE_DIRECTORY}/Clemii.xcarchive" \
  2>&1 | tee "${RELEASE_DIRECTORY}/reports/archive.log"

# Xcode's direct-distribution export: automatic signing picks the Developer ID certificate
# and creates or renews the Developer ID provisioning profile the keychain group needs.
xcodebuild -exportArchive -allowProvisioningUpdates -archivePath "${RELEASE_DIRECTORY}/Clemii.xcarchive" \
  -exportOptionsPlist "${RELEASE_DIRECTORY}/ExportOptions.plist" \
  -exportPath "${RELEASE_DIRECTORY}/export" \
  2>&1 | tee "${RELEASE_DIRECTORY}/reports/export.log"
python3 "${SCRIPT_DIRECTORY}/check_assistant_release.py" "${APP_PATH}/Contents/MacOS/clemii"
python3 "${SCRIPT_DIRECTORY}/check_distribution.py" "${APP_PATH}" \
  --report "${RELEASE_DIRECTORY}/reports/app-preflight.json"
# Submit the outermost distribution container once; Apple also checks its app.
DMG_ARGUMENTS=(--app "${APP_PATH}")
[[ $# == 0 ]] || DMG_ARGUMENTS+=(--output "$1")
"${SCRIPT_DIRECTORY}/release-dmg.sh" "${DMG_ARGUMENTS[@]}"
if [[ "${CLEMII_NOTARIZE:-0}" == "0" ]]; then
  echo "Local candidate prepared. Nothing submitted to Apple or published."
fi
