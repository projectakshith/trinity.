import Foundation

struct Insight: Codable, Identifiable, Equatable {
    let id: String
    let source: String
    let priority: Int
    let title: String
    let detail: String
    let from: String?
    let chat: String?
    let group: Bool?
    let url: String?
}

struct SourceState: Codable, Equatable {
    let source: String
    let ok: Bool
    let error: String?
    let count: Int
}

struct Upcoming: Codable, Identifiable, Equatable {
    let id: String
    let what: String
    let when: String
    let whenText: String
    let who: String?
    let chat: String?
    let source: String
    let status: String?

    var date: Date? {
        let parts = when.split(whereSeparator: { "-T: ".contains($0) }).compactMap { Int($0) }
        guard parts.count >= 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: parts.count > 3 ? parts[3] : 0, minute: parts.count > 4 ? parts[4] : 0))
    }

    var timed: Bool { when.count > 10 }

    var label: String {
        guard let date else { return whenText.isEmpty ? "Soon" : whenText }
        let cal = Calendar.current
        let day: String
        if cal.isDateInToday(date) { day = "Today" }
        else if cal.isDateInTomorrow(date) { day = "Tomorrow" }
        else { day = date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)) }
        return timed ? "\(day) · \(date.formatted(date: .omitted, time: .shortened))" : day
    }
}

struct Nudge: Codable, Equatable {
    let at: String
    let text: String
}

struct Plan: Codable, Equatable {
    let date: String
    let focus: [String]
    let nudges: [Nudge]
    let checkinAt: String
    let checkin: String
    let lines: [String]
    let done: [Bool]?

    func time(_ hhmm: String, on day: Date = Date()) -> Date? {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day)
    }
}

struct Digest: Codable, Equatable {
    let generatedAt: Double
    let headline: String
    let summary: String
    let insights: [Insight]
    let upcoming: [Upcoming]?
    let sources: [SourceState]
    let plan: Plan?
}

private struct AskResponse: Codable {
    let reply: String?
    let digest: Digest?
    let error: String?
}

private struct DigestResponse: Codable {
    let digest: Digest?
    let error: String?
}

private struct DaemonFile: Codable {
    let url: String
    let token: String
}

enum DaemonError: LocalizedError {
    case notRunning
    case message(String)

    var errorDescription: String? {
        switch self {
        case .notRunning: return "trinityd isn't running. Start it with: cd trinity/daemon && bun start"
        case .message(let text): return text
        }
    }
}

struct Daemon {
    private static var file: DaemonFile? {
        let path = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".trinity/daemon.json")
        guard let data = try? Data(contentsOf: path) else { return nil }
        return try? JSONDecoder().decode(DaemonFile.self, from: data)
    }

    private static func post(_ path: String, _ body: [String: Any], timeout: TimeInterval = 10) async throws -> Data {
        guard let file, let base = URL(string: file.url) else { throw DaemonError.notRunning }
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("Bearer \(file.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        do {
            return try await URLSession.shared.data(for: request).0
        } catch {
            throw DaemonError.notRunning
        }
    }

    static func setUpcoming(_ id: String, status: String) async throws -> Digest? {
        try JSONDecoder().decode(DigestResponse.self, from: await post("upcoming/\(id)", ["status": status])).digest
    }

    static func ask(_ message: String, laptop: String) async throws -> (String, Digest?) {
        let response = try JSONDecoder().decode(AskResponse.self, from: await post("ask", ["message": message, "laptop": laptop], timeout: 90))
        guard let reply = response.reply else { throw DaemonError.message(response.error ?? "No answer") }
        return (reply, response.digest)
    }

    static func replan() async throws -> Digest? {
        try JSONDecoder().decode(DigestResponse.self, from: await post("plan", [:], timeout: 90)).digest
    }

    static func checkin(_ done: [Bool]) async throws -> Digest? {
        try JSONDecoder().decode(DigestResponse.self, from: await post("plan/checkin", ["done": done])).digest
    }

    static func digest(refresh: Bool = false) async throws -> Digest {
        guard let file, let base = URL(string: file.url) else { throw DaemonError.notRunning }
        var request = URLRequest(url: base.appendingPathComponent(refresh ? "refresh" : "digest"))
        request.httpMethod = refresh ? "POST" : "GET"
        request.timeoutInterval = refresh ? 120 : 10
        request.setValue("Bearer \(file.token)", forHTTPHeaderField: "Authorization")
        let data: Data
        do {
            (data, _) = try await URLSession.shared.data(for: request)
        } catch {
            throw DaemonError.notRunning
        }
        let response = try JSONDecoder().decode(DigestResponse.self, from: data)
        if let digest = response.digest { return digest }
        throw DaemonError.message(response.error ?? "No digest yet")
    }
}
