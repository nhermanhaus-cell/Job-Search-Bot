import Foundation

public actor APIClient {
    public var baseURL: URL

    public init(baseURL: URL = URL(string: "http://127.0.0.1:3000")!) {
        self.baseURL = baseURL
    }

    private func url(_ path: String) -> URL {
        URL(string: path, relativeTo: baseURL)!
    }

    private func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let (data, response) = try await URLSession.shared.data(from: url(path))
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try decoder().decode(T.self, from: data)
    }

    private func post(_ path: String, body: [String: String] = [:]) async throws -> Data {
        var request = URLRequest(url: url(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return data
    }

    public func mailStatus() async throws -> MailStatus {
        try await get("/api/mail/status")
    }

    public func applications() async throws -> [Application] {
        struct Box: Codable { var applications: [Application] }
        let box: Box = try await get("/api/applications")
        return box.applications
    }

    public func stats() async throws -> ApplicationStats {
        try await get("/api/applications/stats")
    }

    public func events() async throws -> [MailEvent] {
        struct Box: Codable { var events: [MailEvent] }
        let box: Box = try await get("/api/mail/events")
        return box.events
    }

    public func syncMail() async throws {
        _ = try await post("/api/mail/sync")
    }

    public func review(eventId: String, action: String) async throws {
        _ = try await post("/api/mail/events/\(eventId)/review", body: ["action": action])
    }

    public func connectGmailURL() -> URL {
        url("/api/mail/google/start")
    }
}
