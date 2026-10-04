import Foundation

struct Insight: Codable, Identifiable, Equatable {
    let id: String
    let source: String
    let priority: Int
    let title: String
    let detail: String
    let from: String?
    let url: String?
}

struct SourceState: Codable, Equatable {
    let source: String
    let ok: Bool
    let error: String?
    let count: Int
}

struct Digest: Codable, Equatable {
    let generatedAt: Double
    let headline: String
    let summary: String
    let insights: [Insight]
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
