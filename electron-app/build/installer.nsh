; -----------------------------------------------------------------------------
; ECHO custom NSIS installer hooks
;
; The main window's close handler hides ECHO to the system tray instead of
; quitting (src/main/index.js: mainWindow.on('close', ...)). That means when a
; user installs a new build over an old one, the previous ECHO process is
; usually still running. Without killing it here:
;   * The installer can't overwrite locked files (.exe, native .node modules).
;   * The new build, once launched, would fight the old process for the
;     %APPDATA%\ECHO\ LevelDB / IndexedDB exclusive locks → white window.
;
; customInit fires before file copy on install/upgrade.
; customUnInit fires before file removal on uninstall.
; Child processes (echo-audio-host.exe, NCMconverter.exe) are also terminated
; so their open handles on extraResources files are released.
; -----------------------------------------------------------------------------

!macro customInit
  nsExec::Exec 'taskkill /F /IM "ECHO.exe" /T'
  nsExec::Exec 'taskkill /F /IM "echo-audio-host.exe" /T'
  nsExec::Exec 'taskkill /F /IM "NCMconverter.exe" /T'
  Sleep 800
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM "ECHO.exe" /T'
  nsExec::Exec 'taskkill /F /IM "echo-audio-host.exe" /T'
  nsExec::Exec 'taskkill /F /IM "NCMconverter.exe" /T'
  Sleep 500
!macroend

!macro customInstall
  IfFileExists "$INSTDIR\resources\software.ico" 0 +3
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$INSTDIR\resources\software.ico" 0 "" "" "${APP_DESCRIPTION}"
!macroend
