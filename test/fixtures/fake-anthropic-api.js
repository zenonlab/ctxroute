#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// A FAKE Anthropic Messages API — a SCRIPTED model, so a real Claude Code
// session runs deterministically, offline, at zero token cost.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY: what `wrapUp` must prove on the real harness is Claude Code's side
//    (its hook payloads, its Stop handling, its mod events) and ours — never
//    what a model answers. A real model makes that proof cost tokens and vary
//    between runs; this script answers the same thing every time.
// ⚠️ THE SCRIPT (read off the LAST user message):
//    · a tool result came back      ⇒ text `DONE`
//    · the text asks to create file ⇒ a `Write` tool call on `argv[3]`
//    · anything else (a Stop hook's feedback, a later turn) ⇒ text `OK`
// ⚠️ USAGE IS DECLARED (`INPUT_TOKENS`, cache fields at 0): Claude Code derives
//    the context fill from it, and that is the figure the sensor mod reports.
// ⚠️ Prints its port on stdout once listening (argv[2] = 0 picks a free one);
//    logs every request line to stderr.
// ═══════════════════════════════════════════════════════════════════════
'use strict';

const http = require('http');

const port = Number(process.argv[2] || 0);
const target = process.argv[3];
const INPUT_TOKENS = 42000; // 21 % of a 200k window
const usage = (output) => ({ input_tokens: INPUT_TOKENS, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });

function lastUser(body) {
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const last = msgs[msgs.length - 1];
  if (!last) return { toolResult: false, text: '' };
  const parts = Array.isArray(last.content) ? last.content : [{ type: 'text', text: String(last.content) }];
  return { toolResult: parts.some((p) => p.type === 'tool_result'), text: parts.map((p) => p.text || '').join('\n') };
}

function reply(body) {
  const u = lastUser(body);
  if (u.toolResult) return [{ type: 'text', text: 'DONE' }];
  if (!/create the file/i.test(u.text)) return [{ type: 'text', text: 'OK' }];
  return [{ type: 'tool_use', id: 'toolu_fake_1', name: 'Write', input: { file_path: target, content: 'module.exports = 1;\n' } }];
}

const stopReason = (content) => (content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn');

function stream(res, model, content) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('message_start', { type: 'message_start', message: { id: 'msg_fake', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: usage(1) } });
  content.forEach((c, index) => {
    if (c.type === 'text') {
      send('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      send('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: c.text } });
    } else {
      send('content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: c.id, name: c.name, input: {} } });
      send('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(c.input) } });
    }
    send('content_block_stop', { type: 'content_block_stop', index });
  });
  send('message_delta', { type: 'message_delta', delta: { stop_reason: stopReason(content), stop_sequence: null }, usage: { output_tokens: 10 } });
  send('message_stop', { type: 'message_stop' });
  res.end();
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    process.stderr.write(`${req.method} ${req.url}\n`);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { /* not JSON: an empty body */ }
    if (req.url.startsWith('/v1/messages/count_tokens')) return json(res, 200, { input_tokens: INPUT_TOKENS });
    if (!req.url.startsWith('/v1/messages')) return json(res, 404, { type: 'error', error: { type: 'not_found_error', message: 'fake api' } });
    const content = reply(body);
    if (body.stream) return stream(res, body.model || 'fake', content);
    return json(res, 200, { id: 'msg_fake', type: 'message', role: 'assistant', model: body.model || 'fake', content, stop_reason: stopReason(content), stop_sequence: null, usage: usage(10) });
  });
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`${server.address().port}\n`));
