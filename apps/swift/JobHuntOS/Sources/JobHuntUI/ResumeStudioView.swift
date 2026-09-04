import JobHuntKit
import SwiftUI
import UniformTypeIdentifiers

public struct ResumeStudioView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showImporter = false
    @State private var showPasteJob = false
    @State private var newTitle = ""
    @State private var newSkill = ""
    @State private var selectedExperience: ExperienceItem?

    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                Section {
                    if let profile = store.profile {
                        LabeledContent("Name", value: profile.name ?? "Not set")
                        LabeledContent("Location", value: profile.location ?? "Not set")
                        if let summary = profile.summary {
                            Text(summary).foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text("Master profile")
                }

                Section {
                    Button("Upload more resumes") { showImporter = true }
                    Button("Score a pasted job description") { showPasteJob = true }
                    ForEach(store.profile?.resumeDocuments ?? []) { document in
                        Label(document.fileName, systemImage: "doc")
                    }
                } header: {
                    Text("Source documents")
                }

                Section {
                    HStack {
                        TextField("Add a job title", text: $newTitle)
                        Button("Add") {
                            let value = newTitle
                            newTitle = ""
                            Task { await store.addTitle(value) }
                        }
                    }
                    ForEach(store.profile?.titleInterests ?? []) { interest in
                        Toggle(
                            isOn: Binding(
                                get: { interest.pinned },
                                set: { value in Task { await store.setTitle(interest, pinned: value) } }
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
                } header: {
                    Text("Role interests")
                }

                Section("Experience inventory") {
                    ForEach(store.profile?.experienceItems ?? []) { item in
                        Button {
                            selectedExperience = item
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(item.title).font(.headline)
                                Text(item.company)
                                ForEach(item.bullets, id: \.self) { bullet in
                                    Text("• \(bullet)").font(.caption).foregroundStyle(.secondary)
                                }
                                Text("From \(item.sourceDocumentIds.count) resume(s)")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }

                Section("Skills") {
                    HStack {
                        TextField("Add a skill", text: $newSkill)
                        Button("Add") {
                            let value = newSkill
                            newSkill = ""
                            Task {
                                try? await store.client.addSkill(value)
                                store.profile = try? await store.client.profile()
                            }
                        }
                        .disabled(newSkill.isEmpty)
                    }
                    FlowLayout {
                        ForEach(store.profile?.skills ?? []) { skill in
                            Text(skill.name)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(.quaternary, in: Capsule())
                                .contextMenu {
                                    Button("Delete", role: .destructive) {
                                        Task {
                                            try? await store.client.deleteSkill(id: skill.id)
                                            store.profile = try? await store.client.profile()
                                        }
                                    }
                                }
                        }
                    }
                }
            }
            .navigationTitle("Resume")
            .fileImporter(
                isPresented: $showImporter,
                allowedContentTypes: [.pdf, .plainText, .data],
                allowsMultipleSelection: true
            ) { result in
                guard case let .success(urls) = result else { return }
                Task { await store.uploadResumes(urls) }
            }
            .sheet(isPresented: $showPasteJob) {
                PasteJobView(isPresented: $showPasteJob)
                    .environmentObject(store)
            }
            .sheet(item: $selectedExperience) { item in
                ExperienceEditor(item: item)
                    .environmentObject(store)
            }
        }
    }
}

private struct ExperienceEditor: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let item: ExperienceItem
    @State private var title: String
    @State private var company: String
    @State private var bullets: String

    init(item: ExperienceItem) {
        self.item = item
        _title = State(initialValue: item.title)
        _company = State(initialValue: item.company)
        _bullets = State(initialValue: item.bullets.joined(separator: "\n"))
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)
                TextField("Company", text: $company)
                TextField("One fact per line", text: $bullets, axis: .vertical)
                    .lineLimit(8 ... 20)
            }
            .navigationTitle("Edit experience")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            try? await store.client.updateExperience(
                                id: item.id,
                                company: company,
                                title: title,
                                bullets: bullets.split(separator: "\n").map(String.init)
                            )
                            store.profile = try? await store.client.profile()
                            dismiss()
                        }
                    }
                }
            }
        }
    }
}

private struct PasteJobView: View {
    @EnvironmentObject private var store: AppStore
    @Binding var isPresented: Bool
    @State private var title = ""
    @State private var company = ""
    @State private var description = ""
    @State private var createdJob: Job?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Job title", text: $title)
                TextField("Company", text: $company)
                TextField("Paste the full job description", text: $description, axis: .vertical)
                    .lineLimit(12 ... 24)
                if let job = createdJob {
                    Section("Match") {
                        Text(job.match?.explanation ?? "Open the job for full analysis.")
                        if let match = job.match {
                            BandPill(
                                difficulty: Difficulty(rawValue: match.difficulty) ?? .reach,
                                score: match.score
                            )
                        }
                        NavigationLink("Open full analysis") {
                            JobDetailView(jobID: job.id)
                        }
                    }
                }
            }
            .navigationTitle("Score a job")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Analyze") {
                        Task {
                            createdJob = try? await store.client.pasteJob(
                                title: title,
                                company: company,
                                description: description
                            )
                            await store.refreshJobs()
                        }
                    }
                    .disabled(title.isEmpty || description.isEmpty)
                }
            }
        }
    }
}

private struct FlowLayout: Layout {
    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let maxWidth = proposal.width ?? 320
        var width: CGFloat = 0
        var height: CGFloat = 0
        var lineHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if width + size.width > maxWidth {
                width = 0
                height += lineHeight + 6
                lineHeight = 0
            }
            width += size.width + 6
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: maxWidth, height: height + lineHeight)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        var point = bounds.origin
        var lineHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if point.x + size.width > bounds.maxX {
                point.x = bounds.minX
                point.y += lineHeight + 6
                lineHeight = 0
            }
            view.place(at: point, proposal: ProposedViewSize(size))
            point.x += size.width + 6
            lineHeight = max(lineHeight, size.height)
        }
    }
}
