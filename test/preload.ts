import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every test runs against its own config dir: control sockets and prefs never land beside a
// running mdhouse's in ~/.config/mdhouse. Set before any module reads it (CONFIG_DIR is fixed at import).
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'mdhouse-test-cfg-'));

// No test sees the machine's real Agent Bus: its account socket is looked for only in a directory that does not exist
// (a new prefs file starts as `auto`, and the real daemon would turn the integration on). A test that needs a socket
// names its own directory.
process.env.MDHOUSE_AB_SOCKET_DIRS = join(mkdtempSync(join(tmpdir(), 'mdhouse-test-nobus-')), 'agent-bus');

// Machine state (automation approvals, the run index) never lands in the real ~/.local/state/mdhouse.
process.env.XDG_STATE_HOME = mkdtempSync(join(tmpdir(), 'mdhouse-test-state-'));
