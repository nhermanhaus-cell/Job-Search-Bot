import Charts
import JobHuntKit
import SwiftUI

@MainActor
public final class HuntStore: ObservableObject {
    @Published public var applications: [Application] = []
    @Published public var events: [MailEvent] = []
    @Published public var stats: ApplicationStats?
    @Published public var mailStatus: MailStatus?
    @Published public var error: String?

    private let client: APIClient

    public init(client: APIClient = APIClient()) {
        self.client = client
    }

    public func refresh() async {
        do {
            async let apps = client.applications()
            async let ev = client.events()
            async let st = client.stats()
            async let mail = client.mailStatus()
            applications = try await apps
            events = try await ev
            stats = try await st
            mailStatus = try await mail
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    public func syncMail() async {
        do {
            try await client.syncMail()
            await refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    public func review(_ event: MailEvent, action: String) async {
        do {
            try await client.review(eventId: event.id, action: action)
            await refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    public var connectURL: URL {
        get async {
            await client.connectGmailURL()
        }
    }
}

public struct TrackerView: View {
    @StateObject private var store = HuntStore()

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    mailCard
                    if let stats = store.stats {
                        ApplicationCharts(stats: stats)
                    }
                    pendingSection
                    applicationSection
                }
                .padding()
            }
            .navigationTitle("Hunt tracker")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Sync mail") {
                        Task { await store.syncMail() }
                    }
                }
            }
            .task { await store.refresh() }
        }
    }

    @ViewBuilder
    private var mailCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Gmail")
                .font(.headline)
            if let account = store.mailStatus?.accounts.first {
                Text(account.email)
                if let last = account.lastSyncAt {
                    Text("Last sync \(last.formatted())")
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("Connect Gmail on the backend so receipts, rejections, and interviews land here automatically.")
                    .foregroundStyle(.secondary)
                if let url = store.mailStatus.map({ _ in URL(string: "http://127.0.0.1:3000/api/mail/google/start") }) {
                    Link("Connect Gmail", destination: url!)
                }
            }
            if let model = store.mailStatus?.openaiModel {
                Text("Classifier: \(model)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let error = store.error {
                Text(error).foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var pendingSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Needs review")
                .font(.headline)
            let pending = store.events.filter { $0.reviewState == "pending" }
            if pending.isEmpty {
                Text("Nothing waiting.")
                    .foregroundStyle(.secondary)
            }
            ForEach(pending) { event in
                VStack(alignment: .leading) {
                    Text(event.classification).font(.caption.weight(.semibold))
                    Text(event.subject ?? "No subject")
                    Text(event.company ?? event.fromAddress ?? "")
                        .foregroundStyle(.secondary)
                    HStack {
                        Button("Confirm") { Task { await store.review(event, action: "confirm") } }
                        Button("Ignore") { Task { await store.review(event, action: "ignore") } }
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private var applicationSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Applications")
                .font(.headline)
            ForEach(store.applications) { app in
                HStack {
                    VStack(alignment: .leading) {
                        Text(app.company).font(.headline)
                        Text(app.jobTitle ?? "Role unknown")
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(app.status)
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.quaternary, in: Capsule())
                }
            }
        }
    }
}

public struct ApplicationCharts: View {
    public var stats: ApplicationStats

    public init(stats: ApplicationStats) {
        self.stats = stats
    }

    private var statusRows: [(String, Int)] {
        stats.byStatus.keys.sorted().compactMap { key in
            stats.byStatus[key].map { (key, $0) }
        }
    }

    private var classRows: [(String, Int)] {
        stats.byClassification.keys.sorted().compactMap { key in
            stats.byClassification[key].map { (key, $0) }
        }
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Pipeline")
                .font(.headline)
            Chart(statusRows, id: \.0) { row in
                BarMark(x: .value("Count", row.1), y: .value("Status", row.0))
            }
            .frame(height: 180)

            Text("Mail by type")
                .font(.headline)
            Chart(classRows, id: \.0) { row in
                SectorMark(angle: .value("Count", row.1), innerRadius: .ratio(0.55))
                    .foregroundStyle(by: .value("Type", row.0))
            }
            .frame(height: 200)
        }
    }
}
