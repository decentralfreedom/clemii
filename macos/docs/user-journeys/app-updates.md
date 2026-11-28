# App updates

## Promise

clemii checks a dedicated HTTPS update origin in the background. A tester can
also request a check from the menu-bar panel. Every downloaded update must pass
Sparkle's EdDSA verification before it can replace the installed app.

## Journey IDs

### UPDATE-01 - Background beta update

1. A tester installs clemii once.
2. clemii checks `https://updates.behu.sh/alpha/appcast.xml` automatically.
3. Sparkle downloads the matching update in the background.
4. Sparkle verifies its EdDSA signature before extraction.
5. The tester controls when clemii relaunches into the update.

### UPDATE-02 - Manual update check

1. The tester opens the clemii menu-bar panel.
2. The tester selects **Check for Updates...**.
3. The native Sparkle journey reports an available update or confirms clemii is current.

### UPDATE-03 - Download and install from Finder

1. The tester downloads the versioned, notarized DMG from the website.
2. Finder opens the reviewed layout: clemii on the left, an arrow, Applications on
   the right. The tester drags clemii into Applications and opens the installed app.
3. macOS may request first-launch approval and identify Safari as the download
   source. This is expected Gatekeeper provenance, not the app's developer name.
4. The release pipeline rejects a missing layout, background or Applications
   link, and an app version that differs from the exported release.

## Identity invariants

- `CFBundleIdentifier` remains `com.decentralfreedom.clemii` across every channel.
- `CFBundleVersion` strictly increases for every published build.
- The Sparkle EdDSA private key never enters source control or the R2 bucket.
- All archives and appcasts are served over HTTPS.
- Public packaging requires Developer ID signing, a validated staple and a
  successful Gatekeeper assessment. Local candidate preparation never submits
  to Apple unless `CLEMII_NOTARIZE=1` is explicitly set.
- Developer ID signing and Apple notarization are additive release stages. They
  must not change the app ID, appcast URL, or Sparkle public key.
- Automatic checks and downloads may run in the background, but clemii never
  forces an active dictation session to restart.

## Test mapping

| Journey | Automated coverage |
| --- | --- |
| UPDATE-01 | `scripts/tests/test_distribution.py`, exported app/DMG preflight and postflight, Sparkle archive signing |
| UPDATE-02 | `AppUpdateJourneyTests.testTesterCanRequestAnUpdateFromTheMenuBar` |
| UPDATE-03 | `InstallerLayoutChecks`, `check_dmg_layout.py` on the real DMG; Finder composition and installed-app launch reviewed manually |
