import Foundation

private enum HTTP {
    static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = 5
        config.timeoutIntervalForResource = 8
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()
}

public actor APIClient {
    public var baseURL: URL
    private let sessionStore: KeychainSessionStore

    public init(
        baseURL: URL = APIClient.defaultBaseURL,
        sessionStore: KeychainSessionStore = .shared
    ) {
        self.baseURL = baseURL
        self.sessionStore = sessionStore
    }

    public static var defaultBaseURL: URL {
        #if DEBUG
        URL(string: "http://localhost:3000")!
        #else
        URL(string: "https://job-hunt-os.fly.dev")!
        #endif
    }

    private func url(_ path: String) -> URL {
        URL(string: path, relativeTo: baseURL)!
    }

    private nonisolated func decoder() -> JSONDecoder {
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

    private func authorizedRequest(
        _ path: String,
        method: String = "GET",
        body: Data? = nil,
        contentType: String? = nil
    ) async throws -> URLRequest {
        guard let session = try await sessionStore.load() else { throw AuthError.unauthenticated }
        var request = URLRequest(url: url(path), timeoutInterval: 5)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        return request
    }

    private func perform(_ request: URLRequest, retryOnUnauthorized: Bool = true) async throws -> Data {
        let (data, response) = try await HTTP.session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AuthError.invalidResponse }
        if http.statusCode == 401, retryOnUnauthorized {
            let session = try await refreshSession()
            var retried = request
            retried.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            return try await perform(retried, retryOnUnauthorized: false)
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
            throw AuthError.server(message ?? "Request failed (\(http.statusCode)).")
        }
        return data
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let data = try await perform(try await authorizedRequest(path))
        return try decoder().decode(T.self, from: data)
    }

    private func post(_ path: String, body: [String: String] = [:]) async throws -> Data {
        try await perform(
            try await authorizedRequest(
                path,
                method: "POST",
                body: try JSONEncoder().encode(body),
                contentType: "application/json"
            )
        )
    }

    private func delete(_ path: String) async throws {
        _ = try await perform(try await authorizedRequest(path, method: "DELETE"))
    }

    private func jsonRequest<T: Decodable, Body: Encodable>(
        _ path: String,
        method: String,
        body: Body
    ) async throws -> T {
        let request = try await authorizedRequest(
            path,
            method: method,
            body: try JSONEncoder().encode(body),
            contentType: "application/json"
        )
        let data = try await perform(request)
        return try decoder().decode(T.self, from: data)
    }

    private func publicJSONRequest<T: Decodable, Body: Encodable>(
        _ path: String,
        method: String = "POST",
        body: Body
    ) async throws -> T {
        var request = URLRequest(url: url(path), timeoutInterval: 5)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await HTTP.session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AuthError.invalidResponse }
        if http.statusCode == 404 { throw AuthError.accountNotFound }
        guard (200 ..< 300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
            throw AuthError.server(message ?? "Authentication failed.")
        }
        return try decoder().decode(T.self, from: data)
    }

    public func authChallenge(provider: AuthProvider, intent: AuthIntent) async throws -> AuthChallenge {
        struct Body: Encodable { var provider: String; var intent: String }
        if intent == .link {
            struct Box: Decodable {
                var challengeId: String
                var nonce: String
                var expiresAt: Date
            }
            let box: Box = try await jsonRequest(
                "/api/auth/challenge",
                method: "POST",
                body: Body(provider: provider.rawValue, intent: intent.rawValue)
            )
            return AuthChallenge(
                challengeId: box.challengeId,
                nonce: box.nonce,
                expiresAt: box.expiresAt
            )
        }
        return try await publicJSONRequest(
            "/api/auth/challenge",
            body: Body(provider: provider.rawValue, intent: intent.rawValue)
        )
    }

    public func exchangeIdentity(
        provider: AuthProvider,
        challengeId: String,
        identityToken: String,
        authorizationCode: String?,
        fullName: String?
    ) async throws -> AuthSession {
        struct Body: Encodable {
            var challengeId: String
            var identityToken: String
            var authorizationCode: String?
            var fullName: String?
        }
        let envelope: AuthSessionEnvelope = try await publicJSONRequest(
            "/api/auth/exchange/\(provider.rawValue)",
            body: Body(
                challengeId: challengeId,
                identityToken: identityToken,
                authorizationCode: authorizationCode,
                fullName: fullName
            )
        )
        try await sessionStore.save(envelope.session)
        return envelope.session
    }

    public func storedSession() async throws -> AuthSession? {
        try await sessionStore.load()
    }

    public func validateStoredSession() async throws -> AuthSession {
        guard var session = try await sessionStore.load() else { throw AuthError.unauthenticated }
        if session.accessExpiresAt <= Date().addingTimeInterval(30) {
            session = try await refreshSession()
        }
        struct Status: Decodable {
            var user: AuthUser
            var onboardingDone: Bool
        }
        let data = try await perform(try await authorizedRequest("/api/auth/session"))
        let status = try decoder().decode(Status.self, from: data)
        session.user = status.user
        session.onboardingDone = status.onboardingDone
        try await sessionStore.save(session)
        return session
    }

    private func refreshSession() async throws -> AuthSession {
        guard let current = try await sessionStore.load() else { throw AuthError.unauthenticated }
        struct Body: Encodable { var refreshToken: String }
        do {
            let envelope: AuthSessionEnvelope = try await publicJSONRequest(
                "/api/auth/refresh",
                body: Body(refreshToken: current.refreshToken)
            )
            try await sessionStore.save(envelope.session)
            return envelope.session
        } catch {
            try? await sessionStore.clear()
            throw AuthError.sessionExpired
        }
    }

    public func logout() async {
        _ = try? await post("/api/auth/logout")
        try? await sessionStore.clear()
    }

    public func deleteAccount() async throws {
        struct Body: Encodable { var confirmation: String }
        struct Response: Decodable { var deletionRequestId: String; var status: String }
        let _: Response = try await jsonRequest(
            "/api/auth/account",
            method: "DELETE",
            body: Body(confirmation: "DELETE")
        )
        try await sessionStore.clear()
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

    public func connectGmailURL() async throws -> URL {
        struct Box: Decodable { var authorizationUrl: String }
        let box: Box = try await get("/api/mail/google/start")
        guard let url = URL(string: box.authorizationUrl) else { throw AuthError.invalidResponse }
        return url
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
        let request = try await authorizedRequest(
            "/api/profile/resumes",
            method: "POST",
            body: data,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
        _ = try await perform(request)
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
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = try await self.authorizedRequest("/api/search/sessions/\(sessionId)/events")
                    var (bytes, response) = try await HTTP.session.bytes(for: request)
                    if let http = response as? HTTPURLResponse, http.statusCode == 401 {
                        let session = try await self.refreshSession()
                        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
                        (bytes, response) = try await HTTP.session.bytes(for: request)
                    }
                    guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
                        throw URLError(.badServerResponse)
                    }
                    let streamDecoder = self.decoder()
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data:") else { continue }
                        let raw = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        guard let data = raw.data(using: .utf8) else { continue }
                        continuation.yield(try streamDecoder.decode(SearchStreamEvent.self, from: data))
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

    public func downloadPacket(jobId: String) async throws -> URL {
        let data = try await perform(try await authorizedRequest("/api/jobs/\(jobId)/packet"))
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("packet-\(jobId).pdf")
        try data.write(to: file, options: .atomic)
        return file
    }

    public func exportAccount() async throws -> URL {
        let data = try await perform(try await authorizedRequest("/api/auth/export"))
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("job-hunt-os-export.json")
        try data.write(to: file, options: .atomic)
        return file
    }

    public func linkIdentity(
        provider: AuthProvider,
        challengeId: String,
        identityToken: String,
        authorizationCode: String?
    ) async throws {
        struct Body: Encodable {
            var challengeId: String
            var identityToken: String
            var authorizationCode: String?
        }
        struct Box: Decodable { var linked: Bool }
        let _: Box = try await jsonRequest(
            "/api/auth/exchange/\(provider.rawValue)",
            method: "POST",
            body: Body(
                challengeId: challengeId,
                identityToken: identityToken,
                authorizationCode: authorizationCode
            )
        )
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
