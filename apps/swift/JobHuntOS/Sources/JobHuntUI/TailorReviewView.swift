import JobHuntKit
import SwiftUI

public struct TailorReviewView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL
    public let jobID: String
    @State private var detail: JobDetail?
    @State private var showApplyConfirm = false
    @State private var versionCreated = false

    public init(jobID: String) {
        self.jobID = jobID
    }

    public var body: some View {
        Group {
            if let detail {
                #if os(macOS)
                HSplitView {
                    suggestions(detail)
                        .frame(minWidth: 360)
                    preview(detail)
                        .frame(minWidth: 380)
                }
                #else
                ScrollView {
                    VStack(spacing: 20) {
                        suggestions(detail)
                        preview(detail)
                    }
                    .padding()
                }
                #endif
            } else {
                ProgressView("Building grounded suggestions…")
            }
        }
        .navigationTitle("Tailor for \(detail?.company ?? "job")")
        .toolbar {
            if detail != nil {
                ToolbarItem(placement: .primaryAction) {
                    Button("Review application") { showApplyConfirm = true }
                }
            }
        }
        .sheet(isPresented: $showApplyConfirm) {
            if let detail {
                ApplyConfirmView(
                    detail: detail,
                    versionCreated: versionCreated,
                    canOpenListing: webURL(detail.listingUrl) != nil,
                    onCreateVersion: createVersion,
                    onDownload: downloadPacket,
                    onApply: apply
                )
            }
        }
        .task { await load() }
    }

    private func suggestions(_ job: JobDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Suggested edits").font(.title2.bold())
                Text("Every suggestion is grounded in a skill or fact already in your merged profile.")
                    .foregroundStyle(.secondary)
                ForEach(job.suggestions) { suggestion in
                    SuggestionRow(
                        suggestion: suggestion,
                        onDecision: { status, text in
                            Task {
                                try? await store.client.updateSuggestion(
                                    jobId: jobID,
                                    suggestion: suggestion,
                                    status: status,
                                    afterText: text
                                )
                                await load()
                            }
                        }
                    )
                }
            }
            .padding()
        }
    }

    private func preview(_ job: JobDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Resume preview").font(.title2.bold())
                Spacer()
                if versionCreated {
                    Label("Version saved", systemImage: "checkmark.circle")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }
            ResumePreviewView(
                profile: store.profile,
                targetTitle: job.title,
                suggestions: job.suggestions.filter { $0.status == "accepted" }
            )
            HStack {
                Button("Save tailored version") { Task { await createVersion() } }
                    .buttonStyle(.borderedProminent)
                Button("Download PDF") { Task { await downloadPacket() } }
            }
        }
        .padding()
    }

    private func load() async {
        detail = try? await store.client.job(id: jobID)
        versionCreated = !(detail?.resumeVersions.isEmpty ?? true)
    }

    private func createVersion() async {
        try? await store.client.createResumeVersion(jobId: jobID, status: "approved")
        await load()
    }

    private func downloadPacket() async {
        if !versionCreated { await createVersion() }
        openURL(await store.client.packetURL(jobId: jobID))
    }

    private func apply() async {
        if !versionCreated { await createVersion() }
        try? await store.client.trackApply(jobId: jobID)
        if let url = detail.flatMap({ webURL($0.listingUrl) }) {
            openURL(url)
        }
        showApplyConfirm = false
        await store.refresh()
    }

    private func webURL(_ value: String) -> URL? {
        guard let url = URL(string: value), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            return nil
        }
        return url
    }
}

struct ResumePreviewView: View {
    let profile: Profile?
    let targetTitle: String
    let suggestions: [EditSuggestion]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(profile?.name ?? "Your Name").font(.title.bold())
                if let email = profile?.email { Text(email).font(.caption) }
                Divider()
                Text("SUMMARY").font(.caption.bold()).foregroundStyle(.secondary)
                Text(
                    suggestions.first(where: { $0.section == "summary" })?.afterText
                        ?? profile?.summary
                        ?? "\(targetTitle) candidate"
                )
                Divider()
                Text("SKILLS").font(.caption.bold()).foregroundStyle(.secondary)
                let promoted = suggestions.filter { $0.section == "skills" }.map(\.afterText)
                Text(
                    Array(Set(promoted + (profile?.skills.map(\.name) ?? [])))
                        .sorted()
                        .joined(separator: " • ")
                )
                Divider()
                Text("EXPERIENCE").font(.caption.bold()).foregroundStyle(.secondary)
                ForEach(profile?.experienceItems ?? []) { item in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.title).bold()
                        Text(item.company)
                        ForEach(item.bullets, id: \.self) { bullet in
                            Text("• \(bullet)").font(.caption)
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background)
        }
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
    }
}

struct ApplyConfirmView: View {
    @Environment(\.dismiss) private var dismiss
    let detail: JobDetail
    let versionCreated: Bool
    let canOpenListing: Bool
    let onCreateVersion: () async -> Void
    let onDownload: () async -> Void
    let onApply: () async -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Application") {
                    LabeledContent("Role", value: detail.title)
                    LabeledContent("Company", value: detail.company)
                    LabeledContent("Resume", value: versionCreated ? "Tailored version ready" : "Not saved yet")
                }
                Section {
                    Text("Opening the listing creates an “opened” tracker row. You still review and submit any custom screening questions on the employer’s official page.")
                        .foregroundStyle(.secondary)
                }
                if !versionCreated {
                    Button("Save tailored version") { Task { await onCreateVersion() } }
                }
                Button("Save version and download PDF") { Task { await onDownload() } }
                if canOpenListing {
                    Button("Open official application") { Task { await onApply() } }
                        .buttonStyle(.borderedProminent)
                } else {
                    Text("This pasted description has no external application URL.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Ready to apply?")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
