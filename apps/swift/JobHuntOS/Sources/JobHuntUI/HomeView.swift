import Charts
import JobHuntKit
import SwiftUI

public struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    let onNavigate: (AppDestination) -> Void

    public init(onNavigate: @escaping (AppDestination) -> Void) {
        self.onNavigate = onNavigate
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    greeting
                    if let stats = store.jobStats {
                        matchSummary(stats)
                        incomingChart(stats)
                    }
                    if let stats = store.applicationStats {
                        applicationSummary(stats)
                    }
                    if store.jobStats == nil, store.applicationStats == nil {
                        ContentUnavailableView(
                            "Your hunt dashboard",
                            systemImage: "chart.xyaxis.line",
                            description: Text("Upload resumes and search to start filling these charts.")
                        )
                    }
                }
                .padding()
            }
            .navigationTitle("Home")
            .refreshable { await store.refresh() }
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Good hunting\(store.profile?.name.map { ", \($0)" } ?? "")")
                .font(.largeTitle.bold())
            Text("Fresh matches, application movement, and the next useful action.")
                .foregroundStyle(.secondary)
        }
    }

    private func matchSummary(_ stats: JobStats) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("New matches").font(.title2.bold())
                Spacer()
                Button("Open inbox") { onNavigate(.hunt) }
            }
            HStack {
                ForEach(Difficulty.allCases, id: \.self) { difficulty in
                    Button {
                        store.selectedDifficulty = difficulty
                        onNavigate(.hunt)
                        Task { await store.refreshJobs() }
                    } label: {
                        VStack(alignment: .leading) {
                            Text("\(stats.difficulty[difficulty])")
                                .font(.title.bold())
                            Text(difficulty.rawValue.capitalized)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(color(difficulty).opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
            Chart(Difficulty.allCases, id: \.self) { difficulty in
                SectorMark(
                    angle: .value("Jobs", stats.difficulty[difficulty]),
                    innerRadius: .ratio(0.55)
                )
                .foregroundStyle(by: .value("Difficulty", difficulty.rawValue.capitalized))
            }
            .frame(height: 190)
            .contentShape(Rectangle())
            .onTapGesture { onNavigate(.hunt) }
        }
    }

    private func incomingChart(_ stats: JobStats) -> some View {
        VStack(alignment: .leading) {
            Text("New jobs by day").font(.title2.bold())
            Chart {
                ForEach(stats.series) { day in
                    BarMark(
                        x: .value("Date", day.date),
                        y: .value("Easy", day.easy)
                    )
                    .foregroundStyle(by: .value("Difficulty", "Easy"))
                    BarMark(
                        x: .value("Date", day.date),
                        y: .value("Medium", day.medium)
                    )
                    .foregroundStyle(by: .value("Difficulty", "Medium"))
                    BarMark(
                        x: .value("Date", day.date),
                        y: .value("Reach", day.reach)
                    )
                    .foregroundStyle(by: .value("Difficulty", "Reach"))
                }
            }
            .chartYAxisLabel("Jobs")
            .frame(height: 230)
            .contentShape(Rectangle())
            .onTapGesture { onNavigate(.hunt) }
        }
    }

    private func applicationSummary(_ stats: ApplicationStats) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Application pipeline").font(.title2.bold())
                Spacer()
                Button("Open tracker") { onNavigate(.tracker) }
            }
            Chart(stats.byStatus.keys.sorted(), id: \.self) { status in
                BarMark(
                    x: .value("Count", stats.byStatus[status] ?? 0),
                    y: .value("Status", status.capitalized)
                )
            }
            .frame(height: 200)
            .contentShape(Rectangle())
            .onTapGesture { onNavigate(.tracker) }
        }
    }
}
