# CLAUDE.md — read before doing anything in this repo

This file loads automatically at the start of every session. It records the
repo's configuration, safety posture, and release rules so they don't have to be
re-explained each time. It is authoritative for this repo. The machine-wide
`~/.claude/CLAUDE.md` still applies; a conflict is resolved in favour of the more
specific rule stated here.

BasketCompass follows the Compass-family rules, held at **IEC 62304 software
safety class A** rigor — the lowest class (no injury possible from a failure).
The governance shape mirrors the stricter Compass repos, but the enforced gates
are lighter. Where a rule below says "guidance" rather than "enforced", it is a
default to follow, not a build-breaking check.

This repository is **PUBLIC**. Treat everything committed as published to the
world. Nothing confidential — no secrets, keys, client data, or internal
correspondence — ever reaches a commit.

## Start of session
1. Read `_directives/SESSION_STATE.md` first — the working handoff; it names the
   next task.
2. Then read `GOVERNANCE.md` (git-ignored, internal) for the full rules.
3. Both are git-ignored and never published. Do not commit their contents.
   Commit messages and PRs may reference `D-NNN` / `R-NNN` by number only.

## Git — non-negotiable (same as every Compass repo)
- Author and committer are always `Rajeev Yadav <rajeevyadav@gmail.com>`. Never
  pass `--author`, never commit under another identity.
- Every commit and tag is GPG-signed with key `5292F5975422A392`. Never bypass
  with `--no-gpg-sign` or `-c commit.gpgsign=false`.
- No AI attribution anywhere — no `Co-Authored-By`, no "Generated with", no emoji
  or vendor trailer — in any commit message, PR body, or tag.
- Do not create branches, commit, push, or tag unless explicitly asked.
- Never force-push or rewrite `main` history.

## Change workflow (Class A — lightweight)
- A substantive change traces to a director ask `D-NNN` answered by an
  implementor response `R-NNN`, both stored under the git-ignored `_directives/`.
  Keep these short at Class A; one paragraph each is fine.
- Work on a branch → open a PR → merge after review. Branch protection and
  required checks are **optional** at this class; add them with a `D-NNN` if the
  project grows to warrant them.

## Reviewability (Class A — guidance, not enforced)
- Keep modules and functions small enough to review in one sitting. The strict
  Compass size caps (≤350-line modules, ≤180-line functions) are a target here,
  not a test gate.
- Linting (`ruff` for Python, or the language's standard linter) should be clean
  before a PR merges. A coverage target is best-effort at Class A; add a hard
  threshold only via a `D-NNN`.
- Report honestly: if tests fail, say so with output; never claim a passing
  baseline you did not reproduce.

## Product invariants
- Product scope is **to be defined by the first substantive directive**. Record
  it in `GOVERNANCE.md` and `SESSION_STATE.md` once set, then keep this section
  in sync.
- Do not inject brand names into code, UI, or commits — they are concepts, not
  names to hard-code.

## Prose
All output — chat, docs, comments, commits — avoids AI-writing tells: no inflated
vocabulary, no "not just X but Y", no forced triads or staged closers, restrained
formatting, straight quotes, plain "is/are". Write the shorter, more direct
wording a careful human writer would use.
