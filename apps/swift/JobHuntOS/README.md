# Job Hunt OS — SwiftUI client

Swift package (`JobHuntKit` + `JobHuntUI`) that talks to the backend at `http://127.0.0.1:3000`.

Gmail OAuth and classification run on the backend. This target only syncs applications, mail events, and charts.

## Open in Xcode

1. Start the backend (`cd backend && npm run dev`).
2. File → New → Project → App (iOS 17+ or macOS 14+).
3. Add this package (File → Add Package Dependencies → Add Local).
4. Set the app entry to wrap `TrackerView()` from `JobHuntUI`.

```swift
import JobHuntUI
import SwiftUI

@main
struct JobHuntOSApp: App {
    var body: some Scene {
        WindowGroup {
            TrackerView()
        }
    }
}
```

On iOS Simulator, `127.0.0.1` is the simulator itself. Point `APIClient` at your Mac’s LAN IP, or use the backend dashboard in Safari for Connect Gmail.

App Transport Security: allow local networking (`NSAllowsLocalNetworking`) if you keep HTTP.
