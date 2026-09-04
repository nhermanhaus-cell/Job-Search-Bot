# Job Hunt OS — SwiftUI app

Open this folder on a Mac. You can preview screens in the Xcode canvas, run on your Mac, or generate an iPhone project.

## Fastest: open in Xcode

**Option A — double-click** `Open-in-Xcode.command` in Finder  
(`apps/swift/JobHuntOS/Open-in-Xcode.command`)

That installs XcodeGen if needed, generates `JobHuntOS.xcodeproj`, and opens it. Then:

1. Select the **JobHuntOS-iOS** scheme (top-left).
2. Pick an **iPhone simulator**.
3. Press **Run** (⌘R).

**Option B — Package.swift (Mac app, no XcodeGen)**

```bash
open apps/swift/JobHuntOS/Package.swift
```

Select the **JobHuntOSApp** scheme, destination **My Mac**, press Run.

**Option C — terminal**

```bash
cd apps/swift/JobHuntOS
brew install xcodegen   # once
xcodegen generate
open JobHuntOS.xcodeproj
```

The first screen is the showcase landing (Get Started / Log In). You do not need the backend to *see* that UI. Sign-in, hunt, and resume upload need the API at `http://localhost:3000` in Debug.

## SwiftUI Previews

Open `Auth/AuthLandingView.swift` or `RootView.swift` and press **⌥⌘↩** (Editor → Canvas) to see the landing and shell without running.

## Signing

Xcode will ask for your Personal Team. Use Automatic signing. Enable **Sign in with Apple** on App IDs `com.jobhuntos.app` / `com.jobhuntos.mac` when you want Apple login. Google Sign-In needs a `GIDClientID` in the Info plist; until then Apple still works and Google shows a setup error.

## Backend (for data, not for viewing UI)

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```
