// installer-no-wall-gate — an INSTALLER may never refuse over a kernel setting.
//
// 🔴 THE CLASS, PAID THE SAME DAY IT SHIPPED (2026-09-17). `install-linux.sh` gained
//    a precondition refusing to install whenever `net.core.somaxconn` sat below
//    4096, on the theory that a small accept queue caused the ECONNREFUSED burst
//    this project had been chasing. Hours later the theory was measured DEAD: the
//    daemon's own high-water mark reads 32 against a queue measured at 232, and a
//    packet capture showed the refusals carry no connection attempt on the wire.
// 🛑 EVERY OTHER ARTEFACT OF THAT THEORY IS INERT — a declared constant, a
//    `Backlog=` line — and costs a stranger nothing. That one REFUSED THE INSTALL
//    of an adopter whose kernel is fine. **A guardrail with no measured disease is
//    not neutral: it is a denial of service aimed at your own users**, and this
//    repository ships to strangers.
//
// ⚠️ THE RULE IS DECIDABLE AND NARROW, never "do not mention the subject": the
//    installer must not READ the kernel value at all. Reading it is the DAEMON's
//    job — at startup, as a journal field, the Redis pattern. Two files, two roles,
//    and the remedy therefore passes freely: a judge that blocks its own way out is
//    disarmed within the day.
// ⚠️ AND THE SECOND CELL IS THE ANTI-VACUITY THAT MAKES THE FIRST HONEST: deleting
//    the observation would make cell ① pass FOREVER while the knowledge quietly
//    disappeared. The pair holds; neither half alone does.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const KERNEL_FILE = '/proc/sys/net/core/somaxconn';

test('① the Linux installer READS no kernel tunable, hence can refuse over none', () => {
  const script = fs.readFileSync(path.join(root, 'service', 'install-linux.sh'), 'utf8');
  // A comment may NAME the file — the history of why this rule exists is written
  // there on purpose. What is forbidden is a READ: a `cat`, a redirect, a `$(…)`
  // that pulls the value into a variable a test can then refuse on.
  const lines = script.split('\n').filter((l) => !l.trim().startsWith('#'));
  const reads = lines.filter((l) => l.includes(KERNEL_FILE));
  assert.deepEqual(reads, [],
    'service/install-linux.sh reads the kernel accept-queue ceiling. An installer that '
    + 'can read it is one line from refusing over it, and that wall was removed on '
    + '2026-09-17 for a defect measured absent. The daemon observes this at startup '
    + '(src/hooks/http-server.js) and records it as a journal field — never a refusal.');
});

test('② ANTI-VACUITY: the daemon DOES observe it, so cell ① is not passing over a void', () => {
  const daemon = fs.readFileSync(path.join(root, 'src', 'hooks', 'http-server.js'), 'utf8');
  assert.ok(daemon.includes(KERNEL_FILE),
    'nobody reads the kernel ceiling any more. Removing the WALL was right; removing the '
    + 'OBSERVATION with it would leave a declared backlog silently capped and nothing to '
    + 'say so — exactly the silent degradation this repository refuses.');
  assert.ok(daemon.includes('backlogFields'),
    'the reading no longer reaches the pure decision, so the journal says nothing about it');
});
