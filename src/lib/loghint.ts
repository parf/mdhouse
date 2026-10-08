/**
 * How to read what a detached daemon says — or null when nothing keeps it.
 *
 * Its output goes through `logger` to the system log, so the right command depends on what that
 * log is here: the unified log on macOS, journald where it runs, a syslog file elsewhere. A
 * container often has no `logger` and no log at all, and pointing at `journalctl` there sends
 * people looking in a place that does not exist.
 */
export interface Host {
  platform: string;
  /** Is this command on the PATH? */
  which: (cmd: string) => boolean;
  exists: (path: string) => boolean;
  /** Can this user read the file? A syslog file is often root's alone. */
  readable: (path: string) => boolean;
}

export function logHints(h: Host): { recent: string; follow: string } | null {
  if (!h.which('logger')) return null;
  if (h.platform === 'darwin') {
    return {
      recent: `log show --last 10m --predicate 'process == "logger"'`,
      follow: `log stream --predicate 'process == "logger"'`,
    };
  }
  if (h.which('journalctl') && h.exists('/run/systemd/journal')) {
    return { recent: 'journalctl -t mdhouse -n 20', follow: 'journalctl -t mdhouse -f' };
  }
  const file = ['/var/log/syslog', '/var/log/messages'].find((f) => h.readable(f));
  return file ? { recent: `grep mdhouse ${file} | tail -20`, follow: `tail -f ${file} | grep mdhouse` } : null;
}
