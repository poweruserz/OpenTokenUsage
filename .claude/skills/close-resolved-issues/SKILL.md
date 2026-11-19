---
name: close-resolved-issues
description: Find open OpenTokenUsage issues whose fix has merged and close them with thanks and an explanation. Use when asked whether an issue is solved, to clean up or triage issues, after a PR that fixes an issue merges, or after a release.
---

# Close resolved issues

The owner's standing rule (CLAUDE.md, "Issues and outside PRs"): an issue whose fix has merged is
closed without asking, with thanks and an explanation. Repo: `poweruserz/OpenTokenUsage`.

## 1. Decide whether it is solved

```powershell
gh issue view <n> -R poweruserz/OpenTokenUsage --comments
gh pr list -R poweruserz/OpenTokenUsage --state merged --search "<n> in:body" --json number,title,mergedAt
gh release list -R poweruserz/OpenTokenUsage --limit 5
```

- Solved = a merged PR does what the issue asks. Read the PR diff or the code (`plugins/<id>/`,
  `docs/providers/<id>.md`), not only its title.
- Which release ships it: the first line of `git tag --contains <merge sha> --list 'v*' --sort=v:refname`
  (plain order puts v0.7.10 before v0.7.9). No tag yet = "the next release".
- Read every comment: the reporter's last one often raises a follow-up. Check each one in the code. If it is
  a real bug still open, say so to the owner and don't close; if it is expected (documented, or the
  provider's behaviour), explain it in the closing comment.
- Not solved, or unclear: report what is missing to the owner and leave it open.
- A request the owner declined: close as `not planned` with the reason.

## 2. Close it

Write the comment in English to a file in the scratchpad (inline quoting breaks in PowerShell), then:

```powershell
gh issue close <n> -R poweruserz/OpenTokenUsage --reason completed --comment (Get-Content -Raw <file>)
```

The comment, a few sentences:
- Thanks, naming what helped (their report, testing, logs).
- What changed, with the PR link, and the release (`v0.9.2`) or "the next release".
- An answer to each point they raised that stays open.
- "Feel free to reopen if …".

Never paste tokens, log contents or anything personal from the thread. Mention people only by their login
in plain text, never a bare `@name` for a role.

## 3. Report

Tell the owner which issues were closed (links) and which stayed open and why.
