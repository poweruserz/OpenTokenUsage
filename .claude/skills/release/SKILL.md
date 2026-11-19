---
name: release
description: Cut and publish an OpenTokenUsage release (version bump, CHANGELOG, what's-new video, New badges, release PR, WinGet fork sync, tag, publish.yml, prod tag, website version). Use when asked to release, publish, ship a version, "yayınla", or whether something is released yet.
---

# Release OpenTokenUsage

A release reaches every user through the in-app updater, and releases are immutable: a published version's
assets and tag never change, so a mistake costs a new version. Background: CLAUDE.md "Dependencies & releases".

## 0. Go-ahead

Never push a `v*` tag without the owner's go-ahead for **this** version. A release the owner started and
settled (version, test step) counts; an earlier "do everything" does not. When fixes are still in review, ask
once with AskUserQuestion ("publish X.Y.Z once #a and #b merge?"). Numbering: every release bumps the patch
(0.9.1 → 0.9.2), new features included; a minor bump (0.9.x → 0.10.0) only when the owner picks it.

## 1. Release branch

```powershell
git switch main; git pull
git switch -c release/X.Y.Z
```

- Version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`; `cd src-tauri; cargo check`
  updates `Cargo.lock` (only the `opentokenusage` entry may change; anything else, stop and look).
- `CHANGELOG.md`: a `## vX.Y.Z` section on top (required: it is the release body and the in-app "What's new").
  One plain sentence, then `### New Features` / `### Bug Fixes`. Write for users, not code: what they see and
  where (Settings → …). Name the version a bug came in "(0.9.1)", and credit outside help
  "(#51, thanks @login)". Gather it from `git log vPREV..main --merges` and the PR bodies.
- What's-new video `src-tauri/resources/whats-new/<version>.webm`: rename the previous one to the new version
  or delete it (a test fails while an older version's video remains). A new one is 720×720 VP9, silent, ~1.4 MB.
- `src/lib/new-features.ts`: drop entries whose `since` is two versions old (its test says which); add one for a
  new Settings card.

## 2. Verify, PR, merge

```powershell
bunx tsc --noEmit; bun run test
cd src-tauri; cargo check; cargo test --lib
```

If the owner asked for a test, build and look at it with the run-opentokenusage skill. Open the PR "Release
X.Y.Z", then the global ai-review loop until it merges with a merge commit.

## 3. Tag

```powershell
gh repo sync poweruserz/winget-pkgs --branch master   # every time: a fork far behind fails the WinGet job
git switch main; git pull
git tag vX.Y.Z <merge sha>
git push origin vX.Y.Z
```

## 4. Watch publish.yml

```powershell
# Filter by the tag: right after the push, an unfiltered list can still show the previous release's run.
gh run list -R poweruserz/OpenTokenUsage --workflow publish.yml --branch vX.Y.Z --limit 1   # repeat until it lists one
gh run watch <id> -R poweruserz/OpenTokenUsage --exit-status
```

- It builds the NSIS setup, signs the updater files, attests, checks the assets (no MSI, `latest.json` points at
  this tag's `-setup.exe`), and publishes the draft last.
- Failed **before** publishing: `gh run rerun <id> --failed` (tauri-action reuses the draft).
- Failed **after** publishing: never "re-run all jobs"; a broken release is fixed by a new version.
- WinGet job failed with "Ref cannot be created": sync the fork again, then `gh run rerun <id> --failed`.
- Check: `gh release view vX.Y.Z -R poweruserz/OpenTokenUsage` (published, not draft, `-setup.exe` and `latest.json`
  present), and the komac PR in microsoft/winget-pkgs.

## 5. After it ships

- Move `prod` to the released commit (the only allowed force push). Use the sha, not `vX.Y.Z^{commit}` (PowerShell
  mangles it):
  ```powershell
  git tag -f prod <merge sha>
  git push --force origin refs/tags/prod
  ```
- Website (`../opentokenusage.github.io`): `data-version` in `index.html`, plus any provider or feature the
  release added (see the add-provider skill's site step); push to main, then check the Pages build.
- Issues fixed by the release: the close-resolved-issues skill.
- Report to the owner: release link, WinGet PR link, what was not checked.
