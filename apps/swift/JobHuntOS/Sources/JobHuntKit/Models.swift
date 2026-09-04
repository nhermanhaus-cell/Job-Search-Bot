import Foundation

public enum Difficulty: String, Codable, CaseIterable, Sendable {
    case easy, medium, reach
}

public struct MailStatus: Codable, Sendable {
    public var googleConfigured: Bool
    public var openaiModel: String
    public var openaiConfigured: Bool
    public var accounts: [MailAccountInfo]
    public var pendingReview: Int
}

public struct MailAccountInfo: Codable, Identifiable, Sendable {
    public var id: String
    public var email: String
    public var lastSyncAt: Date?
    public var lastError: String?
    public var connectedAt: Date
}

public struct Application: Codable, Identifiable, Sendable {
    public var id: String
    public var company: String
    public var jobTitle: String?
    public var status: String
    public var source: String
    public var listingUrl: String?
    public var notes: String?
    public var appliedAt: Date?
    public var interviewAt: Date?
    public var updatedAt: Date
}

public struct MailEvent: Codable, Identifiable, Sendable {
    public var id: String
    public var applicationId: String?
    public var fromAddress: String?
    public var subject: String?
    public var snippet: String?
    public var receivedAt: Date?
    public var classification: String
    public var company: String?
    public var jobTitle: String?
    public var confidence: Double
    public var meetingUrl: URL?
    public var nextAction: String?
    public var reviewState: String
}

public struct ApplicationStats: Codable, Sendable {
    public var totals: Totals
    public var byStatus: [String: Int]
    public var byClassification: [String: Int]

    public struct Totals: Codable, Sendable {
        public var applications: Int
        public var mailEvents: Int
    }
}

public struct SyncPayload: Codable, Sendable {
    public var applications: [Application]
    public var mailEvents: [MailEvent]
    public var openaiModel: String
}

public struct ProfileEnvelope: Codable, Sendable {
    public var profile: Profile
}

public struct Profile: Codable, Identifiable, Sendable {
    public var id: String
    public var name: String?
    public var email: String?
    public var location: String?
    public var remotePreference: String?
    public var maxYearsRequired: Int?
    public var summary: String?
    public var onboardingDone: Bool
    public var resumeDocuments: [ResumeDocument]
    public var experienceItems: [ExperienceItem]
    public var skills: [Skill]
    public var titleInterests: [TitleInterest]
}

public struct ResumeDocument: Codable, Identifiable, Sendable {
    public var id: String
    public var fileName: String
    public var mediaType: String
    public var parseStatus: String
    public var uploadedAt: Date
}

public struct ExperienceItem: Codable, Identifiable, Sendable {
    public var id: String
    public var company: String
    public var title: String
    public var startDate: String?
    public var endDate: String?
    public var location: String?
    public var bullets: [String]
    public var sourceDocumentIds: [String]
}

public struct Skill: Codable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var confidence: Double
    public var aliases: [String]
    public var sourceDocumentIds: [String]
}

public struct TitleInterest: Codable, Identifiable, Sendable {
    public var id: String
    public var title: String
    public var reason: String?
    public var pinned: Bool
    public var source: String
}

public struct SearchSession: Codable, Identifiable, Sendable {
    public var id: String
    public var query: String
    public var location: String?
    public var status: String
}

public struct SourceInfo: Codable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var configured: Bool
}

public struct Job: Codable, Identifiable, Sendable {
    public var id: String
    public var provider: String
    public var providerJobId: String
    public var title: String
    public var company: String
    public var location: String?
    public var remote: Bool
    public var description: String
    public var listingUrl: String
    public var salaryText: String?
    public var postedAt: Date?
    public var firstSeenAt: Date
    public var requirements: JobRequirements?
    public var sources: [JobSource]?
    public var match: JobMatch?
}

public struct JobSource: Codable, Sendable {
    public var provider: String
    public var providerJobId: String
    public var listingUrl: String
}

public struct JobRequirements: Codable, Sendable {
    public var minYears: Int?
    public var maxYears: Int?
    public var seniority: String
    public var requiredSkills: [String]
    public var impliedRequirements: [String]
    public var workAuthorization: String?
    public var travel: String?
    public var onCall: Bool
    public var degree: String?
}

public struct JobMatch: Codable, Identifiable, Sendable {
    public var id: String
    public var score: Int
    public var difficulty: String
    public var effectiveDifficulty: String?
    public var explanation: String
    public var breakdown: [String: Int]?
    public var hiddenMisses: [String]?
    public var userDifficulty: String?
    public var hidden: Bool
}

public struct EditSuggestion: Codable, Identifiable, Sendable {
    public var id: String
    public var kind: String
    public var section: String
    public var beforeText: String?
    public var afterText: String
    public var rationale: String
    public var status: String
}

public struct ResumeVersion: Codable, Identifiable, Sendable {
    public var id: String
    public var jobId: String?
    public var contentJson: String
    public var status: String
    public var createdAt: Date
}

public struct JobDetail: Codable, Identifiable, Sendable {
    public var id: String
    public var provider: String
    public var title: String
    public var company: String
    public var location: String?
    public var remote: Bool
    public var description: String
    public var listingUrl: String
    public var salaryText: String?
    public var postedAt: Date?
    public var firstSeenAt: Date
    public var requirements: JobRequirements
    public var sources: [JobSource]
    public var matches: [JobMatch]
    public var suggestions: [EditSuggestion]
    public var resumeVersions: [ResumeVersion]
}

public struct SearchStreamEvent: Codable, Sendable {
    public var type: String
    public var source: String?
    public var count: Int?
    public var error: String?
    public var reason: String?
    public var sessionId: String?
    public var job: Job?
    public var match: JobMatch?
}

public struct JobStats: Codable, Sendable {
    public var total: Int
    public var difficulty: DifficultyCounts
    public var bySource: [String: Int]
    public var series: [JobDay]
}

public struct DifficultyCounts: Codable, Sendable {
    public var easy: Int
    public var medium: Int
    public var reach: Int

    public subscript(_ difficulty: Difficulty) -> Int {
        switch difficulty {
        case .easy: easy
        case .medium: medium
        case .reach: reach
        }
    }
}

public struct JobDay: Codable, Identifiable, Sendable {
    public var date: String
    public var total: Int
    public var easy: Int
    public var medium: Int
    public var reach: Int
    public var id: String { date }
}
