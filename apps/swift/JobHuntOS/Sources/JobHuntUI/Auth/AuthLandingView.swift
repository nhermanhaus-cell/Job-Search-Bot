import JobHuntKit
import SwiftUI

public struct AuthLandingView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showSignup = false
    @State private var showLogin = false

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    ShowcaseCarousel()
                    VStack(spacing: 12) {
                        Button("Get Started") { showSignup = true }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                        Button("Log In") { showLogin = true }
                            .buttonStyle(.bordered)
                            .controlSize(.large)
                    }
                    Text("By continuing you agree to encrypted resume storage, optional OpenAI fact extraction, and the privacy policy. Gmail is opt-in later.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    NavigationLink("Privacy") {
                        LegalSheet(title: "Privacy", path: "/privacy")
                    }
                }
                .padding()
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Job Hunt OS")
            .sheet(isPresented: $showSignup) {
                AuthProviderSheet(intent: .signup)
                    .environmentObject(store)
            }
            .sheet(isPresented: $showLogin) {
                AuthProviderSheet(intent: .login)
                    .environmentObject(store)
            }
        }
    }
}

struct AuthProviderSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let intent: AuthIntent
    @State private var working: AuthProvider?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text(intent == .signup ? "Create your account" : "Welcome back")
                    .font(.title.bold())
                Text(intent == .signup
                     ? "We'll keep resumes encrypted and wait for you before anything is sent to an employer."
                     : "Use the same Apple or Google identity you signed up with.")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                SignInWithAppleButton()
                    .frame(height: 52)
                    .onTapGesture { Task { await authenticate(.apple) } }
                    .disabled(working != nil)
                Button {
                    Task { await authenticate(.google) }
                } label: {
                    Label(working == .google ? "Signing in…" : "Continue with Google", systemImage: "g.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(working != nil)
                if let error {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }
                Spacer()
            }
            .padding()
            .navigationTitle(intent == .signup ? "Get Started" : "Log In")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private func authenticate(_ provider: AuthProvider) async {
        working = provider
        error = nil
        do {
            try await store.authenticate(provider: provider, intent: intent)
            dismiss()
        } catch let auth as AuthError {
            error = auth.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }
        working = nil
    }
}

private struct SignInWithAppleButton: View {
    var body: some View {
        Label("Continue with Apple", systemImage: "apple.logo")
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(.black, in: RoundedRectangle(cornerRadius: 8))
            .foregroundStyle(.white)
    }
}

struct LegalSheet: View {
    let title: String
    let path: String
    @EnvironmentObject private var store: AppStore

    var body: some View {
        if let url = URL(string: path, relativeTo: store.backendURL) {
            #if os(macOS)
            Link(title, destination: url)
            #else
            LegalWebView(url: url)
                .navigationTitle(title)
            #endif
        }
    }
}

#if os(iOS)
import WebKit
private struct LegalWebView: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> WKWebView { WKWebView() }
    func updateUIView(_ view: WKWebView, context: Context) {
        view.load(URLRequest(url: url))
    }
}
#endif
