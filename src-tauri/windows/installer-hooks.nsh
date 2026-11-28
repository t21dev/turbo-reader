; Hooks for the NSIS installer (bundle.windows.nsis.installerHooks).
;
; Up to 0.32.0 the .exe installer installed per user, into
; %LOCALAPPDATA%\Turbo Reader. It now installs per machine, into Program
; Files, as the .msi always has. When it finds a per-user copy, it moves it
; over:
;
; - The old copy is removed by its own uninstaller, run silently, which keeps
;   the library: that lives in %APPDATA% and %LOCALAPPDATA%\dev.t21.turbo-reader,
;   apart from either install folder, and is only deleted when asked.
; - Start at login is kept, pointed at the new folder (the old uninstaller
;   removes it).
; - The old folder becomes a link (a junction) to the new one, so an AI agent
;   set up to start the old program path still finds it.
;
; This file is included before the installer's own defines, so everything that
; uses them is a macro, expanded where they exist.

!define TURBO_RUNKEY "Software\Microsoft\Windows\CurrentVersion\Run"
; Value under HKCU\${MANUPRODUCTKEY}: the old folder, kept as a link
!define TURBO_LINKVALUE "UserInstallLink"

Var TurboUserDir
Var TurboStartAtLogin
Var TurboExit

!macro NSIS_HOOK_PREINSTALL
  ; HKCU is the hive of whoever ran the installer, elevated or not
  ReadRegStr $0 HKCU "${UNINSTKEY}" "UninstallString"
  ${If} $0 != ""
    ReadRegStr $TurboUserDir HKCU "${MANUPRODUCTKEY}" ""
    ${If} $TurboUserDir == ""
      SetShellVarContext current
      StrCpy $TurboUserDir "$LOCALAPPDATA\${PRODUCTNAME}"
      SetShellVarContext all
    ${EndIf}

    ${If} $TurboUserDir != $INSTDIR
    ${AndIf} ${FileExists} "$TurboUserDir\uninstall.exe"
      DetailPrint "Moving the per-user copy in $TurboUserDir to $INSTDIR"
      !insertmacro CheckIfAppIsRunning "$TurboUserDir\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

      ReadRegStr $TurboStartAtLogin HKCU "${TURBO_RUNKEY}" "${PRODUCTNAME}"

      ; `_?=` runs it in place instead of from a temporary copy, so this waits for it
      ClearErrors
      ExecWait '"$TurboUserDir\uninstall.exe" /S _?=$TurboUserDir' $TurboExit
      ${IfThen} ${Errors} ${|} StrCpy $TurboExit "failed to start" ${|}

      ${If} $TurboExit == 0
      ${AndIfNot} ${FileExists} "$TurboUserDir\${MAINBINARYNAME}.exe"
        Delete "$TurboUserDir\uninstall.exe"
        RMDir "$TurboUserDir"
        DeleteRegValue HKCU "${MANUPRODUCTKEY}" ""
        WriteRegStr HKCU "${MANUPRODUCTKEY}" "${TURBO_LINKVALUE}" "$TurboUserDir"

        ${If} $TurboStartAtLogin != ""
          ${WordReplace} "$TurboStartAtLogin" "$TurboUserDir\" "$INSTDIR\" "+" $TurboStartAtLogin
          WriteRegStr HKCU "${TURBO_RUNKEY}" "${PRODUCTNAME}" "$TurboStartAtLogin"
        ${EndIf}
      ${Else}
        ; Leave it: two copies side by side is better than a half-removed one
        DetailPrint "The per-user copy could not be removed ($TurboExit), it is left in place"
        ${If} $TurboStartAtLogin != ""
          WriteRegStr HKCU "${TURBO_RUNKEY}" "${PRODUCTNAME}" "$TurboStartAtLogin"
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Also restores the link after an upgrade that uninstalled first
  ReadRegStr $TurboUserDir HKCU "${MANUPRODUCTKEY}" "${TURBO_LINKVALUE}"
  ${If} $TurboUserDir != ""
  ${AndIf} $TurboUserDir != $INSTDIR
  ${AndIfNot} ${FileExists} "$TurboUserDir"
    nsExec::Exec '"$SYSDIR\cmd.exe" /c mklink /J "$TurboUserDir" "$INSTDIR"'
    Pop $TurboExit
    DetailPrint "Link $TurboUserDir to $INSTDIR: $TurboExit"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ReadRegStr $TurboUserDir HKCU "${MANUPRODUCTKEY}" "${TURBO_LINKVALUE}"
  ${If} $TurboUserDir != ""
  ${AndIf} $UpdateMode <> 1
    ; Removes the link only: RMDir without /r never follows it, and leaves a
    ; real folder alone unless it is empty
    RMDir "$TurboUserDir"
    ${If} $DeleteAppDataCheckboxState = 1
      DeleteRegValue HKCU "${MANUPRODUCTKEY}" "${TURBO_LINKVALUE}"
      DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
      DeleteRegKey /ifempty HKCU "${MANUKEY}"
    ${EndIf}
  ${EndIf}
!macroend
