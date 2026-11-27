import AppKit
import Sparkle

/// Owns clemii's native macOS update lifecycle.
///
/// Sparkle validates every archive with the public EdDSA key embedded in the
/// app. Apple code signing and notarization remain release-pipeline concerns,
/// so enabling notarization later does not change this runtime integration.
@MainActor
final class ClemiiUpdateManager {
    private let updaterController: SPUStandardUpdaterController

    init() {
        #if DEBUG
        let startsUpdater = false
        #else
        let startsUpdater = true
        #endif
        updaterController = SPUStandardUpdaterController(
            startingUpdater: startsUpdater,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
    }

    func checkForUpdates() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--update-ui-test") {
            let alert = NSAlert()
            alert.messageText = "clemii updates are ready"
            alert.informativeText = "Release builds check updates.clemii.com and verify every update before installation."
            alert.addButton(withTitle: "OK")
            alert.runModal()
            return
        }
        #endif
        updaterController.checkForUpdates(nil)
    }
}
