Unicode true
Name "DeepSeek Harness"
OutFile "dist\DeepSeek Harness-Setup-0.1.0.exe"
Icon "assets\icon.ico"
UninstallIcon "assets\icon.ico"
InstallDir "$LOCALAPPDATA\Programs\DeepSeek Harness"
InstallDirRegKey HKCU "Software\DeepSeek Harness" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "dist\win-unpacked\*.*"

  CreateShortCut "$DESKTOP\DeepSeek Harness.lnk" "$INSTDIR\DeepSeek Harness.exe" "" "$INSTDIR\DeepSeek Harness.exe" 0
  CreateDirectory "$SMPROGRAMS\DeepSeek Harness"
  CreateShortCut "$SMPROGRAMS\DeepSeek Harness\DeepSeek Harness.lnk" "$INSTDIR\DeepSeek Harness.exe" "" "$INSTDIR\DeepSeek Harness.exe" 0
  CreateShortCut "$SMPROGRAMS\DeepSeek Harness\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeek Harness" "DisplayName" "DeepSeek Harness"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeek Harness" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeek Harness" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeek Harness" "DisplayIcon" "$INSTDIR\DeepSeek Harness.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeek Harness" "DisplayVersion" "0.1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeek Harness" "Publisher" "deepseek-harness-desktop"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\DeepSeek Harness.lnk"
  RMDir /r "$SMPROGRAMS\DeepSeek Harness"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeek Harness"
SectionEnd
