import Charts
import SwiftUI

struct ShowcaseCarousel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var page = 0
    private let pages = ["Sources", "Match mix", "Resume merge", "Tailoring", "Gmail"]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("A calmer way to hunt")
                .font(.largeTitle.bold())
            Text("Search licensed boards, drop roles that demand too many years, tailor from facts you already have, then approve before you apply.")
                .foregroundStyle(.secondary)
            TabView(selection: $page) {
                sources.tag(0)
                mix.tag(1)
                merge.tag(2)
                diff.tag(3)
                tracker.tag(4)
            }
            #if os(iOS)
            .tabViewStyle(.page(indexDisplayMode: .always))
            #endif
            .frame(minHeight: 280)
            HStack {
                ForEach(pages.indices, id: \.self) { index in
                    Capsule()
                        .fill(index == page ? Color.accentColor : Color.secondary.opacity(0.3))
                        .frame(width: index == page ? 18 : 8, height: 8)
                }
            }
        }
        .task {
            guard !reduceMotion else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(4))
                page = (page + 1) % pages.count
            }
        }
    }

    private var sources: some View {
        showcaseCard("Live sources") {
            VStack(alignment: .leading, spacing: 10) {
                labeled("Demo", "ready")
                labeled("Remotive", "loading")
                labeled("Remote OK", "queued")
            }
        }
    }

    private var mix: some View {
        showcaseCard("Easy / medium / reach") {
            Chart {
                SectorMark(angle: .value("Jobs", 8), innerRadius: .ratio(0.55)).foregroundStyle(.green)
                SectorMark(angle: .value("Jobs", 5), innerRadius: .ratio(0.55)).foregroundStyle(.orange)
                SectorMark(angle: .value("Jobs", 3), innerRadius: .ratio(0.55)).foregroundStyle(.red)
            }
            .frame(height: 140)
            HStack {
                Label("8 easy", systemImage: "circle.fill").foregroundStyle(.green)
                Label("5 medium", systemImage: "circle.fill").foregroundStyle(.orange)
                Label("3 reach", systemImage: "circle.fill").foregroundStyle(.red)
            }
            .font(.caption)
        }
    }

    private var merge: some View {
        showcaseCard("Resume merge") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Product Manager · Acme").font(.headline)
                Text("Launched analytics used by 20 customers").font(.subheadline)
                Text("Sources: Resume 2024.pdf, PM-short.docx")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var diff: some View {
        showcaseCard("Tailoring diff") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Lead with Product Manager while keeping claims grounded.")
                Text("+ Roadmaps · SQL · stakeholder management")
                    .foregroundStyle(.green)
                Text("Accept, reject, or edit before you apply.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var tracker: some View {
        showcaseCard("Gmail tracker") {
            VStack(alignment: .leading, spacing: 8) {
                Label("Acme · application received", systemImage: "checkmark.circle")
                Label("Northwind · interview invite", systemImage: "calendar")
                Text("Readonly Gmail. Tokens stay on the server.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func labeled(_ title: String, _ state: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(state).foregroundStyle(.secondary)
        }
        .padding(10)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }

    private func showcaseCard<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        GroupBox(title) {
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
        }
        .padding(.horizontal, 4)
    }
}
