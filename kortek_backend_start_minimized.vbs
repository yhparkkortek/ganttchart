' ============================================================
'  kortek_backend_start_minimized.vbs
'  kortek_backend.bat을 "최소화된 콘솔 창"으로 조용히 실행합니다.
'  - Windows 시작프로그램 바로가기가 이 파일을 가리키도록 설치되면,
'    PC를 켤 때마다 검은 콘솔 창이 화면에 튀어나오지 않고 바로 최소화된
'    상태로 시작됩니다 (작업 표시줄에서 확인 가능).
'  - kortek_backend_install.bat이 자동으로 생성해주는 파일이라 사람이
'    직접 열어볼 일은 거의 없지만, 더블클릭해도 똑같이 최소화 실행됩니다.
' ============================================================
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

herePath = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = herePath

' WindowStyle 7 = 최소화(포커스도 가져가지 않음), false = 완료를 기다리지 않고 바로 리턴
shell.Run "cmd /c """ & herePath & "\kortek_backend.bat""", 7, False
