import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every test runs against its own config dir: control sockets and prefs never land beside a
// running mdhouse's in ~/.config/mdhouse. Set before any module reads it (CONFIG_DIR is fixed at import).
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'mdhouse-test-cfg-'));
