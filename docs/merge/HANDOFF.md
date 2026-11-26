BATON: Claude — Phase 0 build in progress — 2026-11-26

# Unified app merge — handoff

Read this file and [PLAN.md](PLAN.md) before doing anything. Trust these files,
not chat history. Keep this file current after every commit.

## Purpose

Merge the WhatsApp report app, the email reports prototype and the customer
survey preview into one app, in phases 0–6 (see PLAN.md). Phase 0 records the
"before" state so later phases can prove they changed no output.

## Rules (condensed)

- Only the baton holder pushes. Fetch and check the baton line before pushing;
  set the next holder in your last commit.
- Push only to `integration/unified-app`. Never push to `main` or
  `feature/daily-pivot-email-report`. No PRs opened, merged or closed.
- Never rewrite history: no force-push, rebase, or amend of pushed commits.
- Phase 0 changes only `docs/merge/**` and `scripts/golden/**`.
- Fictional data only. If sensitive data is found in Git history, stop and
  report it.
- Business rules stay separate per tool. Suspected bugs are recorded here,
  not fixed, during Phase 0.

## Branch and tags

- Working branch: `integration/unified-app`, created from `main` at
  `1a74ff4`.
- Tags: `pre-merge/main-1a74ff4` → `1a74ff4`;
  `pre-merge/email-3fcc777` → `3fcc777`.
- Phase 0 reads the email tool through a separate worktree pinned to
  `3fcc777`. That branch is not merged in Phase 0.

## Roles

Codex was unavailable, so the owner asked Claude to lead Phase 0 as the
builder. The independent review is open: Codex (when available) or the owner.

## Phase checklist

- [ ] **Phase 0 — Freeze and baseline**
  - [x] Step 1: branch, tags, PLAN.md, HANDOFF.md
  - [ ] Step 2: baseline test counts (BASELINE.md)
  - [ ] Step 3: storage inventory and fixtures
  - [ ] Step 4: goldens (WhatsApp, email, survey) and determinism check
  - [ ] Step 5: handover
- [ ] Phase 1 — merge feature branch, self-contained deploy
- [ ] Phase 2 — shared app frame
- [ ] Phase 3 — email tool into the app (3a, 3b, 3c)
- [ ] Phase 4 — survey tool into the app
- [ ] Phase 5 — one upload, one Clear all data, one settings backup
- [ ] Phase 6 — hardening and switch-over

## Open owner decisions

D1–D6 as listed in PLAN.md. Not yet answered.

## Notes for next agent

(Updated at the end of each step.)

## Commit log

| Date | Commit | Summary |
|---|---|---|
