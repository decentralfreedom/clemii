import Foundation
import Testing
@testable import Clemii

@Suite("Coworker meeting dates")
struct CoworkerMeetingDatesTests {
    private let zone = TimeZone(identifier: "America/Asuncion")!
    /// Sunday, 1 November 2026, 09:00 in Asunción.
    private let now = ISO8601DateFormatter().date(from: "2026-11-01T09:00:00-03:00")!

    private func reply(start: String, action: CoworkerReply.Action = .meeting) -> CoworkerReply {
        CoworkerReply(message: "I will prepare a calendar draft.", action: action, content: "Design review with Clara",
                      target: 0, start: start, minutes: 30)
    }
    private func request(_ text: String) -> CoworkerRequest {
        CoworkerRequest(text: text, observation: CoworkerObservation(application: "Mail", window: "Clara", selectedText: "",
            visibleText: "", elements: [], editable: false, limitation: nil), history: [], now: now, timeZone: zone)
    }

    @Test("The named weekday wins over the model's neighbouring day, at the model's time")
    func weekday() {
        let resolved = CoworkerMeetingDates.resolve(reply(start: "2026-11-06T15:30:00-03:00"),
            for: request("Please schedule the design review with Clara for Thursday at 3 30."))
        #expect(resolved.start == "2026-11-05T15:30:00-03:00")
        #expect(resolved.minutes == 30)
    }

    @Test("Today, tomorrow and German day names", arguments: [
        ("Lunch today at noon", "2026-11-01"), ("Call tomorrow at ten", "2026-11-02"),
        ("Termin am Donnerstag um 15 Uhr", "2026-11-05"), ("Treffen morgen um 9", "2026-11-02"),
        ("Kurzes Meeting heute Morgen", "2026-11-01"),
    ])
    func days(text: String, day: String) {
        let resolved = CoworkerMeetingDates.resolve(reply(start: "2026-11-09T10:00:00-03:00"), for: request(text))
        #expect(resolved.start == "\(day)T10:00:00-03:00")
    }

    @Test("Unclear days stay the model's", arguments: [
        "Meet next Thursday at 3", "Monday or Tuesday at 3", "Sunday at 5", "Review it at 3", "Am nächsten Freitag um 3",
    ])
    func unclear(text: String) {
        let model = reply(start: "2026-11-09T15:00:00-03:00")
        #expect(CoworkerMeetingDates.resolve(model, for: request(text)) == model)
    }

    @Test("Only meetings are moved")
    func otherActions() {
        let answer = reply(start: "", action: .answer)
        #expect(CoworkerMeetingDates.resolve(answer, for: request("Thursday at 3")) == answer)
    }
}
