# Job Hunt OS

Personal job-hunt tool: ingest one or more resumes, suggest and type job titles, stream listings **source by source** (clickable as they land), read each JD for hidden requirements, match like LinkedIn, suggest resume edits, then apply after you approve.

**Planning stage.** Implementation contract: [docs/PLAN.md](docs/PLAN.md).

## Why this exists

Job boards make it hard to explore several backgrounds at once, to see every source at once, and to notice requirements buried in the prose. Enhancv is strong at keyword tailoring; this app is the daily hunt + match + edit + apply loop around that.

## What v1 will do

- **Intake** from multiple uploaded resumes → merged background, suggested titles, plus titles you type
- **Wide sources** in parallel: Google-for-Jobs style (Indeed, LinkedIn, Glassdoor, ZipRecruiter), Adzuna, USAJobs, ATS boards (Greenhouse, Lever, Ashby, Workday, …), remote/startup/specialty boards, RSS, paste
- **Progressive results:** loading icon + dropdown of sources still pulling; each job is a link as soon as that source returns
- **Deep JD read** for hidden/implied requirements (years, visa, on-call, “remote” that is not remote, lead-without-the-title)
- **LinkedIn-style match** with a why-line, not a mystery score
- **Suggested edits** from the merged inventory; accept / reject / edit
- **Approve-then-send** with the live listing URL always available

Years filters and source toggles are preferences, not locks.

## Status

Design only. Next implementation step: Phase 0 — multi-resume intake, title suggestions, paste-a-JD match + edit suggestions.
