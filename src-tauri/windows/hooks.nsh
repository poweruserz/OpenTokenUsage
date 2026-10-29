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

; data_dirs.rs leaves junctions to the new folder at the old paths of the accounts folder and of
; each account folder it moved. When the app data is deleted, remove them too (RmDir without /r
; deletes a junction, and never a folder that still has files) and the then-empty folders.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    Push $0
    Push $1
    FindFirst $0 $1 "$APPDATA\com.sunstory.openusage\accounts\*"
    ${DoWhile} $1 != ""
      ${If} $1 != "."
      ${AndIf} $1 != ".."
        RmDir "$APPDATA\com.sunstory.openusage\accounts\$1"
      ${EndIf}
      FindNext $0 $1
    ${Loop}
    FindClose $0
    Pop $1
    Pop $0
    RmDir "$APPDATA\com.sunstory.openusage\accounts"
    RmDir "$APPDATA\com.sunstory.openusage"
  ${EndIf}
!macroend
