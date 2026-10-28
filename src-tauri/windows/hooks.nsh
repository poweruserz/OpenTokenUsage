; Notifications are sent under the app identifier and show only when a Start menu shortcut carries
; it as its AppUserModelID. Tauri stamps shortcuts only when it creates them, and an update
; (/UPDATE) keeps the existing ones, so installs from 0.7.8 or older still carry the old
; com.sunstory.openusage: stamp the current identifier on every install.
!macro NSIS_HOOK_POSTINSTALL
  ${If} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${EndIf}
  ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
    !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
!macroend
