import Foundation
import JobHuntKit
import SwiftUI

public enum AppPhase: Equatable {
    case bootstrapping
    case unauthenticated
    case onboarding
    case main
}

@MainActor
public final class AppStore: ObservableObject {
    @Published public var phase: AppPhase = .bootstrapping
    @Published public var session: AuthSession?
    @Published public var profile: Profile?
    @Published public var jobs: [Job] = []
    @Published public var applications: [Application] = []
    @Published public var mailEvents: [MailEvent] = []
    @Published public var mailStatus: MailStatus?
    @Published public var applicationStats: ApplicationStats?
    @Published public var jobStats: JobStats?
    @Published public var sources: [SourceInfo] = []
    @Published public var serverSettings: ServerSettings?
    @Published public var sourceStates: [String: String] = [:]
    @Published public var sourceCounts: [String: Int] = [:]
    @Published public var searchRunning = false
    @Published public var selectedDifficulty: Difficulty?
    @Published public var error: String?
    @Published public var backendURL: URL

    public private(set) var client: APIClient
    private let cache = OfflineCache()
    private let apple = AppleSignInCoordinator()

    public init() {
        #if DEBUG
        let configured = UserDefaults.standard.string(forKey: "backendURL")
            .flatMap(URL.init(string:)) ?? APIClient.defaultBaseURL
        #else
        let configured = APIClient.defaultBaseURL
        #endif
        backendURL = configured
        client = APIClient(baseURL: configured)
    }

    public func configure(baseURL: URL) {
        #if DEBUG
        UserDefaults.standard.set(baseURL.absoluteString, forKey: "backendURL")
        backendURL = baseURL
        client = APIClient(baseURL: baseURL)
        #endif
    }

    public func bootstrap() async {
        phase = .bootstrapping
        do {
            let session = try await client.validateStoredSession()
            apply(session: session)
            await refresh()
        } catch {
            clearLocalSession()
            phase = .unauthenticated
        }
    }

    public func authenticate(provider: AuthProvider, intent: AuthIntent) async throws {
        let challenge = try await client.authChallenge(provider: provider, intent: intent)
        let identityToken: String
        var authorizationCode: String?
        var fullName: String?
        switch provider {
        case .apple:
            let apple = try await apple.signIn(nonce: challenge.nonce)
            identityToken = apple.identityToken
            authorizationCode = apple.authorizationCode
            fullName = apple.fullName
        case .google:
            identityToken = try await GoogleSignInCoordinator.signIn(nonce: challenge.nonce)
        }
        let session = try await client.exchangeIdentity(
            provider: provider,
            challengeId: challenge.challengeId,
            identityToken: identityToken,
            authorizationCode: authorizationCode,
            fullName: fullName
        )
        apply(session: session)
        await refresh()
    }

    public func link(provider: AuthProvider) async throws {
        let challenge = try await client.authChallenge(provider: provider, intent: .link)
        let identityToken: String
        var authorizationCode: String?
        switch provider {
        case .apple:
            let apple = try await apple.signIn(nonce: challenge.nonce)
            identityToken = apple.identityToken
            authorizationCode = apple.authorizationCode
        case .google:
            identityToken = try await GoogleSignInCoordinator.signIn(nonce: challenge.nonce)
        }
        try await client.linkIdentity(
            provider: provider,
            challengeId: challenge.challengeId,
            identityToken: identityToken,
            authorizationCode: authorizationCode
        )
        if let updated = try? await client.validateStoredSession() {
            apply(session: updated)
        }
    }

    public func signOut() async {
        let userId = session?.user.id
        await client.logout()
        if let userId { cache.removeAll(for: userId) }
        clearLocalSession()
        phase = .unauthenticated
    }

    public func deleteAccount() async throws {
        let userId = session?.user.id
        try await client.deleteAccount()
        if let userId { cache.removeAll(for: userId) }
        clearLocalSession()
        phase = .unauthenticated
    }

    private func apply(session: AuthSession) {
        self.session = session
        cache.userId = session.user.id
        jobs = cache.load([Job].self, key: "jobs") ?? jobs
        applications = cache.load([Application].self, key: "applications") ?? applications
        mailEvents = cache.load([MailEvent].self, key: "mailEvents") ?? mailEvents
        profile = cache.load(Profile.self, key: "profile") ?? profile
        phase = session.onboardingDone ? .main : .onboarding
    }

    private func clearLocalSession() {
        session = nil
        profile = nil
        jobs = []
        applications = []
        mailEvents = []
        mailStatus = nil
        applicationStats = nil
        jobStats = nil
        cache.userId = nil
    }

    public func refresh() async {
        guard phase == .main || phase == .onboarding else { return }
        do {
            let client = self.client
            let difficulty = selectedDifficulty
            async let profileValue = client.profile()
            async let jobsValue = client.jobs(difficulty: difficulty)
            async let appsValue = client.applications()
            async let eventsValue = client.events()
            async let appStatsValue = client.stats()
            async let jobStatsValue = client.jobStats()
            async let mailValue = client.mailStatus()
            async let sourcesValue = client.sources()
            async let settingsValue = client.serverSettings()
            profile = try await profileValue
            jobs = try await jobsValue
            applications = try await appsValue
            mailEvents = try await eventsValue
            applicationStats = try await appStatsValue
            jobStats = try await jobStatsValue
            mailStatus = try await mailValue
            sources = try await sourcesValue
            serverSettings = try await settingsValue
            if let profile { cache.save(profile, key: "profile") }
            cache.save(jobs, key: "jobs")
            cache.save(applications, key: "applications")
            cache.save(mailEvents, key: "mailEvents")
            if let onboardingDone = profile?.onboardingDone {
                session?.onboardingDone = onboardingDone
                phase = onboardingDone ? .main : .onboarding
            }
            error = nil
        } catch let auth as AuthError where auth == .sessionExpired || auth == .unauthenticated {
            await signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }

    public func refreshJobs() async {
        do {
            jobs = try await client.jobs(difficulty: selectedDifficulty)
            jobStats = try await client.jobStats()
            cache.save(jobs, key: "jobs")
        } catch {
            self.error = error.localizedDescription
        }
    }

    public func uploadResumes(_ urls: [URL]) async {
        do {
            try await client.uploadResumes(urls)
            profile = try await client.profile()
            if let profile { cache.save(profile, key: "profile") }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    public func addTitle(_ title: String) async {
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        do {
            _ = try await client.addTitle(title)
            profile = try await client.profile()
            if let profile { cache.save(profile, key: "profile") }
        } catch {
            self.error = error.localizedDescription
        }
    }

    public func setTitle(_ interest: TitleInterest, pinned: Bool) async {
        do {
            try await client.setTitle(interest, pinned: pinned)
            profile = try await client.profile()
            if let profile { cache.save(profile, key: "profile") }
        } catch {
            self.error = error.localizedDescription
        }
    }

    public func completeOnboarding(
        name: String,
        email: String,
        location: String,
        maxYearsRequired: Int
    ) async {
        do {
            profile = try await client.updateProfile(
                name: name,
                email: email,
                location: location,
                maxYearsRequired: maxYearsRequired,
                onboardingDone: true
            )
            session?.onboardingDone = true
            phase = .main
            await refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    public func search(query: String, location: String, enabledSources: [String]) async {
        searchRunning = true
        sourceStates = Dictionary(uniqueKeysWithValues: enabledSources.map { ($0, "queued") })
        sourceCounts = [:]
        do {
            let session = try await client.startSearch(
                query: query,
                location: location.isEmpty ? nil : location,
                sources: enabledSources
            )
            for try await event in await client.searchEvents(sessionId: session.id) {
                switch event.type {
                case "source_started":
                    if let source = event.source { sourceStates[source] = "loading" }
                case "source_done":
                    if let source = event.source {
                        sourceStates[source] = "done"
                        sourceCounts[source] = event.count ?? 0
                    }
                case "source_error":
                    if let source = event.source { sourceStates[source] = "error" }
                case "source_skipped":
                    if let source = event.source { sourceStates[source] = "needs key" }
                case "job":
                    if var incoming = event.job {
                        incoming.match = event.match
                        if let index = jobs.firstIndex(where: { $0.id == incoming.id }) {
                            jobs[index] = incoming
                        } else {
                            jobs.append(incoming)
                        }
                    }
                case "session_done":
                    searchRunning = false
                default:
                    break
                }
            }
            searchRunning = false
            await refreshJobs()
        } catch {
            searchRunning = false
            self.error = error.localizedDescription
        }
    }

    public func syncMail() async {
        do {
            try await client.syncMail()
            applications = try await client.applications()
            mailEvents = try await client.events()
            applicationStats = try await client.stats()
        } catch {
            self.error = error.localizedDescription
        }
    }

    public func review(_ event: MailEvent, action: String) async {
        do {
            try await client.review(eventId: event.id, action: action)
            mailEvents = try await client.events()
            applications = try await client.applications()
            applicationStats = try await client.stats()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
