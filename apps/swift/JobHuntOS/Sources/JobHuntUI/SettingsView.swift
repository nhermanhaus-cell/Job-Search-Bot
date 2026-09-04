import JobHuntKit
import SwiftUI

public struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL
    #if DEBUG
    @AppStorage("backendURL") private var backendURL = "http://localhost:3000"
    @State private var saved = false
    #endif
    @State private var maxYears = 6
    @State private var enabledSources = Set<String>()
    @State private var mailPollMinutes = 15
    @State private var confirmDelete = false
    @State private var working = false

    public init() {}

    public var body: some View {
        NavigationStack {
            Form {
                accountSection

                #if DEBUG
                Section("Backend (debug)") {
                    TextField("Backend URL", text: $backendURL)
                    Text("On a physical iPhone, use an HTTPS server or your Mac’s .local hostname—not loopback.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button("Save and reconnect") {
                        if let url = URL(string: backendURL) {
                            store.configure(baseURL: url)
                            saved = true
                            Task { await store.refresh() }
                        }
                    }
                    if saved { Label("Saved", systemImage: "checkmark.circle").foregroundStyle(.green) }
                }
                #endif

                Section("Matching") {
                    Stepper(
                        "Flag roles requiring more than \(maxYears) years",
                        value: $maxYears,
                        in: 0 ... 25
                    )
                    Button("Save matching preference") {
                        guard let profile = store.profile else { return }
                        Task {
                            _ = try? await store.client.updateProfile(
                                name: profile.name,
                                email: profile.email,
                                location: profile.location,
                                maxYearsRequired: maxYears,
                                onboardingDone: profile.onboardingDone
                            )
                            await store.refresh()
                        }
                    }
                }

                Section("Gmail") {
                    if let account = store.mailStatus?.accounts.first {
                        LabeledContent("Connected", value: account.email)
                        Button("Disconnect Gmail", role: .destructive) {
                            Task {
                                try? await store.client.disconnectGmail()
                                await store.refresh()
                            }
                        }
                    } else {
                        Button("Connect Gmail") {
                            Task {
                                do {
                                    openURL(try await store.client.connectGmailURL())
                                } catch {
                                    store.error = error.localizedDescription
                                }
                            }
                        }
                    }
                    Text("Gmail stays optional and server-side. Public launch waits on Google’s gmail.readonly verification.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Job sources") {
                    ForEach(store.sources) { source in
                        Toggle(
                            isOn: Binding(
                                get: { enabledSources.contains(source.id) },
                                set: { enabled in
                                    if enabled { enabledSources.insert(source.id) }
                                    else { enabledSources.remove(source.id) }
                                }
                            )
                        ) {
                            VStack(alignment: .leading) {
                                Text(source.name)
                                if !source.configured {
                                    Text(source.missingReason ?? "Configure this source on the backend")
                                        .font(.caption)
                                        .foregroundStyle(.orange)
                                }
                            }
                        }
                        .disabled(!source.configured)
                    }
                    Button("Save source defaults") {
                        Task {
                            try? await store.client.updateServerSettings(
                                enabledSources: Array(enabledSources),
                                mailPollMinutes: mailPollMinutes
                            )
                            await store.refresh()
                        }
                    }
                }

                Section("Automatic mail interval") {
                    Stepper(
                        "Check every \(mailPollMinutes) minutes",
                        value: $mailPollMinutes,
                        in: 5 ... 120,
                        step: 5
                    )
                }

                Section("AI") {
                    if store.serverSettings?.secrets.openai == true {
                        Label("Platform OpenAI key configured", systemImage: "checkmark.shield")
                            .foregroundStyle(.green)
                    } else {
                        Text("Resume parsing and mail classification use a platform-managed model. No personal API key is stored.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Legal") {
                    Link("Privacy policy", destination: store.backendURL.appending(path: "privacy"))
                    Link("Terms of use", destination: store.backendURL.appending(path: "terms"))
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Settings")
            .onAppear {
                maxYears = store.profile?.maxYearsRequired ?? 6
                enabledSources = Set(
                    store.serverSettings?.enabledSources
                        ?? store.sources.filter(\.configured).map(\.id)
                )
                mailPollMinutes = store.serverSettings?.mailPollMinutes ?? 15
            }
            .alert("Delete your account?", isPresented: $confirmDelete) {
                Button("Delete everything", role: .destructive) {
                    Task {
                        working = true
                        try? await store.deleteAccount()
                        working = false
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This revokes Apple, Google and Gmail access, shreds encrypted resumes, and deletes your hunt data. Type-safe confirmation is sent as DELETE.")
            }
        }
    }

    private var accountSection: some View {
        Section("Account") {
            if let user = store.session?.user {
                LabeledContent("Signed in", value: user.email ?? user.name ?? user.id)
                LabeledContent("Providers", value: user.providers.joined(separator: ", "))
            }
            if !(store.session?.user.providers.contains("apple") ?? false) {
                Button("Link Apple") {
                    Task { try? await store.link(provider: .apple) }
                }
            }
            if !(store.session?.user.providers.contains("google") ?? false) {
                Button("Link Google") {
                    Task { try? await store.link(provider: .google) }
                }
            }
            Button("Export my data") {
                Task {
                    if let url = try? await store.client.exportAccount() {
                        openURL(url)
                    }
                }
            }
            Button("Log out") {
                Task { await store.signOut() }
            }
            Button("Delete account", role: .destructive) {
                confirmDelete = true
            }
            .disabled(working)
        }
    }
}
