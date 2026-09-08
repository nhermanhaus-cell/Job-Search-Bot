import Foundation

public enum AuthProvider: String, Codable, Sendable {
    case apple
    case google
}

public enum AuthIntent: String, Codable, Sendable {
    case signup
    case login
    case link
}

public struct AuthUser: Codable, Identifiable, Sendable {
    public var id: String
    public var email: String?
    public var name: String?
    public var providers: [String]
}

public struct AuthSession: Codable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    public var accessExpiresAt: Date
    public var refreshExpiresAt: Date
    public var user: AuthUser
    public var onboardingDone: Bool
}

public struct AuthChallenge: Codable, Sendable {
    public var challengeId: String
    public var nonce: String
    public var expiresAt: Date
}

public struct AuthSessionEnvelope: Codable, Sendable {
    public var session: AuthSession
}

public enum AuthError: LocalizedError, Sendable, Equatable {
    case unauthenticated
    case sessionExpired
    case accountNotFound
    case cancelled
    case invalidResponse
    case server(String)

    public var errorDescription: String? {
        switch self {
        case .unauthenticated: "Sign in to continue."
        case .sessionExpired: "Your session expired. Please sign in again."
        case .accountNotFound: "No account exists for that sign-in."
        case .cancelled: "Sign-in was cancelled."
        case .invalidResponse: "The sign-in response could not be read."
        case let .server(message): message
        }
    }
}
