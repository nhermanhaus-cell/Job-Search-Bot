import JobHuntKit
import SwiftUI
import UniformTypeIdentifiers

public struct OnboardingView: View {
    @EnvironmentObject private var store: AppStore
    @State private var step = 0
    @State private var showImporter = false
    @State private var showPaste = false
    @State private var uploading = false
    @State private var name = ""
    @State private var email = ""
    @State private var location = ""
    @State private var maxYears = 6
    @State private var newTitle = ""

    public init() {}

    public var body: some View {
        NavigationStack {
            VStack {
                ProgressView(value: Double(step + 1), total: 3)
                    .padding(.horizontal)
                TabView(selection: $step) {
                    uploadStep.tag(0)
                    reviewStep.tag(1)
                    titleStep.tag(2)
                }
                #if os(macOS)
                .tabViewStyle(.automatic)
                #else
                .tabViewStyle(.page(indexDisplayMode: .never))
                #endif
            }
            .navigationTitle("Build your background")
            .fileImporter(
                isPresented: $showImporter,
                allowedContentTypes: [.pdf, .plainText, .data],
                allowsMultipleSelection: true
            ) { result in
                guard case let .success(urls) = result else { return }
                uploading = true
                Task {
                    await store.uploadResumes(urls)
                    uploading = false
                    step = 1
                    seedFields()
                }
            }
        }
    }

    private var uploadStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "doc.badge.plus")
                .font(.system(size: 52))
                .foregroundStyle(.tint)
            Text("Upload every useful resume")
                .font(.title2.bold())
            Text("PDF, DOCX, or text. We merge unique experience and preserve which document each fact came from.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 520)
            Button(uploading ? "Reading resumes…" : "Choose resumes") {
                showImporter = true
            }
            .buttonStyle(.borderedProminent)
            .disabled(uploading)
            Button("Paste resume or LinkedIn text") { showPaste = true }
                .buttonStyle(.bordered)
            if uploading { ProgressView() }
            if !(store.profile?.resumeDocuments.isEmpty ?? true) {
                Text("\(store.profile?.resumeDocuments.count ?? 0) documents uploaded")
                Button("Continue") { step = 1; seedFields() }
            }
            errorText
        }
        .padding(32)
        .sheet(isPresented: $showPaste) {
            PasteResumeTextView()
                .environmentObject(store)
        }
    }

    private var reviewStep: some View {
        Form {
            Section("Confirm profile") {
                TextField("Name", text: $name)
                TextField("Email", text: $email)
                TextField("Location", text: $location)
                Stepper("Hide roles requiring more than \(maxYears) years", value: $maxYears, in: 0 ... 25)
            }
            Section("Experience merged from your resumes") {
                if store.profile?.experienceItems.isEmpty ?? true {
                    Text("No structured roles found. You can continue and add titles manually.")
                        .foregroundStyle(.secondary)
                }
                ForEach(store.profile?.experienceItems ?? []) { item in
                    VStack(alignment: .leading) {
                        Text(item.title).font(.headline)
                        Text(item.company).foregroundStyle(.secondary)
                        Text("\(item.bullets.count) facts · \(item.sourceDocumentIds.count) source document(s)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            if let conflicts = store.profile?.profileConflicts, !conflicts.isEmpty {
                Section("Resolve resume conflicts") {
                    ForEach(conflicts) { conflict in
                        VStack(alignment: .leading, spacing: 7) {
                            Label(conflict.message, systemImage: "exclamationmark.triangle")
                                .foregroundStyle(.orange)
                            HStack {
                                ForEach(conflict.options, id: \.self) { option in
                                    Button(option) {
                                        Task {
                                            try? await store.client.resolveConflict(
                                                id: conflict.id,
                                                value: option
                                            )
                                            store.profile = try? await store.client.profile()
                                        }
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }
                        }
                    }
                }
            }
            Button("Continue to role interests") { step = 2 }
                .buttonStyle(.borderedProminent)
        }
        .formStyle(.grouped)
        .padding()
    }

    private var titleStep: some View {
        Form {
            Section {
                HStack {
                    TextField("Add any title you want to explore", text: $newTitle)
                    Button("Add") {
                        let value = newTitle
                        newTitle = ""
                        Task { await store.addTitle(value) }
                    }
                    .disabled(newTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            } header: {
                Text("Job titles")
            } footer: {
                Text("Pin exact titles, adjacent roles, or anything you want to test.")
            }
            Section("Suggested from your background") {
                ForEach(store.profile?.titleInterests ?? []) { interest in
                    Toggle(
                        isOn: Binding(
                            get: { interest.pinned },
                            set: { pinned in Task { await store.setTitle(interest, pinned: pinned) } }
                        )
                    ) {
                        VStack(alignment: .leading) {
                            Text(interest.title)
                            if let reason = interest.reason {
                                Text(reason).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            Button("Start hunting") {
                Task {
                    await store.completeOnboarding(
                        name: name,
                        email: email,
                        location: location,
                        maxYearsRequired: maxYears
                    )
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled((store.profile?.titleInterests.filter(\.pinned).isEmpty ?? true))
        }
        .formStyle(.grouped)
        .padding()
    }

    @ViewBuilder
    private var errorText: some View {
        if let error = store.error {
            Text(error).foregroundStyle(.red).font(.caption)
        }
    }

    private func seedFields() {
        guard let profile = store.profile else { return }
        name = profile.name ?? ""
        email = profile.email ?? ""
        location = profile.location ?? ""
        maxYears = profile.maxYearsRequired ?? 6
    }
}

private struct PasteResumeTextView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Paste resume or LinkedIn experience text", text: $text, axis: .vertical)
                    .lineLimit(16 ... 30)
            }
            .navigationTitle("Paste background")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") {
                        Task {
                            let url = FileManager.default.temporaryDirectory
                                .appendingPathComponent("pasted-background-\(UUID().uuidString).txt")
                            try? Data(text.utf8).write(to: url)
                            await store.uploadResumes([url])
                            try? FileManager.default.removeItem(at: url)
                            dismiss()
                        }
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
