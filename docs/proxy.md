# Proxy Configuration

OpenTokenUsage can route provider, status page and update requests through an optional proxy.

- Supported proxy types: `socks5://`, `http://`, `https://`
- Settings → **App** → **Proxy**, saved to `%APPDATA%\com.poweruserz.opentokenusage\config.json`
- Default: off

## Config File

Settings writes this file for you. To set it by hand, create `%APPDATA%\com.poweruserz.opentokenusage\config.json`
(0.9.2 and older kept it in `~/.openusage/config.json`; the first start of a newer version moves it):

```json
{
  "proxy": {
    "enabled": true,
    "url": "socks5://127.0.0.1:10808"
  }
}
```

You can also use an authenticated proxy URL:

```json
{
  "proxy": {
    "enabled": true,
    "url": "http://user:pass@proxy.example.com:8080"
  }
}
```

## Behavior

- A change in Settings applies from the next request on. A change to the file by hand is read when the app starts.
- `localhost`, `127.0.0.1`, and `::1` always bypass the proxy.
- Missing, disabled, invalid, or unreadable config leaves proxying off.
- Proxy credentials are redacted in logs.

## Scope

This applies to requests that go through the app's built-in HTTP client: providers, their status pages and update checks.

It is not a Windows system proxy setting and does not proxy other programs the app runs (such as ccusage).
