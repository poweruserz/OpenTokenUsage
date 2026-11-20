# Custom balances

Shows the balance of up to five accounts on API relay panels or any endpoint you point it at: New API and One API
(an account, or one API key), Sub2API, or a plain GET endpoint whose numbers you map with dot paths. Set them up in
Settings → Providers → Custom balances; the presets follow
[token-monitor](https://github.com/Javis603/token-monitor) (MIT).

## Setup

1. Put the account's key in a Windows **user** environment variable whose name starts with `OTU_` (for example
   `OTU_RELAY_KEY`). The key itself is never stored by the app; only the variable's name is, in
   `%APPDATA%\com.poweruserz.opentokenusage\config.json` (`balances`). The prefix keeps the card from ever reading another variable, such as an
   AI provider's API key, and sending it to the address you typed.
2. In Settings → Providers → Custom balances, add the account: a name, the type, the panel's address and the variable's
   name (New API account: also your numeric user ID). Save.
3. Turn Custom balances on in Settings → Providers (new providers start off).

## Presets

| Type               | Request                                                         | Auth                                          |
| ------------------ | --------------------------------------------------------------- | --------------------------------------------- |
| New API / One API  | `GET <address>/api/user/self`                                   | `Authorization: Bearer <key>`, `New-Api-User` |
| New API (API key)  | `GET <address>/api/usage/token/`                                | `Authorization: Bearer <key>`                 |
| Sub2API            | `GET <address>/api/v1/auth/me` (`code` 0, `data.balance`)       | `Authorization: Bearer <key>`                 |
| Custom endpoint    | `GET <address><path>`; balance, used and total at dot paths     | `Authorization: Bearer` or `x-api-key`        |

New API counts quota in units: the card divides by `/api/status`'s `quota_per_unit` (500000 when it doesn't say). A
pasted API address ending in `/v1` is read without it. A custom endpoint's numbers are divided by the divisor you set
and shown in its currency.

## Lines

| Label                 | Scope    | What it shows                                                                  |
| --------------------- | -------- | ------------------------------------------------------------------------------ |
| Balance … Balance 5   | overview | `Name: $12.34 / $15.00` (left, then left + used or the total when known); `∞` for unlimited; red at zero or on an error |

One account that fails shows its reason on its own line in red, without words so it reads the same in every
language: `Name: OTU_X ✕` (the variable isn't set), `Name: HTTP 401` (the status the panel answered), `Name: ?` (an
answer without the numbers), `Name: ✕` (no answer). The others still show.

## Errors

| Condition                         | Message                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| No balance saved                  | "No custom balance set up. Add one in Settings."                 |
| The only account's variable unset | "No OTU_… found. Set up environment variable first."             |
