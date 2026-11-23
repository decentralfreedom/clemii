#!/usr/bin/env bash
# Renders the in-app brand icon (onboarding, the ringed icon) from the app icon, so the two are one
# drawing. The app icon itself is the Icon Composer document Clemii/Clemii/AppIcon.icon, whose layers
# the website's generator draws from the clemii mark (webapp/apps/web: bun scripts/gen-clemii-mark.ts).
#
# Usage: scripts/sync-brand-icon.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICTOOL="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}/../Applications/Icon Composer.app/Contents/Executables/ictool"
ICON="$ROOT/Clemii/Clemii/AppIcon.icon"
BRAND="$ROOT/Clemii/Clemii/Assets.xcassets/BrandIcon.imageset"
"$ICTOOL" "$ICON" --export-image --output-file "$BRAND/brand-icon.png" --platform macOS --rendition Default --width 128 --height 128 --scale 1
"$ICTOOL" "$ICON" --export-image --output-file "$BRAND/brand-icon@2x.png" --platform macOS --rendition Default --width 128 --height 128 --scale 2
echo "✓ BrandIcon.imageset (128 pt at 1x and 2x)"
