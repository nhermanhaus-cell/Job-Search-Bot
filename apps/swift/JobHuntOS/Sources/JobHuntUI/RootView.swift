import SwiftUI

public enum AppDestination: String, CaseIterable, Identifiable {
    case home = "Home"
    case hunt = "Hunt"
    case resume = "Resume"
    case tracker = "Tracker"
    case settings = "Settings"

    public var id: String { rawValue }

    var icon: String {
        switch self {
        case .home: "chart.xyaxis.line"
        case .hunt: "briefcase"
        case .resume: "doc.text"
        case .tracker: "checklist"
        case .settings: "gearshape"
        }
    }
}

public struct RootView: View {
    @StateObject private var store = AppStore()
    @State private var selection: AppDestination = .home

    public init() {}

    public var body: some View {
        Group {
            #if os(macOS)
            NavigationSplitView {
                List(AppDestination.allCases, selection: $selection) { destination in
                    Label(destination.rawValue, systemImage: destination.icon)
                        .tag(destination)
                }
                .navigationTitle("Job Hunt OS")
            } detail: {
                destination(selection)
            }
            #else
            TabView(selection: $selection) {
                ForEach(AppDestination.allCases) { destination in
                    self.destination(destination)
                        .tabItem { Label(destination.rawValue, systemImage: destination.icon) }
                        .tag(destination)
                }
            }
            #endif
        }
        .environmentObject(store)
        .task { await store.refresh() }
        .fullScreenCover(
            isPresented: Binding(
                get: { store.profile.map { !$0.onboardingDone } ?? false },
                set: { _ in }
            )
        ) {
            OnboardingView()
                .environmentObject(store)
        }
    }

    @ViewBuilder
    private func destination(_ destination: AppDestination) -> some View {
        switch destination {
        case .home: HomeView(onNavigate: { selection = $0 })
        case .hunt: HuntInboxView()
        case .resume: ResumeStudioView()
        case .tracker: TrackerView()
        case .settings: SettingsView()
        }
    }
}
