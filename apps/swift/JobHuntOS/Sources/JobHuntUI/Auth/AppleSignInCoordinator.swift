import AuthenticationServices
import Foundation
import JobHuntKit

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

@MainActor
enum AuthPresenter {
    static func anchor() throws -> ASPresentationAnchor {
        #if os(iOS)
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              let window = scene.windows.first(where: \.isKeyWindow) ?? scene.windows.first
        else { throw AuthError.invalidResponse }
        return window
        #else
        guard let window = NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first else {
            throw AuthError.invalidResponse
        }
        return window
        #endif
    }

    #if os(iOS)
    static func viewController() throws -> UIViewController {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              let root = (scene.windows.first(where: \.isKeyWindow) ?? scene.windows.first)?.rootViewController
        else { throw AuthError.invalidResponse }
        return root.presentedViewController ?? root
    }
    #endif

    #if os(macOS)
    static func viewController() throws -> NSViewController {
        guard let controller = NSApplication.shared.keyWindow?.contentViewController
            ?? NSApplication.shared.windows.first?.contentViewController
        else { throw AuthError.invalidResponse }
        return controller
    }
    #endif
}

final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding, @unchecked Sendable {
    private var continuation: CheckedContinuation<ASAuthorization, Error>?

    func signIn(nonce: String) async throws -> (identityToken: String, authorizationCode: String?, fullName: String?) {
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = nonce
        let authorization = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<ASAuthorization, Error>) in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8)
        else { throw AuthError.invalidResponse }
        let code = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        let fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
            .compactMap { $0 }
            .joined(separator: " ")
        return (identityToken, code, fullName.isEmpty ? nil : fullName)
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let anchor = try? AuthPresenter.anchor() { return anchor }
        #if os(iOS)
        return UIWindow()
        #else
        return NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1, height: 1),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        #endif
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        continuation?.resume(returning: authorization)
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        continuation?.resume(throwing: (error as? ASAuthorizationError)?.code == .canceled ? AuthError.cancelled : error)
        continuation = nil
    }
}
