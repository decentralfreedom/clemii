import Foundation

/// Puts a meeting on the day the person named. The model receives `upcoming_dates` and still
/// picks a neighbouring day at times ("Thursday" became Friday); the calendar is exact, so when
/// the request names one day, the draft keeps the model's time and takes the calendar's date.
enum CoworkerMeetingDates {
    private static let weekdays: [String: Int] = [
        "sunday": 1, "monday": 2, "tuesday": 3, "wednesday": 4, "thursday": 5, "friday": 6, "saturday": 7,
        "sonntag": 1, "montag": 2, "dienstag": 3, "mittwoch": 4, "donnerstag": 5, "freitag": 6,
        "samstag": 7, "sonnabend": 7,
    ]
    /// Words that move the day somewhere the calendar alone cannot settle.
    private static let qualifiers: Set<String> = [
        "next", "following", "after", "nächste", "nächsten", "nächster", "übernächste", "übernächsten", "übermorgen",
    ]

    static func resolve(_ reply: CoworkerReply, for request: CoworkerRequest) -> CoworkerReply {
        guard reply.action == .meeting,
              let day = namedDay(in: request.text, now: request.now, timeZone: request.timeZone),
              let start = ISO8601DateFormatter().date(from: reply.start) else { return reply }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = request.timeZone
        let time = calendar.dateComponents([.hour, .minute, .second], from: start)
        var target = calendar.dateComponents([.year, .month, .day], from: day)
        target.hour = time.hour; target.minute = time.minute; target.second = time.second
        guard let moved = calendar.date(from: target), moved != start else { return reply }
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = request.timeZone
        return CoworkerReply(message: reply.message, action: reply.action, content: reply.content, target: reply.target,
                             start: formatter.string(from: moved), minutes: reply.minutes,
                             subject: reply.subject, more: reply.more)
    }

    /// The one day the text names, as `upcoming_dates` lists it: today, tomorrow, or a weekday
    /// within the next six days. Nil when it names none, several, qualifies one, or names
    /// today's weekday, which may mean today or a week on.
    static func namedDay(in text: String, now: Date, timeZone: TimeZone) -> Date? {
        let words = text.lowercased().split { !$0.isLetter }.map(String.init)
        guard !words.contains(where: qualifiers.contains) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        var offsets = Set<Int>()
        for (index, word) in words.enumerated() {
            switch word {
            case "today", "heute": offsets.insert(0)
            case "tomorrow": offsets.insert(1)
            // German "morgen" is tomorrow, except in "heute Morgen", this morning.
            case "morgen" where index == 0 || words[index - 1] != "heute": offsets.insert(1)
            default:
                guard let weekday = weekdays[word] else { continue }
                let today = calendar.component(.weekday, from: now)
                // Today's own weekday may mean today or a week on: leave that to the model.
                guard weekday != today else { return nil }
                offsets.insert((weekday - today + 7) % 7)
            }
        }
        guard offsets.count == 1, let offset = offsets.first else { return nil }
        return calendar.date(byAdding: .day, value: offset, to: now)
    }
}
