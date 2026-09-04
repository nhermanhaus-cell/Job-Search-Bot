import JobHuntKit
import SwiftUI

public struct HuntInboxView: View {
    @EnvironmentObject private var store: AppStore
    @State private var query = ""
    @State private var location = ""
    @State private var enabledSources = Set<String>()
    @State private var showSources = false
    @State private var selectedSource: String?
    @State private var hideOverYears = true

    public init() {}

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchControls
                sourceBar
                filterBar
                if store.jobs.isEmpty {
                    ContentUnavailableView(
                        "No matches yet",
                        systemImage: "briefcase",
                        description: Text("Choose a title and search. Sources fill this inbox independently.")
                    )
                } else {
                    List(filteredJobs) { job in
                        NavigationLink {
                            JobDetailView(jobID: job.id)
                        } label: {
                            JobRow(job: job)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Hunt")
            .task {
                if enabledSources.isEmpty {
                    enabledSources = Set(
                        store.serverSettings?.enabledSources
                            ?? store.sources.filter(\.configured).map(\.id)
                    )
                }
                if query.isEmpty {
                    query = store.profile?.titleInterests.first(where: \.pinned)?.title ?? ""
                    location = store.profile?.location ?? ""
                }
            }
            .sheet(isPresented: $showSources) {
                NavigationStack {
                    List(store.sources) { source in
                        Toggle(isOn: Binding(
                            get: { enabledSources.contains(source.id) },
                            set: { enabled in
                                if enabled { enabledSources.insert(source.id) }
                                else { enabledSources.remove(source.id) }
                            }
                        )) {
                            VStack(alignment: .leading) {
                                Text(source.name)
                                if !source.configured {
                                    Text("Needs API key").font(.caption).foregroundStyle(.orange)
                                }
                            }
                        }
                    }
                    .navigationTitle("Sources")
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showSources = false }
                        }
                    }
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    private var searchControls: some View {
        VStack(spacing: 8) {
            HStack {
                TextField("Job title", text: $query)
                    .textFieldStyle(.roundedBorder)
                TextField("Location", text: $location)
                    .textFieldStyle(.roundedBorder)
                Button {
                    Task {
                        await store.search(
                            query: query,
                            location: location,
                            enabledSources: Array(enabledSources)
                        )
                    }
                } label: {
                    if store.searchRunning { ProgressView() }
                    else { Label("Search", systemImage: "magnifyingglass") }
                }
                .buttonStyle(.borderedProminent)
                .disabled(query.isEmpty || enabledSources.isEmpty || store.searchRunning)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(store.profile?.titleInterests.filter(\.pinned) ?? []) { interest in
                        Button(interest.title) { query = interest.title }
                            .buttonStyle(.bordered)
                    }
                }
            }
        }
        .padding()
    }

    private var sourceBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                Button {
                    showSources = true
                } label: {
                    Label("Sources", systemImage: "slider.horizontal.3")
                }
                .buttonStyle(.bordered)
                ForEach(store.sourceStates.keys.sorted(), id: \.self) { source in
                    let state = store.sourceStates[source] ?? ""
                    Button {
                        selectedSource = selectedSource == source ? nil : source
                    } label: {
                        HStack(spacing: 4) {
                            if state == "loading" { ProgressView().controlSize(.small) }
                            Image(systemName: state == "error" ? "exclamationmark.triangle" : "circle.fill")
                                .font(.system(size: 7))
                            Text(source)
                            if let count = store.sourceCounts[source] { Text("\(count)") }
                        }
                        .font(.caption)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                        .background(
                            selectedSource == source ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.1),
                            in: Capsule()
                        )
                    }
                    .buttonStyle(.plain)
                }
                let pulling = store.sourceStates.filter { $0.value == "loading" || $0.value == "queued" }
                if !pulling.isEmpty {
                    Menu {
                        ForEach(pulling.keys.sorted(), id: \.self) { source in
                            Label(source, systemImage: "clock")
                        }
                    } label: {
                        Label("Still pulling (\(pulling.count))", systemImage: "arrow.triangle.2.circlepath")
                    }
                }
            }
            .padding(.horizontal)
        }
        .padding(.bottom, 8)
    }

    private var filterBar: some View {
        HStack {
            Button("All") {
                store.selectedDifficulty = nil
                Task { await store.refreshJobs() }
            }
            ForEach(Difficulty.allCases, id: \.self) { difficulty in
                Button(difficulty.rawValue.capitalized) {
                    store.selectedDifficulty = difficulty
                    Task { await store.refreshJobs() }
                }
                .tint(color(difficulty))
            }
            Toggle("Within years cap", isOn: $hideOverYears)
                .toggleStyle(.button)
            Spacer()
            Text("\(filteredJobs.count) jobs").foregroundStyle(.secondary)
        }
        .buttonStyle(.bordered)
        .padding(.horizontal)
        .padding(.bottom, 6)
    }

    private var filteredJobs: [Job] {
        store.jobs.filter { job in
            let sourceMatch = selectedSource.map { selected in
                job.provider == selected
                    || (job.sources?.contains { $0.provider == selected } ?? false)
            } ?? true
            let yearMatch: Bool
            if hideOverYears,
               let cap = store.profile?.maxYearsRequired,
               let required = job.requirements?.minYears {
                yearMatch = required <= cap
            } else {
                yearMatch = true
            }
            return sourceMatch && yearMatch
        }
    }
}

private struct JobRow: View {
    let job: Job

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(job.title).font(.headline)
                Spacer()
                if let match = job.match {
                    BandPill(
                        difficulty: Difficulty(rawValue: match.effectiveDifficulty ?? match.difficulty) ?? .reach,
                        score: match.score
                    )
                }
            }
            Text(job.company)
            HStack {
                Label(job.location ?? "Location unknown", systemImage: "mappin.and.ellipse")
                Spacer()
                Text(job.provider).foregroundStyle(.secondary)
            }
            .font(.caption)
            if let explanation = job.match?.explanation {
                Text(explanation).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .padding(.vertical, 5)
    }
}

struct BandPill: View {
    let difficulty: Difficulty
    var score: Int?

    var body: some View {
        Text(score.map { "\(difficulty.rawValue.capitalized) · \($0)" } ?? difficulty.rawValue.capitalized)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color(difficulty).opacity(0.16), in: Capsule())
            .foregroundStyle(color(difficulty))
    }
}

func color(_ difficulty: Difficulty) -> Color {
    switch difficulty {
    case .easy: .green
    case .medium: .orange
    case .reach: .purple
    }
}
