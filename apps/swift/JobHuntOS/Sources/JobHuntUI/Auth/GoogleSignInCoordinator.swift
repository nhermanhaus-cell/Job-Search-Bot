import Foundation
import GoogleSignIn
import JobHuntKit

enum GoogleSignInCoordinator {
    @MainActor
    static func signIn(nonce: String) async throws -> String {
        let clientID = (Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !clientID.isEmpty, !clientID.hasPrefix("$(") else {
            throw AuthError.server("Add your iOS Google client ID in Xcode (GIDClientID) to use Google Sign-In.")
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)

        let result: GIDSignInResult
        #if os(iOS)
        result = try await GIDSignIn.sharedInstance.signIn(
            withPresenting: try AuthPresenter.viewController(),
            hint: nil,
            additionalScopes: nil,
            nonce: nonce
        )
        #else
        result = try await GIDSignIn.sharedInstance.signIn(
            withPresenting: try AuthPresenter.anchor(),
            hint: nil,
            additionalScopes: nil,
            nonce: nonce
        )
        #endif
        guard let token = result.user.idToken?.tokenString else { throw AuthError.invalidResponse }
        return token
    }

    static func handle(_ url: URL) -> Bool {
        GIDSignIn.sharedInstance.handle(url)
    }
}
