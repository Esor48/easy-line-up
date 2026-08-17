; Runs after the installer's License page (PRIVACY-AND-LICENSE.txt) has
; already been accepted with "I Agree" - writes a small marker file that
; main.js checks on first launch. If present, the in-app consent screen is
; skipped entirely, since the user already agreed here during setup.
;
; IMPORTANT: this folder name must exactly match what Electron's
; app.getPath('userData') resolves to. main.js explicitly calls
; app.setName('cs2-lineup-overlay') before anything else specifically so
; this stays guaranteed-correct rather than depending on package.json
; metadata that could drift between the two.
!macro customInstall
  CreateDirectory "$APPDATA\cs2-lineup-overlay"
  FileOpen $0 "$APPDATA\cs2-lineup-overlay\installer-consent.json" w
  FileWrite $0 '{"agreed": true, "source": "nsis-installer"}'
  FileClose $0
!macroend

