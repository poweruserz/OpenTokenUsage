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

; data_dirs.rs leaves the old accounts folder as a junction to the new one. When the app data is
; deleted, remove that link too (RmDir without /r deletes only the link) and the then-empty folder.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    RmDir "$APPDATA\com.sunstory.openusage\accounts"
    RmDir "$APPDATA\com.sunstory.openusage"
  ${EndIf}
!macroend
