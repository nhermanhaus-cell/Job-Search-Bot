# Job Hunt OS — SwiftUI app

The full product surface is implemented in SwiftUI:

- Showcase landing with Get Started / Log In (Apple and Google)
- iPhone: Home, Hunt, Resume, Tracker, Settings tabs
- Mac: the same destinations in a sidebar
- Multi-resume onboarding and role-title suggestions
- Source-by-source SSE search (authorized)
- Full JD requirements, fit score, easy / medium / reach
- Resume edit suggestions and application handoff
- Swift Charts and optional Gmail tracker
- User-scoped SwiftData snapshots and Keychain sessions

`JobHuntKit` contains API models/client. `JobHuntUI` contains the adaptive app. `JobHuntApp` is the `@main` target.

## Open on a Mac

Install XcodeGen, then:

```bash
cd apps/swift/JobHuntOS
xcodegen generate
open JobHuntOS.xcodeproj
```

Enable Sign in with Apple on the App IDs `com.jobhuntos.app` and `com.jobhuntos.mac`. Set `GOOGLE_IOS_CLIENT_ID` for Google Sign-In. Release builds use `https://job-hunt-os.fly.dev`; debug builds default to `http://localhost:3000`.

Start the backend first (Postgres + `npm run dev` and `npm run dev:worker`).

Gmail OAuth, provider keys, AI parsing/classification, and job search workers stay on the backend. The Apple app only receives scoped JSON and SSE events. Tokens live in the Keychain; switching accounts clears that user’s SwiftData cache.


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

The default URL is `http://localhost:3000`. On a physical iPhone, set the backend URL in Settings to an HTTPS server or your Mac’s `.local` hostname. The XcodeGen project enables local-network access for development.

Gmail OAuth, provider keys, AI parsing/classification, and job search workers stay on the backend. The Apple app only receives scoped JSON and SSE events.
