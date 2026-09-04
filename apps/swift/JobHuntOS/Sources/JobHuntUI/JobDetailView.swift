import JobHuntKit
import SwiftUI

public struct JobDetailView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL
    public let jobID: String
    @State private var detail: JobDetail?
    @State private var loading = true

    public init(jobID: String) {
        self.jobID = jobID
    }

    public var body: some View {
        Group {
            if let detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header(detail)
                        matchCard(detail)
                        requirementCard(detail.requirements)
                        tailoringCard(detail)
                        GroupBox("Full description") {
                            Text(detail.description)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .textSelection(.enabled)
                        }
                    }
                    .padding()
                    .frame(maxWidth: 900)
                }
            } else if loading {
                ProgressView("Reading the full job description…")
            } else {
                ContentUnavailableView("Job unavailable", systemImage: "exclamationmark.triangle")
            }
        }
        .navigationTitle(detail?.company ?? "Job")
        .task { await load() }
    }

    private func header(_ job: JobDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(job.title).font(.largeTitle.bold())
            Text(job.company).font(.title3)
            HStack {
                Label(job.location ?? "Unknown", systemImage: "mappin")
                if let salary = job.salaryText { Text(salary) }
                Spacer()
                Button("Open listing") {
                    Task {
                        try? await store.client.trackApply(jobId: jobID)
                        if let url = URL(string: job.listingUrl) { openURL(url) }
                        await store.refresh()
                    }
                }
                .buttonStyle(.borderedProminent)
                Button("Hide") {
                    Task {
                        try? await store.client.updateMatch(jobId: jobID, difficulty: nil, hidden: true)
                        await store.refreshJobs()
                    }
                }
                .buttonStyle(.bordered)
            }
        }
    }

    @ViewBuilder
    private func matchCard(_ job: JobDetail) -> some View {
        if let match = job.matches.first {
            GroupBox("Your match") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        BandPill(
                            difficulty: Difficulty(
                                rawValue: match.effectiveDifficulty ?? match.difficulty
                            ) ?? .reach,
                            score: match.score
                        )
                        Text(match.explanation).foregroundStyle(.secondary)
                    }
                    if let breakdown = match.breakdown {
                        ForEach(breakdown.keys.sorted(), id: \.self) { key in
                            HStack {
                                Text(key.capitalized).frame(width: 90, alignment: .leading)
                                ProgressView(value: Double(breakdown[key] ?? 0), total: 100)
                                Text("\(breakdown[key] ?? 0)%").monospacedDigit()
                            }
                        }
                    }
                    Menu("Override difficulty") {
                        ForEach(Difficulty.allCases, id: \.self) { difficulty in
                            Button(difficulty.rawValue.capitalized) {
                                Task {
                                    try? await store.client.updateMatch(
                                        jobId: jobID,
                                        difficulty: difficulty
                                    )
                                    await load()
                                    await store.refreshJobs()
                                }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func requirementCard(_ req: JobRequirements) -> some View {
        GroupBox("Requirements we found") {
            VStack(alignment: .leading, spacing: 10) {
                LabeledContent("Experience", value: req.minYears.map { "\($0)+ years" } ?? "Not stated")
                LabeledContent("Level", value: req.seniority.capitalized)
                if !req.requiredSkills.isEmpty {
                    LabeledContent("Skills", value: req.requiredSkills.joined(separator: ", "))
                }
                if let authorization = req.workAuthorization {
                    Label(authorization, systemImage: "person.text.rectangle")
                }
                if let degree = req.degree { Label(degree, systemImage: "graduationcap") }
                if let travel = req.travel { Label(travel, systemImage: "airplane") }
                ForEach(req.impliedRequirements, id: \.self) { requirement in
                    Label(requirement, systemImage: "eye")
                        .foregroundStyle(.orange)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func tailoringCard(_ job: JobDetail) -> some View {
        GroupBox("Suggested resume edits") {
            VStack(alignment: .leading, spacing: 12) {
                Text("\(job.suggestions.count) grounded changes are ready for review.")
                    .foregroundStyle(.secondary)
                NavigationLink {
                    TailorReviewView(jobID: jobID)
                } label: {
                    Label("Review, preview, and apply", systemImage: "wand.and.stars")
                }
                .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func load() async {
        loading = true
        detail = try? await store.client.job(id: jobID)
        loading = false
    }
}

struct SuggestionRow: View {
    let suggestion: EditSuggestion
    let onDecision: (String, String?) -> Void
    @State private var editing = false
    @State private var text = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(suggestion.section.capitalized).font(.caption.bold())
                Text(suggestion.status).font(.caption).foregroundStyle(.secondary)
            }
            if let before = suggestion.beforeText {
                Text(before).strikethrough().foregroundStyle(.secondary)
            }
            if editing {
                TextField("Suggested text", text: $text, axis: .vertical)
                HStack {
                    Button("Save") { onDecision("accepted", text); editing = false }
                    Button("Cancel") { editing = false }
                }
            } else {
                Text(suggestion.afterText)
                Text(suggestion.rationale).font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button("Accept") { onDecision("accepted", nil) }
                    Button("Edit") { text = suggestion.afterText; editing = true }
                    Button("Reject") { onDecision("rejected", nil) }
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }
}
