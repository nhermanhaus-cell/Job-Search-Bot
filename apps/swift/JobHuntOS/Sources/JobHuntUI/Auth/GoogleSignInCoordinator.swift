import Foundation
import GoogleSignIn
import JobHuntKit

enum GoogleSignInCoordinator {
    @MainActor
    static func signIn(nonce: String) async throws -> String {
        let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String
        if let clientID, !clientID.isEmpty {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }
        let presenting = try AuthPresenter.viewController()
        let result = try await GIDSignIn.sharedInstance.signIn(
            withPresenting: presenting,
            hint: nil,
            additionalScopes: nil,
            nonce: nonce
        )
        guard let token = result.user.idToken?.tokenString else { throw AuthError.invalidResponse }
        return token
    }

    static func handle(_ url: URL) -> Bool {
        GIDSignIn.sharedInstance.handle(url)
    }
}
