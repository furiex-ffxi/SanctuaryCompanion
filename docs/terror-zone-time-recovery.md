# Terror Zone clock-control failure notes

## What failed

The offline Terror Zone scheduler stopped working after Windows time control was changed from the original one-shot elevated PowerShell command to a persistent elevated Node/PowerShell helper.

Observed symptoms included:

- a blank PowerShell window appearing;
- the UI remaining on `Changing...`;
- repeated attempts leaving PowerShell processes behind;
- restore reporting that W32Time could not be started because it was disabled.

## Root causes

1. The persistent helper used a socket handshake and nested elevation flow. On the affected Windows host, the helper did not complete its handshake or return the clock-operation result, so the mutation stayed pending.
2. An interrupted pin could leave the W32Time service disabled. The saved state recorded the pre-pin startup mode (`Manual`), but restore attempted to start the service before making it startable.
3. The live restore path ignored an existing recovery state and used the legacy start/resync command, so it could not repair a disabled service.

## Current behavior

- Live pin/restore requests use the original one-shot elevated PowerShell path for compatibility.
- If a recovery state exists, restore uses the state-aware script.
- Restore temporarily sets W32Time to `Manual`, starts it, forces `w32tm /resync /force`, then restores the saved startup mode and running/stopped state.
- The recovery file is removed only after the restore sequence succeeds.

## Recovery procedure

1. Close Diablo II Resurrected and MF Timer.
2. Restart the Sanctuary Companion dev server after updating the code.
3. Open the Terror Zone dialog and choose **How to restore time**.
4. Click **Restore Windows Clock to Present** and accept the UAC prompt.
5. If restore fails, inspect `%LOCALAPPDATA%\SanctuaryCompanion\W32Time-error.txt` and keep `W32Time-state.json` intact for another recovery attempt.

Do not delete the recovery state or manually edit the save files while the system clock is still pinned.
