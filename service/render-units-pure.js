'use strict';

// ═══════════════════════════════════════════════════════════════════════
// THE LISTENING SOCKETS OF A SUPERVISOR UNIT — RENDERED, NEVER HAND-TYPED
// ═══════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS EXISTS (2026-09-19). `http.listeners` became a real knob, and under
//    socket activation the SUPERVISOR binds — so the number lived in the
//    configuration AND in the unit, and the daemon REFUSES to start when the two
//    disagree. An adopter changing one number had to remember to change a second
//    file on another syntax, or their service stopped coming up. One truth in two
//    places is the class this repository removes everywhere else; noting it in a
//    backlog would have been the "later" that means never.
// 🔑 SO THE CONFIGURATION IS THE SOURCE AND THE UNITS ARE DERIVED, exactly as
//    `tools/wiring-generate.js` derives the harness wiring from the same address.
//    The installer renders; nobody edits a socket count by hand again.
// ⚠️ PURE ON PURPOSE — text in, text out, endpoints INJECTED. Rendering is a
//    DECISION and decisions are testable and mutable; the I/O shell that reads a
//    file and writes it back proves nothing on its own. It is also why this can
//    be proven on Windows, where neither supervisor exists.
// 📚 DOC-FIRST, sources read 2026-09-19:
//    · systemd.socket(5) — `ListenStream=` "may be specified more than once, in
//      which case … all listed sockets will be passed to the service", and a
//      daemon receiving several descriptors gets them "in the same order as
//      configured in the systemd socket unit file".
//      https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html
//    · launchd.plist(5) — `Sockets` is a "dictionary of dictionaries … OR
//      dictionary of array of dictionaries", and `launch_activate_socket()`
//      returns an array of descriptors with its count.
//      https://www.manpagez.com/man/5/launchd.plist/
// 🛑 NEITHER FORMAT IS INVENTED HERE. If a rendering ever needs a shape these two
//    pages do not describe, the page is the authority — not this file.

/**
 * A named refusal, never a silent half-render.
 * @param {string} why
 * @returns {never}
 */
function refuse(why) {
  throw new Error(`ctxroute: cannot render the listening sockets — ${why}`);
}

/**
 * @param {{host: string, port: number}[]} endpoints
 */
function checkEndpoints(endpoints) {
  if (!Array.isArray(endpoints) || endpoints.length < 1) {
    refuse('no endpoint was given. The configuration always resolves at least one, '
      + 'so an empty list means the caller never asked `paths.httpListenEndpoints()`.');
  }
  for (const e of endpoints) {
    if (!e || typeof e.host !== 'string' || !Number.isInteger(e.port)) {
      refuse(`an endpoint is malformed: ${JSON.stringify(e)}. Expected {host, port}.`);
    }
  }
}

/**
 * Rewrite the `ListenStream=` lines of a systemd socket unit.
 *
 * ⚠️ THE EXISTING BLOCK IS REPLACED WHERE IT STANDS, never appended to: two blocks
 *    would make systemd open the union of both, which is a capacity nobody
 *    declared. The surrounding comments are untouched — they carry the reasoning
 *    and it is not this function's to rewrite.
 * 🛑 A unit with NO `ListenStream=` is a REFUSAL, not an insertion point. We would
 *    have to guess where it belongs, and a socket unit without one was never a
 *    unit of ours.
 *
 * @param {string} text the unit as shipped
 * @param {{host: string, port: number}[]} endpoints
 * @returns {string}
 */
function renderSystemdSocket(text, endpoints) {
  checkEndpoints(endpoints);
  if (typeof text !== 'string' || text.trim() === '') refuse('the unit text is empty.');

  const lines = text.split('\n');
  const isDeclaration = (l) => /^\s*ListenStream\s*=/.test(l);
  const first = lines.findIndex(isDeclaration);
  if (first === -1) {
    refuse('this unit declares no `ListenStream=` at all. Refusing to guess where '
      + 'the listening sockets belong.');
  }
  // ⚠️ A WALK OVER WHAT FOLLOWS, NEVER AN INDEX BOUND (2026-10-01): the former
  //    `last + 1 < lines.length` guard was redundant (`isDeclaration(undefined)`
  //    tests the string "undefined" and answers false), so three mutants of it
  //    could never die. The block still ends at the first non-declaration line.
  let last = first;
  for (const l of lines.slice(first + 1)) {
    if (!isDeclaration(l)) break;
    last += 1;
  }

  const rendered = endpoints.map((e) => `ListenStream=${e.host}:${e.port}`);
  return [...lines.slice(0, first), ...rendered, ...lines.slice(last + 1)].join('\n');
}

/**
 * Rewrite the `Listeners` value of a launchd plist.
 *
 * ⚠️ ALWAYS AN ARRAY, even for ONE socket. launchd accepts a bare dictionary too,
 *    but emitting two shapes depending on a count means two code paths, two
 *    parsers on the reading side and a difference nobody can see the reason for.
 *    The man page documents the array form for exactly this purpose.
 * 🛑 THE INDENTATION IS COPIED FROM THE KEY WE FOUND, never assumed: this file is
 *    read by humans and a plist whose diff is pure whitespace hides the one line
 *    that changed.
 *
 * @param {string} text the plist as shipped
 * @param {{host: string, port: number}[]} endpoints
 * @returns {string}
 */
function renderLaunchdPlist(text, endpoints) {
  checkEndpoints(endpoints);
  if (typeof text !== 'string' || text.trim() === '') refuse('the plist text is empty.');

  const key = '<key>Listeners</key>';
  const at = text.indexOf(key);
  if (at === -1) {
    refuse('this plist declares no `Listeners` socket entry. Either socket activation '
      + 'was removed on macOS — a decision that belongs in its own document — or the '
      + 'caller handed the wrong file.');
  }
  if (text.indexOf(key, at + key.length) !== -1) {
    refuse('this plist declares `Listeners` twice. Two entries are two sockets sets, '
      + 'and which one launchd keeps is not ours to guess.');
  }

  const lineStart = text.lastIndexOf('\n', at) + 1;
  const before = text.slice(lineStart, at);
  // 🔴 INDENTATION IS WHITESPACE, NEVER "whatever precedes the key on its line" —
  //    MEASURED 2026-09-19, and the module produced CORRUPT XML until then. This
  //    read `text.slice(lineStart, at)` whole, so on a plist written on ONE line
  //    it took `<plist><dict>` for indentation and re-emitted it in front of every
  //    rendered line: 47 opening tags against 5 closing ones, handed to launchd,
  //    which reads malformed XML as NO SOCKET AT ALL — in silence.
  // 🛑 THE BYTE-FOR-BYTE CELL ON THE SHIPPED FILE COULD NOT SEE IT: that file is
  //    pretty-printed, so the slice happened to be whitespace and the bug was
  //    invisible on the only input anyone tested. A green on the shape you ship
  //    is not a green on the shapes you accept.
  //    Not whitespace ⇒ the key is not at the head of its line, so there is no
  //    indentation to inherit and the empty string is the honest answer.
  const indent = /^\s*$/.test(before) ? before : '';
  const inner = `${indent}    `;

  // The value follows the key: either <dict>…</dict> or <array>…</array>.
  const after = text.slice(at + key.length);
  // ⚠️ `!opens` IS THE WHOLE GUARD: a successful `exec` always carries `index`
  //    (ECMAScript RegExpBuiltinExec), so the former `opens.index === undefined`
  //    disjunct was unreachable and its mutant could never die (2026-10-01).
  const opens = /<(dict|array)>/.exec(after);
  if (!opens) refuse('the `Listeners` key has no value element.');
  const tag = opens[1];
  // ⚠️ DEPTH-COUNTED, never a lazy regex: a dictionary of dictionaries nests, and
  //    the FIRST closing tag is not the matching one.
  // 🔑 TAG BY TAG, NOT CHARACTER BY CHARACTER (2026-10-01): the old per-character
  //    walk had an equivalent bound (`<` vs `<=` on the length). The opening tag
  //    is consumed BEFORE the loop on purpose: starting at depth 1 breaks the
  //    symmetry that would let an inverted count (+1 for a close, -1 for an open)
  //    reach zero on the very same tag and survive every fixture.
  const tokens = new RegExp(`<(/?)${tag}>`, 'g');
  tokens.lastIndex = opens.index + opens[0].length;
  let depth = 1;
  let end = -1;
  for (let m = tokens.exec(after); m !== null; m = tokens.exec(after)) {
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) { end = tokens.lastIndex; break; }
  }
  if (end === -1) refuse(`the \`Listeners\` <${tag}> is never closed.`);

  const entries = endpoints.map((e) => [
    `${inner}<dict>`,
    `${inner}    <key>SockNodeName</key>`,
    `${inner}    <string>${e.host}</string>`,
    `${inner}    <key>SockServiceName</key>`,
    `${inner}    <string>${e.port}</string>`,
    `${inner}    <key>SockType</key>`,
    `${inner}    <string>stream</string>`,
    `${inner}    <key>SockFamily</key>`,
    `${inner}    <string>IPv4</string>`,
    `${inner}</dict>`,
  ].join('\n')).join('\n');

  const value = `${indent}<array>\n${entries}\n${indent}</array>`;
  return text.slice(0, at + key.length)
    + after.slice(0, opens.index).replace(/[^\n]*$/, '')
    + value
    + after.slice(end);
}

module.exports = { renderSystemdSocket, renderLaunchdPlist };
