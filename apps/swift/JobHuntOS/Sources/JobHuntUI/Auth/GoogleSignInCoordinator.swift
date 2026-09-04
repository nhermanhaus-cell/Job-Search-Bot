import Foundation
import GoogleSignIn
import JobHuntKit

#if os(macOS)
import AppKit
#endif

enum GoogleSignInCoordinator {
    @MainActor
    static func signIn(nonce: String) async throws -> String {
        let clientID = (Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !clientID.isEmpty, !clientID.hasPrefix("$(") else {
            throw AuthError.server("Add your iOS Google client ID in Xcode (GIDClientID) to use Google Sign-In.")
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)

        let result: GIDSignInResult = try await withCheckedThrowingContinuation { continuation in
            let finish: (GIDSignInResult?, Error?) -> Void = { result, error in
                if let result {
                    continuation.resume(returning: result)
                } else {
                    continuation.resume(throwing: error ?? AuthError.invalidResponse)
                }
            }
            do {
                #if os(iOS)
                GIDSignIn.sharedInstance.signIn(
                    withPresenting: try AuthPresenter.viewController(),
                    hint: nil,
                    additionalScopes: nil,
                    nonce: nonce,
                    completion: finish
                )
                #else
                GIDSignIn.sharedInstance.signIn(
                    withPresentingWindow: try AuthPresenter.anchor(),
                    hint: nil,
                    additionalScopes: nil,
                    nonce: nonce,
                    completion: finish
                )
                #endif
            } catch {
                continuation.resume(throwing: error)
            }
        }
        guard let token = result.user.idToken?.tokenString else { throw AuthError.invalidResponse }
        return token
    }

    static func handle(_ url: URL) -> Bool {
        GIDSignIn.sharedInstance.handle(url)
    }
}
