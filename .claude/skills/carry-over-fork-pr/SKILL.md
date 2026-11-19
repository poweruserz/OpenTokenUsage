---
name: carry-over-fork-pr
description: Take an outside contributor's fork PR to OpenTokenUsage, apply any fixes, and reopen it from a same-repo branch so ai-review runs, crediting them. Use when asked what a contributor's PR wants, to review, finish, or merge a fork PR, or when a PR shows ai-review as skipped.
---

# Carry over a fork PR

poweruserz/ai-review runs only when the PR's head is in this repo, so a fork PR never gets the `ai-review`
status and the ruleset blocks its merge. Never bypass that. Carry the PR over instead.

## 1. Read it

```powershell
gh pr view <n> -R poweruserz/OpenTokenUsage --json title,author,body,isCrossRepository,files,statusCheckRollup
gh pr view <n> -R poweruserz/OpenTokenUsage --comments   # summary comments only
gh api repos/poweruserz/OpenTokenUsage/pulls/<n>/comments   # inline findings (Greptile, Codex) live here
```

Explain to the owner in plain words what it changes and why, and check every bot finding in the code. With
ponytail ultra, name the parts the need doesn't justify. Wait for the owner's go-ahead before step 2.

## 2. Branch

```powershell
git fetch origin pull/<n>/head:pr-<n>
git switch -c <topic-branch> pr-<n>
```

Their commits stay as they are, keeping their authorship. Add the changes on top. Any UI string goes into all
11 locales. Commit with a message file (`git commit -F`), ending with:

```
Co-Authored-By: <login> <<id>+<login>@users.noreply.github.com>
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

The numeric id comes from `gh api users/<login> --jq .id`.

## 3. Verify, merge main, push

- `bunx tsc --noEmit`, `bun run test`, plus `cd src-tauri && cargo check && cargo test --lib` when Rust changed.
- A reviewer subagent reads the diff before the push.
- `git merge origin/main` if main moved, so the PR diff shows only this change.
- Push, then open a PR whose body starts with "Carries over #<n> by <login> (fork PRs don't run `ai-review`)",
  lists what changed on top, and ends with the Claude Code line.

## 4. Close theirs

Comment on the original PR: thanks, the new PR's link, and what changed on top. Then
`gh pr close <n>`. Then follow the global ai-review loop (poll, fix findings, merge with a merge commit). If
the PR fixes an issue, close it with the `close-resolved-issues` skill once it merges.

Deleting the local `pr-<n>` branch needs the owner's approval (and the git hook blocks `git branch -D`).
