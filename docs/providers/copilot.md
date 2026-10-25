# GitHub Copilot

Tracks GitHub Copilot usage quotas for both paid and free tier users.

## Authentication

The plugin reads the GitHub CLI token (`gh auth login`) from Windows Credential Manager (`gh:<host>:`, `gh:github.com:` by default) on every probe and never stores it. The gh token can carry repo, org and workflow scopes, so it is not copied anywhere; a plain-text copy that versions up to 0.7.4 left in `auth.json` is wiped on the next probe.

### GitHub Enterprise Cloud (`*.ghe.com`)

Host selection, in order:

1. The `GH_HOST` environment variable, if set to `github.com` or a `*.ghe.com` host (for example `example.ghe.com`). Other values are ignored.
2. `github.com`.
3. If github.com has no token, or rejects it (401/403), any other `*.ghe.com` host `gh` has a stored login for (Credential Manager entries matching `gh:*`, listed only at this point).

Only `github.com` and `*.ghe.com` hosts ever receive the token. For a non-github.com host the usage endpoint is `https://api.<host>/copilot_internal/user`. Log in with `gh auth login --hostname <host>`.

### Setup

Install and authenticate with the GitHub CLI:

```bash
# Install gh CLI
winget install GitHub.cli

# Authenticate
gh auth login
```

Choose "GitHub.com" and follow the prompts. The plugin will automatically read the token from Credential Manager.

## API

**Endpoint:** `https://api.github.com/copilot_internal/user` (`https://api.<host>/copilot_internal/user` for GHE.com)

**Headers:**
```
Authorization: token <token>
Accept: application/json
Editor-Version: vscode/1.96.2
Editor-Plugin-Version: copilot-chat/0.26.7
User-Agent: GitHubCopilotChat/0.26.7
X-Github-Api-Version: 2025-04-01
```

### Response (Paid Tier)

```json
{
  "copilot_plan": "pro",
  "quota_reset_date": "2025-02-15T00:00:00Z",
  "quota_snapshots": {
    "premium_interactions": {
      "percent_remaining": 80,
      "entitlement": 300,
      "remaining": 240,
      "quota_id": "premium"
    },
    "chat": {
      "percent_remaining": 95,
      "entitlement": 1000,
      "remaining": 950,
      "quota_id": "chat"
    }
  }
}
```

### Response (Free Tier)

```json
{
  "copilot_plan": "individual",
  "access_type_sku": "free_limited_copilot",
  "limited_user_quotas": {
    "chat": 410,
    "completions": 4000
  },
  "monthly_quotas": {
    "chat": 500,
    "completions": 4000
  },
  "limited_user_reset_date": "2025-02-11"
}
```

## Displayed Lines

| Line         | Tier | Description                              |
|--------------|------|------------------------------------------|
| Premium      | Paid | Premium interactions remaining (percent) |
| Chat         | Both | Chat messages remaining                  |
| Completions  | Free | Code completions remaining               |

All progress lines include:
- `resetsAt` — ISO timestamp of next quota reset
- `periodDurationMs` — 30-day period (2592000000ms)

## Errors

| Condition       | Message                                           |
|-----------------|---------------------------------------------------|
| No token found  | "Not logged in. Run `gh auth login` first."       |
| 401/403         | "Token invalid. Run `gh auth login` to re-auth."  |
| HTTP error      | "Usage request failed (HTTP {status})..."         |
| Network error   | "Usage request failed. Check your connection."    |
| Invalid JSON    | "Usage response invalid. Try again later."        |
