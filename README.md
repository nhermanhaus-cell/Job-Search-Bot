# Job Hunt OS

Backend-powered job hunt with a SwiftUI client: ingest one or more resumes, suggest and type job titles, run source searches **on the server**, sync listings to the app (clickable as each source lands), chart applications and easy/medium/reach matches, read each JD for hidden requirements, suggest resume edits, then apply after you approve.

**Planning stage.** Implementation contract: [docs/PLAN.md](docs/PLAN.md).

## Why this exists

Job boards make it hard to explore several backgrounds at once and to see the shape of the hunt (volume, difficulty, pipeline). Enhancv is strong at keyword tailoring; this app is the daily hunt + match + charts + edit + apply loop around that.

## What v1 will do

- **Intake** from multiple uploaded resumes → merged background, suggested titles, plus titles you type
- **Backend search** across a wide catalog (Google-for-Jobs style, Adzuna, USAJobs, ATS boards, remote/startup/specialty, RSS, paste)
- **Sustainable delivery** to Swift: standing queries on a schedule, cursor sync, live SSE for on-demand search, optional APNs
- **Progressive results** in-app: loading icon + dropdown of sources still pulling; each job is a link as soon as that source returns
- **Swift Charts:** applications tracker, new matching jobs over time, easy / medium / reach breakdown
- **Deep JD read** + LinkedIn-style match with a why-line
- **Suggested edits** from the merged inventory; approve-then-send

## Status

Design only. Next implementation step: Phase 0 — multi-resume intake, title suggestions, paste-a-JD match, chart shells.
