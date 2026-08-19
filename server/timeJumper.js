import { exec } from 'child_process';

export function setWindowsTime({ datetime, restore }, execFn = exec) {
  return new Promise((resolve, reject) => {
    let script;
    if (restore) {
      script = `powershell -Command "Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-Command Start-Service W32Time -ErrorAction SilentlyContinue; W32tm /resync /force'"`;
    } else {
      if (!datetime) return reject(new Error('Missing datetime parameter'));
      script = `powershell -Command "Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-Command Stop-Service W32Time -ErrorAction SilentlyContinue; Set-Date -Date ([datetime]''${datetime}'')'"`;
    }

    execFn(script, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true });
      }
    });
  });
}
