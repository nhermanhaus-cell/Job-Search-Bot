# Job Hunt OS

Personal job-hunt tool: search many role types, drop postings that demand too many years, tailor a resume per job (Enhancv-style ATS keywords + human approve), then apply without silent bots.

**This repo is in the planning stage.** The implementation contract is [docs/PLAN.md](docs/PLAN.md).

## Why this exists

LinkedIn and Indeed make it hard to explore several backgrounds at once and even harder to hide “8+ years / Staff / Principal” noise. Enhancv is good at matching a pasted JD to a resume, but it is not a hunt + apply queue. This app is meant to be the daily loop for both.

## What v1 will do

- Multiple **search lenses** (interests / background explorations)
- Job ingest from **official APIs** (Adzuna, USAJobs, public Greenhouse / Lever / Ashby boards) — not LinkedIn/Indeed scrapers
- **Years and seniority filter** parsed from the job description
- **ATS score + keyword gap** against your master resume
- **Tasteful rewrite** from a fact inventory only; you accept, reject, or edit each change
- **Approve-then-send**: export PDF and open the official apply page (optional ATS submit later)

## What it will not do

Scrape or auto-click LinkedIn / Indeed Easy Apply. Those products ban unofficial bots and the applications are worse when a robot invents experience.

## Status

Design only. Next step after this plan is approved: Phase 0 skeleton (paste a JD, score it, no job APIs yet).
