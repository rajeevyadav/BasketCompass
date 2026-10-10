; Inno Setup script for the downloadable BasketCompass Windows installer. It packs
; the PyInstaller one-folder output (dist-app\BasketCompass) into a Setup.exe that
; installs per-user, adds shortcuts, and offers to launch. The app serves the PWA
; on 127.0.0.1 only; nothing is uploaded.
#define AppName "BasketCompass"
#define AppVersion "0.1.0"

[Setup]
; A fixed AppId lets a reinstall upgrade in place instead of starting fresh.
AppId={{B7A2F0C4-5E6D-4C3B-9A1E-2F4D6C8B0A31}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Rajeev Yadav
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
OutputDir=..\dist-installer
OutputBaseFilename={#AppName}-Setup-{#AppVersion}-Windows-x64
SetupIconFile=..\brand\Icon.ico
UninstallDisplayIcon={app}\BasketCompass.exe
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Per-user install needs no administrator rights.
PrivilegesRequired=lowest
WizardStyle=modern
UsePreviousAppDir=yes
UsePreviousGroup=yes
; If the app is open during an upgrade, close and reopen it rather than failing.
CloseApplications=yes
RestartApplications=yes

[Files]
Source: "..\dist-app\BasketCompass\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\BasketCompass.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\BasketCompass.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Messages]
WelcomeLabel2=This will install [name/ver] on your computer.%n%nBasketCompass compares grocery prices and builds tax-aware shopping plans. It runs locally on this machine (127.0.0.1); your lists stay on this device and nothing is uploaded.
FinishedLabel=Setup is complete. BasketCompass opens in your browser on 127.0.0.1. Keep the small BasketCompass window open while you use the app.

[Run]
Filename: "{app}\BasketCompass.exe"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent
