' SanctuaryCompanion Desktop Agent - Silent Runner
' Launches the desktop agent in the background with no visible command window.
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
RootDir = FSO.GetParentFolderName(FSO.GetParentFolderName(ScriptDir))
Command = "node """ & RootDir & "\scripts\desktop-agent\desktop-agent.mjs"""
WshShell.CurrentDirectory = RootDir
WshShell.Run Command, 0, False
Set WshShell = Nothing
Set FSO = Nothing
