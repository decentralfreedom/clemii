import Foundation
import Testing
@testable import Clemii

@Suite("Preferences from the app's former identity")
struct FormerIdentityTests {
    private func emptyDefaults() -> UserDefaults {
        let suite = "hush.tests.former-identity.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    @Test("The first launch under the new identifier adopts the former preferences")
    func adoptsFormerPreferences() {
        let defaults = emptyDefaults()
        FormerIdentity.adoptPreferences(into: defaults, from: ["postprocess.llmProvider": "off", "hud.position": 2])
        #expect(defaults.string(forKey: "postprocess.llmProvider") == "off")
        #expect(defaults.integer(forKey: "hud.position") == 2)
    }

    @Test("A preference already set under the new identifier wins")
    func keepsWhatIsAlreadySet() {
        let defaults = emptyDefaults()
        defaults.set("chatgpt", forKey: "postprocess.llmProvider")
        FormerIdentity.adoptPreferences(into: defaults, from: ["postprocess.llmProvider": "off"])
        #expect(defaults.string(forKey: "postprocess.llmProvider") == "chatgpt")
    }

    @Test("Adoption happens once, so a preference removed later stays removed")
    func adoptsOnlyOnce() {
        let defaults = emptyDefaults()
        FormerIdentity.adoptPreferences(into: defaults, from: ["hud.position": 2])
        defaults.removeObject(forKey: "hud.position")
        FormerIdentity.adoptPreferences(into: defaults, from: ["hud.position": 2])
        #expect(defaults.object(forKey: "hud.position") == nil)
    }

    @Test("The former identifier is the one hush shipped with")
    func formerIdentifier() {
        #expect(FormerIdentity.bundleIdentifier == "com.decentralfreedom." + "hush")
    }
}
