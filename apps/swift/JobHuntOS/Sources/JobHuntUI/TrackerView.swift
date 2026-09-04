import Charts
import JobHuntKit
import SwiftUI

public struct TrackerView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    mailCard
                    if let stats = store.applicationStats {
                        ApplicationCharts(stats: stats)
                    }
                    pendingSection
                    applicationSection
                }
                .padding()
            }
            .navigationTitle("Tracker")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await store.syncMail() }
                    } label: {
                        Label("Sync mail", systemImage: "arrow.clockwise")
                    }
                    .disabled(store.mailStatus?.accounts.isEmpty ?? true)
                }
            }
            .refreshable { await store.refresh() }
        }
    }

    private var mailCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Gmail tracker", systemImage: "envelope.badge")
                    .font(.headline)
                Spacer()
                Text(store.mailStatus?.openaiModel ?? "Rules")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let account = store.mailStatus?.accounts.first {
                Text(account.email)
                if let last = account.lastSyncAt {
                    Text("Last sync \(last.formatted())")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("Connect Gmail so receipts, rejections, and interview requests update this tracker.")
                    .foregroundStyle(.secondary)
                Button("Connect Gmail") {
                    Task { openURL(await store.client.connectGmailURL()) }
                }
                .buttonStyle(.borderedProminent)
            }
            if let error = store.error {
                Text(error).font(.caption).foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var pendingSection: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Needs review").font(.title2.bold())
            let pending = store.mailEvents.filter { $0.reviewState == "pending" }
            if pending.isEmpty {
                Text("No uncertain mail events.").foregroundStyle(.secondary)
            }
            ForEach(pending) { event in
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text(event.classification.replacingOccurrences(of: "_", with: " ").capitalized)
                            .font(.caption.bold())
                        Text("\(Int(event.confidence * 100))%").font(.caption).foregroundStyle(.secondary)
                    }
                    Text(event.subject ?? "No subject").font(.headline)
                    Text(event.company ?? event.fromAddress ?? "").foregroundStyle(.secondary)
                    HStack {
                        Button("Confirm") { Task { await store.review(event, action: "confirm") } }
                        Button("Ignore") { Task { await store.review(event, action: "ignore") } }
                    }
                    .buttonStyle(.bordered)
                }
                .padding()
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private var applicationSection: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Applications").font(.title2.bold())
            if store.applications.isEmpty {
                Text("Applications created in the app or discovered in Gmail appear here.")
                    .foregroundStyle(.secondary)
            }
            ForEach(store.applications) { app in
                HStack {
                    VStack(alignment: .leading) {
                        Text(app.company).font(.headline)
                        Text(app.jobTitle ?? "Role unknown").foregroundStyle(.secondary)
                    }
                    Spacer()
                    Menu(app.status.capitalized) {
                        ForEach(["queued", "opened", "submitted", "interview", "offer", "rejected", "closed"], id: \.self) { status in
                            Button(status.capitalized) {
                                Task {
                                    try? await store.client.updateApplication(id: app.id, status: status)
                                    await store.refresh()
                                }
                            }
                        }
                    }
                    .font(.caption.bold())
                }
                .padding(.vertical, 4)
            }
        }
    }
}

public struct ApplicationCharts: View {
    public var stats: ApplicationStats

    public init(stats: ApplicationStats) {
        self.stats = stats
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Application funnel").font(.title2.bold())
            Chart(stats.byStatus.keys.sorted(), id: \.self) { status in
                BarMark(
                    x: .value("Count", stats.byStatus[status] ?? 0),
                    y: .value("Status", status.capitalized)
                )
            }
            .frame(height: 180)

            if let series = stats.series, !series.isEmpty {
                Text("Applications over time").font(.headline)
                Chart(series) { day in
                    LineMark(
                        x: .value("Date", day.date),
                        y: .value("Applications", day.applications)
                    )
                    PointMark(
                        x: .value("Date", day.date),
                        y: .value("Applications", day.applications)
                    )
                }
                .frame(height: 170)
            }

            if !stats.byClassification.isEmpty {
                Text("Recruiting mail").font(.headline)
                Chart(stats.byClassification.keys.sorted(), id: \.self) { type in
                    SectorMark(
                        angle: .value("Count", stats.byClassification[type] ?? 0),
                        innerRadius: .ratio(0.55)
                    )
                    .foregroundStyle(by: .value("Type", type.replacingOccurrences(of: "_", with: " ")))
                }
                .frame(height: 190)
            }
        }
    }
}
