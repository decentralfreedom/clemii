import Testing
@testable import Clemii

@Suite("Settings defaults")
struct SettingsDefaultsTests {
    @Test("Fresh installs auto-detect transcription language")
    func freshLanguageIsAutomatic() {
        #expect(Settings.defaultLanguage == "auto")
        #expect(LanguageOption.popular.first?.code == Settings.defaultLanguage)
    }
}
