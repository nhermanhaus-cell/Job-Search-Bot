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
        decoder.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: value) { return date }
            let standard = ISO8601DateFormatter()
            if let date = standard.date(from: value) { return date }
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "Invalid ISO-8601 date \(value)"
            )
        }
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

    private func delete(_ path: String) async throws {
        var request = URLRequest(url: url(path))
        request.httpMethod = "DELETE"
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }

    private func jsonRequest<T: Decodable, Body: Encodable>(
        _ path: String,
        method: String,
        body: Body
    ) async throws -> T {
        var request = URLRequest(url: url(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try decoder().decode(T.self, from: data)
    }

    public func mailStatus() async throws -> MailStatus {
        try await get("/api/mail/status")
    }

    public func applications() async throws -> [Application] {
        struct Box: Codable { var applications: [Application] }
        let box: Box = try await get("/api/applications")
        return box.applications
    }

    public func updateApplication(id: String, status: String) async throws {
        struct Body: Encodable { var status: String }
        struct Box: Decodable { var application: Application }
        let _: Box = try await jsonRequest(
            "/api/applications/\(id)",
            method: "PATCH",
            body: Body(status: status)
        )
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

    public func disconnectGmail() async throws {
        try await delete("/api/mail/google")
    }

    public func profile() async throws -> Profile {
        let envelope: ProfileEnvelope = try await get("/api/profile")
        return envelope.profile
    }

    public func updateProfile(
        name: String?,
        email: String?,
        location: String?,
        maxYearsRequired: Int?,
        onboardingDone: Bool?
    ) async throws -> Profile {
        struct Body: Encodable {
            var name: String?
            var email: String?
            var location: String?
            var maxYearsRequired: Int?
            var onboardingDone: Bool?
        }
        struct ProfileStub: Decodable {
            var id: String
            var name: String?
        }
        struct Box: Decodable { var profile: ProfileStub }
        let _: Box = try await jsonRequest(
            "/api/profile",
            method: "PATCH",
            body: Body(
                name: name,
                email: email,
                location: location,
                maxYearsRequired: maxYearsRequired,
                onboardingDone: onboardingDone
            )
        )
        return try await profile()
    }

    public func uploadResumes(_ fileURLs: [URL]) async throws {
        let boundary = "JobHunt-\(UUID().uuidString)"
        var request = URLRequest(url: url("/api/profile/resumes"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var data = Data()
        for fileURL in fileURLs {
            let scoped = fileURL.startAccessingSecurityScopedResource()
            defer { if scoped { fileURL.stopAccessingSecurityScopedResource() } }
            let fileData = try Data(contentsOf: fileURL)
            data.append("--\(boundary)\r\n".data(using: .utf8)!)
            data.append(
                "Content-Disposition: form-data; name=\"files\"; filename=\"\(fileURL.lastPathComponent)\"\r\n"
                    .data(using: .utf8)!
            )
            data.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
            data.append(fileData)
            data.append("\r\n".data(using: .utf8)!)
        }
        data.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = data
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.cannotParseResponse)
        }
    }

    public func addTitle(_ title: String, pinned: Bool = true) async throws -> TitleInterest {
        struct Body: Encodable { var title: String; var pinned: Bool }
        struct Box: Decodable { var interest: TitleInterest }
        let box: Box = try await jsonRequest(
            "/api/profile/titles",
            method: "POST",
            body: Body(title: title, pinned: pinned)
        )
        return box.interest
    }

    public func setTitle(_ interest: TitleInterest, pinned: Bool) async throws {
        struct Body: Encodable { var pinned: Bool }
        struct Box: Decodable { var interest: TitleInterest }
        let _: Box = try await jsonRequest(
            "/api/profile/titles/\(interest.id)",
            method: "PATCH",
            body: Body(pinned: pinned)
        )
    }

    public func addSkill(_ name: String) async throws {
        struct Body: Encodable { var name: String }
        struct Raw: Decodable { var id: String }
        struct Box: Decodable { var skill: Raw }
        let _: Box = try await jsonRequest(
            "/api/profile/skills",
            method: "POST",
            body: Body(name: name)
        )
    }

    public func deleteSkill(id: String) async throws {
        try await delete("/api/profile/skills/\(id)")
    }

    public func updateExperience(
        id: String,
        company: String,
        title: String,
        bullets: [String]
    ) async throws {
        struct Body: Encodable {
            var company: String
            var title: String
            var bullets: [String]
        }
        struct Raw: Decodable { var id: String }
        struct Box: Decodable { var item: Raw }
        let _: Box = try await jsonRequest(
            "/api/profile/experience/\(id)",
            method: "PATCH",
            body: Body(company: company, title: title, bullets: bullets)
        )
    }

    public func addExperience(
        company: String,
        title: String,
        bullets: [String]
    ) async throws {
        struct Body: Encodable {
            var company: String
            var title: String
            var bullets: [String]
        }
        struct Raw: Decodable { var id: String }
        struct Box: Decodable { var item: Raw }
        let _: Box = try await jsonRequest(
            "/api/profile/experience",
            method: "POST",
            body: Body(company: company, title: title, bullets: bullets)
        )
    }

    public func deleteExperience(id: String) async throws {
        try await delete("/api/profile/experience/\(id)")
    }

    public func resolveConflict(id: String, value: String) async throws {
        struct Body: Encodable { var value: String }
        struct Raw: Decodable { var id: String }
        struct Box: Decodable { var conflict: Raw }
        let _: Box = try await jsonRequest(
            "/api/profile/conflicts/\(id)/resolve",
            method: "POST",
            body: Body(value: value)
        )
    }

    public func jobs(difficulty: Difficulty? = nil) async throws -> [Job] {
        struct Box: Decodable { var jobs: [Job] }
        let suffix = difficulty.map { "?difficulty=\($0.rawValue)" } ?? ""
        let box: Box = try await get("/api/jobs\(suffix)")
        return box.jobs
    }

    public func job(id: String) async throws -> JobDetail {
        struct Box: Decodable { var job: JobDetail }
        let box: Box = try await get("/api/jobs/\(id)")
        return box.job
    }

    public func sources() async throws -> [SourceInfo] {
        struct Box: Decodable { var sources: [SourceInfo] }
        let box: Box = try await get("/api/search/sources")
        return box.sources
    }

    public func startSearch(
        query: String,
        location: String?,
        sources: [String]
    ) async throws -> SearchSession {
        struct Body: Encodable {
            var query: String
            var location: String?
            var sources: [String]
        }
        struct Box: Decodable { var session: SearchSession }
        let box: Box = try await jsonRequest(
            "/api/search/sessions",
            method: "POST",
            body: Body(query: query, location: location, sources: sources)
        )
        return box.session
    }

    public func searchEvents(sessionId: String) -> AsyncThrowingStream<SearchStreamEvent, Error> {
        let eventURL = url("/api/search/sessions/\(sessionId)/events")
        let decoder = decoder()
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let (bytes, response) = try await URLSession.shared.bytes(from: eventURL)
                    guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
                        throw URLError(.badServerResponse)
                    }
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data:") else { continue }
                        let raw = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        guard let data = raw.data(using: .utf8) else { continue }
                        continuation.yield(try decoder.decode(SearchStreamEvent.self, from: data))
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func pasteJob(title: String, company: String, description: String) async throws -> Job {
        struct Body: Encodable {
            var title: String
            var company: String
            var description: String
        }
        struct Box: Decodable { var job: Job; var match: JobMatch }
        let box: Box = try await jsonRequest(
            "/api/jobs/paste",
            method: "POST",
            body: Body(title: title, company: company, description: description)
        )
        var job = box.job
        job.match = box.match
        return job
    }

    public func updateMatch(jobId: String, difficulty: Difficulty?, hidden: Bool? = nil) async throws {
        struct Body: Encodable { var difficulty: String?; var hidden: Bool? }
        struct Box: Decodable { var match: JobMatch }
        let _: Box = try await jsonRequest(
            "/api/jobs/\(jobId)/match",
            method: "PATCH",
            body: Body(difficulty: difficulty?.rawValue, hidden: hidden)
        )
    }

    public func updateSuggestion(
        jobId: String,
        suggestion: EditSuggestion,
        status: String,
        afterText: String? = nil
    ) async throws {
        struct Body: Encodable { var status: String; var afterText: String? }
        struct Box: Decodable { var suggestion: EditSuggestion }
        let _: Box = try await jsonRequest(
            "/api/jobs/\(jobId)/suggestions/\(suggestion.id)",
            method: "PATCH",
            body: Body(status: status, afterText: afterText)
        )
    }

    public func createResumeVersion(jobId: String, status: String = "draft") async throws {
        struct Body: Encodable { var status: String }
        struct Box: Decodable { var version: ResumeVersion }
        let _: Box = try await jsonRequest(
            "/api/jobs/\(jobId)/resume-versions",
            method: "POST",
            body: Body(status: status)
        )
    }

    public func trackApply(jobId: String) async throws {
        _ = try await post("/api/jobs/\(jobId)/apply")
    }

    public func packetURL(jobId: String) -> URL {
        url("/api/jobs/\(jobId)/packet")
    }

    public func jobStats() async throws -> JobStats {
        try await get("/api/stats/jobs")
    }

    public func serverSettings() async throws -> ServerSettings {
        try await get("/api/settings")
    }

    public func updateServerSettings(
        enabledSources: [String],
        mailPollMinutes: Int
    ) async throws {
        struct Body: Encodable {
            var enabledSources: [String]
            var mailPollMinutes: Int
        }
        struct Response: Decodable {
            var enabledSources: [String]
            var mailPollMinutes: Int
        }
        let _: Response = try await jsonRequest(
            "/api/settings",
            method: "PATCH",
            body: Body(enabledSources: enabledSources, mailPollMinutes: mailPollMinutes)
        )
    }

    public func setOpenAIKey(_ apiKey: String) async throws {
        struct Body: Encodable { var apiKey: String }
        struct Response: Decodable { var configured: Bool }
        let _: Response = try await jsonRequest(
            "/api/settings/openai-key",
            method: "PUT",
            body: Body(apiKey: apiKey)
        )
    }

    public func removeOpenAIKey() async throws {
        try await delete("/api/settings/openai-key")
    }
}
