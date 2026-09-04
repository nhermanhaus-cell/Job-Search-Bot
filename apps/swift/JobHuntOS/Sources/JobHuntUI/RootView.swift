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
            switch store.phase {
            case .bootstrapping:
                ProgressView("Restoring your session…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .unauthenticated:
                AuthLandingView()
            case .onboarding:
                OnboardingView()
            case .main:
                signedInShell
            }
        }
        .environmentObject(store)
        .task { await store.bootstrap() }
        .onOpenURL { url in
            _ = GoogleSignInCoordinator.handle(url)
        }
    }

    @ViewBuilder
    private var signedInShell: some View {
        Group {
            #if os(macOS)
            NavigationSplitView {
                List(AppDestination.allCases) { destination in
                    Button {
                        selection = destination
                    } label: {
                        Label(destination.rawValue, systemImage: destination.icon)
                    }
                    .buttonStyle(.plain)
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
