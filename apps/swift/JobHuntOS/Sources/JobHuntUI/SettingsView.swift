import SwiftUI

public struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL
    @AppStorage("backendURL") private var backendURL = "http://127.0.0.1:3000"
    @State private var maxYears = 6
    @State private var saved = false

    public init() {}

    public var body: some View {
        NavigationStack {
            Form {
                Section("Backend") {
                    TextField("Backend URL", text: $backendURL)
                    Text("On iPhone, use your server or Mac LAN address—not 127.0.0.1.")
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
                            Task { openURL(await store.client.connectGmailURL()) }
                        }
                    }
                    Text("Gmail OAuth and OpenAI run on the backend. Tokens never live in this app.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Job sources") {
                    ForEach(store.sources) { source in
                        LabeledContent(source.name) {
                            Label(
                                source.configured ? "Ready" : "Needs key",
                                systemImage: source.configured ? "checkmark.circle" : "key"
                            )
                            .foregroundStyle(source.configured ? .green : .orange)
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Settings")
            .onAppear { maxYears = store.profile?.maxYearsRequired ?? 6 }
        }
    }
}
