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

struct Digest: Codable, Equatable {
    let generatedAt: Double
    let headline: String
    let summary: String
    let insights: [Insight]
    let upcoming: [Upcoming]?
    let sources: [SourceState]
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

    static func setUpcoming(_ id: String, status: String) async throws -> Digest? {
        guard let file, let base = URL(string: file.url) else { throw DaemonError.notRunning }
        var request = URLRequest(url: base.appendingPathComponent("upcoming/\(id)"))
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("Bearer \(file.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["status": status])
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(DigestResponse.self, from: data).digest
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
