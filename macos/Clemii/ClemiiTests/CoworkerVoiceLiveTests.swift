import FluidAudio
import Foundation
import Testing
@testable import Clemii

/// Opt-in: runs clemii's Kokoro voice from its permanent cache on this Mac.
@Suite("Coworker voice on this Mac", .serialized,
       .enabled(if: ProcessInfo.processInfo.environment["HUSH_COWORKER_LIVE"] == "1"))
struct CoworkerVoiceLiveTests {
    /// These sentences come to 48 tokens, the Alignment graph's default shape, which trapped the
    /// whole app in BNNS on the Neural Engine route (FluidAudio #1172). The first is the voice's
    /// own warm-up, so voice setup crashed every time.
    @Test("Sentences of 48 tokens synthesize", arguments: [
        CoworkerVoice.warmUpSentence,
        "Your next meeting is the design review at four.",
        "Lunch with Sam moves to three, so plan ahead.",
    ])
    func fortyEightTokens(sentence: String) async throws {
        let manager = CoworkerVoice.makeManager()
        try await manager.initialize(preloadVoices: ["af_heart"])
        let result = try await manager.synthesizeDetailed(text: sentence, voice: "af_heart")
        #expect(result.encoderTokens == 48)
        #expect(result.samples.count > 12_000)
        await manager.cleanup()
    }
}
