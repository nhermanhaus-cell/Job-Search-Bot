# Job Hunt OS — SwiftUI app

The full product surface is implemented in SwiftUI:

- iPhone: Home, Hunt, Resume, Tracker, Settings tabs
- Mac: the same destinations in a sidebar
- Multi-resume onboarding and role-title suggestions
- Source-by-source SSE search
- Full JD requirements, fit score, easy / medium / reach
- Resume edit suggestions and application handoff
- Swift Charts and Gmail tracker
- SwiftData offline snapshots

`JobHuntKit` contains API models/client. `JobHuntUI` contains the adaptive app. `JobHuntApp` is the `@main` target.

## Open on a Mac

Install XcodeGen, then:

```bash
cd apps/swift/JobHuntOS
xcodegen generate
open JobHuntOS.xcodeproj
```

Or open `Package.swift` directly to run the macOS executable.

Start the backend first:

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev
```

The default URL is `http://127.0.0.1:3000`. On a physical iPhone, set the backend URL in Settings to the server or Mac LAN address. The XcodeGen project enables local HTTP networking for development.

Gmail OAuth, provider keys, AI parsing/classification, and job search workers stay on the backend. The Apple app only receives scoped JSON and SSE events.
