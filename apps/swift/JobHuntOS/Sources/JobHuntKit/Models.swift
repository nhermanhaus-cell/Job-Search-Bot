import Foundation

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
