(function () {
  const DEFAULT_HOST = "github.com";

  // Only github.com and GitHub Enterprise Cloud (*.ghe.com) hosts may receive the gh token.
  const GHE_HOST_PATTERN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+ghe\.com$/;

  function isAllowedHost(host) {
    return host === DEFAULT_HOST || GHE_HOST_PATTERN.test(host);
  }

  // GH_HOST pins the host when it is set to an allowed value; otherwise returns null.
  function pinnedHost(ctx) {
    try {
      const env = ctx.host.env;
      const value = env && typeof env.get === "function" ? env.get("GH_HOST") : null;
      const host = typeof value === "string" ? value.trim().toLowerCase() : "";
      if (host && isAllowedHost(host)) return host;
      if (host) ctx.host.log.warn("GH_HOST ignored: not github.com or a *.ghe.com host");
    } catch (e) {
      ctx.host.log.info("GH_HOST read failed: " + String(e));
    }
    return null;
  }

  // Other hosts gh has a stored login for (e.g. *.ghe.com), found by listing `gh:*`
  // Credential Manager entries. Only called when github.com did not work out.
  function discoveredHosts(ctx) {
    const hosts = [];
    try {
      const list = ctx.host.keychain.listGenericPasswordTargets;
      const targets = typeof list === "function" ? ctx.util.tryParseJson(list("gh:*")) : null;
      for (const target of Array.isArray(targets) ? targets : []) {
        // Active-account entries are `gh:<host>:`; `gh:<host>:<user>` are per-user copies.
        const m = /^gh:([^:]+):$/i.exec(String(target));
        const host = m ? m[1].toLowerCase() : "";
        if (host !== DEFAULT_HOST && isAllowedHost(host) && hosts.indexOf(host) === -1) {
          hosts.push(host);
        }
      }
    } catch (e) {
      ctx.host.log.info("gh credential listing failed: " + String(e));
    }
    return hosts;
  }

  function usageUrl(host) {
    const apiHost = host === DEFAULT_HOST ? "api.github.com" : "api." + host;
    return "https://" + apiHost + "/copilot_internal/user";
  }

  function readJson(ctx, path) {
    try {
      if (!ctx.host.fs.exists(path)) return null;
      const text = ctx.host.fs.readText(path);
      return ctx.util.tryParseJson(text);
    } catch (e) {
      ctx.host.log.warn("readJson failed for " + path + ": " + String(e));
      return null;
    }
  }

  function writeJson(ctx, path, value) {
    try {
      ctx.host.fs.writeText(path, JSON.stringify(value));
    } catch (e) {
      ctx.host.log.warn("writeJson failed for " + path + ": " + String(e));
    }
  }

  // Versions up to 0.7.4 copied the gh token into auth.json in plain text. The token can carry
  // repo/org/workflow scopes and outlives `gh auth logout`, so wipe it (the host fs has no remove).
  function wipeLegacyTokenCopy(ctx) {
    const path = ctx.app.pluginDataDir + "/auth.json";
    const data = readJson(ctx, path);
    if (data && data.token) writeJson(ctx, path, {});
  }

  // The token is read from Credential Manager on every probe and never stored by us.
  function loadTokenFromGhCli(ctx, host) {
    try {
      // gh (go-keyring) keeps the active account's token in Credential Manager as `gh:<host>:`
      // (empty user name); the host only reads Credential Manager when the account is given.
      const raw = ctx.host.keychain.readGenericPassword("gh:" + host, "");
      if (raw) {
        let token = raw;
        if (
          typeof token === "string" &&
          token.indexOf("go-keyring-base64:") === 0
        ) {
          token = ctx.base64.decode(token.slice("go-keyring-base64:".length));
        }
        if (token) {
          ctx.host.log.info("token loaded from gh CLI keychain");
          return token;
        }
      }
    } catch (e) {
      ctx.host.log.info("gh CLI keychain read failed: " + String(e));
    }
    return null;
  }

  function fetchUsage(ctx, token, host) {
    return ctx.util.request({
      method: "GET",
      url: usageUrl(host),
      headers: {
        Authorization: "token " + token,
        Accept: "application/json",
        "Editor-Version": "vscode/1.96.2",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
        "User-Agent": "GitHubCopilotChat/0.26.7",
        "X-Github-Api-Version": "2025-04-01",
      },
      timeoutMs: 10000,
    });
  }

  // A quota_snapshots bucket -> percent-used meter, or null to suppress. Suppressed for:
  // a missing bucket; an unlimited bucket or GitHub's -1 entitlement/remaining sentinel
  // (since the 2026-06-01 switch to AI-credits billing, paid chat & completions carry no
  // real meter, so they're hidden rather than shown as a misleading 0%); and a
  // zero-entitlement placeholder (org-managed Business seat, or Credits on free).
  function makeProgressLine(ctx, label, snapshot, resetDate) {
    if (!snapshot || typeof snapshot.percent_remaining !== "number")
      return null;
    if (
      snapshot.unlimited === true ||
      snapshot.entitlement === -1 ||
      snapshot.remaining === -1 ||
      snapshot.entitlement === 0
    )
      return null;
    const usedPercent = Math.min(100, Math.max(0, 100 - snapshot.percent_remaining));
    return ctx.line.progress({
      label: label,
      used: usedPercent,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: ctx.util.toIso(resetDate),
      periodDurationMs: 30 * 24 * 60 * 60 * 1000,
    });
  }

  // "Extra Usage" - premium interactions consumed beyond the included Credits pool.
  // Only emitted once the user has enabled overage spend (overage_permitted); a real
  // zero is then shown. Callers must pair it with a real Credits meter: an org-managed
  // placeholder can carry overage_permitted: true on a zero-entitlement bucket, and
  // rendering "0" for it would be meaningless.
  function makeOverageLine(ctx, snapshot) {
    if (!snapshot || snapshot.overage_permitted !== true) return null;
    const overage =
      typeof snapshot.overage_count === "number"
        ? Math.max(0, snapshot.overage_count)
        : 0;
    return ctx.line.text({ label: "Extra Usage", value: String(overage) });
  }

  function makeLimitedProgressLine(ctx, label, remaining, total, resetDate) {
    if (typeof remaining !== "number" || typeof total !== "number" || total <= 0)
      return null;
    const used = total - remaining;
    const usedPercent = Math.min(100, Math.max(0, Math.round((used / total) * 100)));
    return ctx.line.progress({
      label: label,
      used: usedPercent,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: ctx.util.toIso(resetDate),
      periodDurationMs: 30 * 24 * 60 * 60 * 1000,
    });
  }

  // Tries one host: returns the response, or null when there is no token or it was rejected
  // (401/403) so the caller can move on to the next host. Sets state.authFailed on rejection.
  function tryHost(ctx, host, state) {
    const token = loadTokenFromGhCli(ctx, host);
    if (!token) return null;

    let resp;
    try {
      resp = fetchUsage(ctx, token, host);
    } catch (e) {
      ctx.host.log.error("usage request exception: " + String(e));
      throw "Usage request failed. Check your connection.";
    }

    if (resp.status === 401 || resp.status === 403) {
      state.authFailed = true;
      return null;
    }
    return resp;
  }

  function probe(ctx) {
    wipeLegacyTokenCopy(ctx);
    const state = { authFailed: false };
    const pinned = pinnedHost(ctx);
    // Lazy: github.com is tried first, and the credential listing only runs on a miss.
    let resp = tryHost(ctx, pinned || DEFAULT_HOST, state);
    if (!resp && !pinned) {
      const others = discoveredHosts(ctx);
      for (let i = 0; i < others.length && !resp; i++) {
        resp = tryHost(ctx, others[i], state);
      }
    }
    if (!resp) {
      if (state.authFailed) {
        throw "Token invalid. Run `gh auth login` to re-authenticate.";
      }
      throw "Not logged in. Run `gh auth login` first.";
    }

    if (resp.status < 200 || resp.status >= 300) {
      ctx.host.log.error("usage returned error: status=" + resp.status);
      throw (
        "Usage request failed (HTTP " +
        String(resp.status) +
        "). Try again later."
      );
    }

    const data = ctx.util.tryParseJson(resp.bodyText);
    if (data === null) {
      throw "Usage response invalid. Try again later.";
    }

    ctx.host.log.info("usage fetch succeeded");

    const lines = [];
    let plan = null;
    if (data.copilot_plan) {
      plan = ctx.fmt.planLabel(data.copilot_plan);
    }

    // The metered premium pool is shown as "Credits" (AI-credits billing); overage
    // beyond it as "Extra Usage", tied to the Credits meter (see makeOverageLine).
    const snapshots = data.quota_snapshots;
    if (snapshots) {
      const creditsLine = makeProgressLine(
        ctx,
        "Credits",
        snapshots.premium_interactions,
        data.quota_reset_date,
      );
      if (creditsLine) {
        lines.push(creditsLine);
        const extraLine = makeOverageLine(ctx, snapshots.premium_interactions);
        if (extraLine) lines.push(extraLine);
      }

      const chatLine = makeProgressLine(
        ctx,
        "Chat",
        snapshots.chat,
        data.quota_reset_date,
      );
      if (chatLine) lines.push(chatLine);

      const completionsLine = makeProgressLine(
        ctx,
        "Completions",
        snapshots.completions,
        data.quota_reset_date,
      );
      if (completionsLine) lines.push(completionsLine);
    }

    // Legacy free-tier shape (predates quota_snapshots). Gated on nothing else having
    // been produced - otherwise a paid account (Credits present, chat/completions
    // suppressed as unlimited) that still carried limited_user_quotas would wrongly
    // show free-tier meters alongside Credits.
    if (lines.length === 0 && data.limited_user_quotas && data.monthly_quotas) {
      const lq = data.limited_user_quotas;
      const mq = data.monthly_quotas;
      const resetDate = data.limited_user_reset_date;

      const chatLine = makeLimitedProgressLine(ctx, "Chat", lq.chat, mq.chat, resetDate);
      if (chatLine) lines.push(chatLine);

      const completionsLine = makeLimitedProgressLine(ctx, "Completions", lq.completions, mq.completions, resetDate);
      if (completionsLine) lines.push(completionsLine);
    }

    // Org-managed (token_based_billing) seat: no per-seat allotment to show a percent against,
    // but the premium bucket can still carry the user's own credits_used. Show a positive count
    // as Credits; 0/missing stays "No usage data". Extra Usage stays suppressed (see above).
    if (lines.length === 0 && data.token_based_billing === true) {
      const premium = snapshots && snapshots.premium_interactions;
      const creditsUsed = premium && typeof premium.credits_used === "number" ? premium.credits_used : 0;
      if (creditsUsed > 0) {
        lines.push(
          ctx.line.text({
            label: "Credits",
            value: String(Math.round(creditsUsed * 100) / 100) + " used",
          }),
        );
      }
    }

    if (lines.length === 0) {
      lines.push(
        ctx.line.badge({
          label: "Status",
          text: "No usage data",
          color: "#a3a3a3",
        }),
      );
    }

    return { plan: plan, lines: lines };
  }

  globalThis.__openusage_plugin = { id: "copilot", probe };
})();
