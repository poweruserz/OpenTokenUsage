import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

// Tauri's MSI is always per-machine (Program Files), so every in-app update asked for admin rights.
// Only the per-user NSIS installer may ship; the updater then sends old MSI installs to it too.
const tauriConf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"))
const publish = readFileSync(".github/workflows/publish.yml", "utf8")

it("bundles only the per-user NSIS installer", () => {
  expect(tauriConf.bundle.targets).toEqual(["nsis"])
  expect(tauriConf.bundle.windows.nsis.installMode).toBe("currentUser")
  expect(tauriConf.bundle.createUpdaterArtifacts).toBe(true)
})

it("keeps MSI removal and notifications working after the identifier change", () => {
  // The setup removes an MSI only when its Publisher matches; 0.7.7's MSI says "sunstory".
  expect(tauriConf.bundle.publisher).toBe("sunstory")
  // Updates keep the old Start menu shortcut, whose AppUserModelID toasts need to match.
  expect(tauriConf.bundle.windows.nsis.installerHooks).toBe("./windows/hooks.nsh")
  expect(readFileSync("src-tauri/windows/hooks.nsh", "utf8")).toContain("SetLnkAppUserModelId")
})

it("fails the release if an MSI ships or latest.json points elsewhere", () => {
  expect(publish).toContain("Unexpected MSI (.msi)")
  expect(publish).toContain('!p["windows-x86_64"]?.url.endsWith("-setup.exe")')
  // WinGet gets the same per-user setup, never an MSI.
  expect(publish).toContain("installers-regex: 'OpenTokenUsage_.*_x64-setup\\.exe$'")
  expect(publish).not.toMatch(/installers-regex:.*\.msi/)
})
