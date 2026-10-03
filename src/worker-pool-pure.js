// ═══════════════════════════════════════════════════════════════════════
// worker-pool-pure.js — HOW MANY THREADS, AND WHICH WORK MAY LEAVE THE LOOP.
// ═══════════════════════════════════════════════════════════════════════
//
// 🔑 WHY THREADS AT ALL, STATED HONESTLY BECAUSE THE NUMBER MATTERS LESS THAN
//    THE SHAPE. This daemon is SINGLE-THREADED, so while it builds one action's
//    answer it accepts nobody: every other agent's frames queue behind it, and
//    on Windows a loop starved long enough stops draining its accept queue at
//    all. The promise of a pool is therefore THROUGHPUT UNDER CONCURRENT
//    ACTIONS, never the latency of one action taken alone — say it that way to
//    anyone who asks, and never sell it as the cure for a slow client.
//
// 🛑 EXACTLY ONE PIECE OF WORK LEAVES THE LOOP, AND THE REASON IS THE LOCK.
//    `pretool-core.run` takes the cross-process lock and `lock.js` BUSY-WAITS,
//    so an async critical section would let one request hold the lock while
//    another spins for the full deadline — a self-deadlock that reads as a slow
//    daemon (`http-lane.md` forbids it in those words). **The COLLECTION is
//    outside that lock** (`pretool-core` calls `collect` before `withLock`), it
//    reads the document corpus and never the state, and it is the expensive
//    half. That is what a worker may do. 🛑 SI you want to move anything else
//    onto a thread, you MUST first prove it is reached OUTSIDE `withLock` —
//    nothing else in this file makes that safe.
//
// 🔑 THE FACADE IS THE ACCEPTANCE CRITERION, NOT THE SPEED (operator, binding):
//    identical TO THE BYTE for the agents, the inside free. That holds here by
//    construction — the worker runs the SAME `collect-core.collectAll` on the
//    SAME payload; nothing is reimplemented, so there is no second dialect to
//    drift. What a differential still has to prove is that the ROUTING did not
//    change what reaches an agent.
//
// 📐 `auto` FOLLOWS nginx's PUBLISHED CONVENTION (`worker_processes number |
//    auto;`, default `1`), because an adopter already knows that word. What it
//    resolves to is OURS and it is DELIBERATELY not "one per core": this daemon
//    shares its machine with the harness, sixteen MCP servers and the agents
//    themselves, so taking every core would starve the very clients it serves.
// 🛑 AND THE DEFAULT IS `0` — NO POOL AT ALL, i.e. today's behaviour BYTE FOR
//    BYTE. A capability that arrives switched on changes production for people
//    who never asked; nginx ships `1` for the same reason.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

/** No pool. The value an absent declaration resolves to, and the historical behaviour. */
const NONE = 0;

/**
 * Ceiling on `auto`, and on any declared number.
 *
 * ⚠️ A CEILING IS NOT A PREFERENCE. Every worker is a V8 isolate with its own
 *    heap and its own copy of the corpus once it has read one, so the cost is
 *    MEMORY, paid for the life of the daemon. Eight is already far beyond what
 *    the measured load needs (the harness opens at most one connection at a
 *    time per agent) and it leaves a twelve-core machine four cores for the
 *    agents, the harness and the sixteen MCP servers that share it.
 */
const MAX_WORKERS = 8;

/**
 * Is this a whole number? The ONE type test every count of this module goes through.
 *
 * 🛑 THE `typeof` STAYS, AND ITS MUTANT IS DECLARED EQUIVALENT HERE, ONCE. `Number.isInteger`
 *    never coerces (ECMAScript: false for anything whose type is not Number), so replacing
 *    the `typeof` by `true` changes no answer on any input. It is kept on purpose: it is the
 *    explicit type guard of a contract that reads `unknown`, and a removal is mandated, never
 *    discovered by a score. It used to be written at seven sites, i.e. seven equivalent
 *    mutants and seven places to forget it; one helper is one guard and one declaration.
 * @param {unknown} x
 * @returns {x is number}
 */
function isWholeNumber(x) {
  // Stryker disable next-line ConditionalExpression: equivalent, see the block above.
  return typeof x === 'number'
    && Number.isInteger(x);
}

/**
 * What `auto` resolves to for a given core count.
 *
 * 📐 HALF THE CORES, BOUNDED — never one per core. This process is a SERVICE
 *    sharing a workstation with the very clients it answers; a pool that takes
 *    the whole machine makes the harness slower, and the harness is the client
 *    whose slowness this daemon already cannot fix.
 * ⚠️ A machine reporting one core, or reporting nonsense, still gets ONE worker
 *    rather than none: `auto` means "decide for me", and answering "no pool"
 *    would silently ignore a declaration the operator did write.
 *
 * 🔴 AND IT IS BOUNDED BY THE SOCKET COUNT TOO — added 2026-09-20 because the
 *    first form made the ONE configuration an adopter actually types refuse to
 *    start. `http.listeners` defaults to FOUR and `auto` on a twelve-core
 *    machine answered SIX, so `assignSockets` refused by name: a thread with no
 *    socket has nothing to accept. 🔑 The asymmetry is deliberate and it is the
 *    difference between the two words: `auto` means *"decide for me"*, so
 *    deciding includes not asking for more threads than there are sockets; an
 *    EXPLICIT number is a declaration, and a declaration that cannot be honoured
 *    is refused rather than quietly reduced.
 * ⚠️ An absent socket count clamps nothing — that keeps every caller that only
 *    asks "what does this machine deserve" answering exactly as before.
 *
 * @param {unknown} cores what the platform reports
 * @param {unknown} [listeners] how many listening sockets are declared
 * @returns {number} between 1 and `MAX_WORKERS`
 */
function resolveAuto(cores, listeners) {
  const half = !isWholeNumber(cores) ||
    // Stryker disable next-line ConditionalExpression,EqualityOperator: EQUIVALENT, the test
    //    STAYS. Zero or a negative count floors to <= 0 and `Math.max(1, …)` below turns it
    //    into 1 — the very value this branch answers — and so does `1` itself. It is kept
    //    because it SAYS that a core count below one is not a measurement.
    cores < 1
    ? 1
    : Math.max(1, Math.min(MAX_WORKERS, Math.floor(cores / 2)));
  if (!isWholeNumber(listeners) || listeners < 1) return half;
  return Math.max(1, Math.min(half, listeners));
}

/**
 * The size of the pool, from what the config declares and what the machine has.
 *
 * 🛑 AN INVALID DECLARATION IS A NAMED REFUSAL, NEVER A QUIET FALLBACK — the
 *    same law every other declared address in this repository follows. Falling
 *    back to a default would leave the operator believing a pool exists where
 *    none does, which is exactly the silent class this project refuses.
 *
 * @param {unknown} declared the `workers` config value, or undefined
 * @param {unknown} cores what the platform reports
 * @param {unknown} [listeners] how many listening sockets are declared — it
 *   bounds `auto` ONLY, never an explicit number (cf `resolveAuto`)
 * @returns {{ size: number, refusal: string|null }} `refusal` non-null ⇒ the
 *   caller must REPORT it and start no pool; `size` is then `NONE`.
 */
function poolSize(declared, cores, listeners) {
  if (declared === undefined || declared === null) return { size: NONE, refusal: null };
  if (declared === 'auto') return { size: resolveAuto(cores, listeners), refusal: null };
  if (isWholeNumber(declared) && declared >= 0) {
    if (declared > MAX_WORKERS) {
      return {
        size: NONE,
        refusal: `\`workers\` is ${declared}, above the ceiling of ${MAX_WORKERS}. `
          + 'Every worker is a V8 isolate holding its own copy of the corpus, and this daemon '
          + 'shares its machine with the agents it serves. Declare a number in 0..'
          + `${MAX_WORKERS}, or \`auto\`.`,
      };
    }
    return { size: declared, refusal: null };
  }
  return {
    size: NONE,
    refusal: `\`workers\` must be an integer in 0..${MAX_WORKERS} or the word "auto" `
      + `(nginx's convention), received ${JSON.stringify(declared)}. `
      + 'Nothing is assumed: a pool the operator did not declare would change production in silence.',
  };
}

/**
 * WHICH THREAD HOLDS WHICH LISTENING SOCKET.
 *
 * 🔴 SOCKETS AND THREADS ARE TWO DIFFERENT NUMBERS, AND CONFLATING THEM WAS MY
 *    FIRST DESIGN — the operator caught it: *"there are configurations where
 *    there can be more sockets than threads"*. He is right, and today's
 *    production already IS one: **four sockets, one thread**.
 *    · a SOCKET buys ACCEPT QUEUE — 232 per socket on Windows, MEASURED, and
 *      strictly linear (1 → 232 · 2 → 464 · 4 → 928). It is the only lever that
 *      moved that ceiling, the backlog constant and `SOMAXCONN_HINT` being dead
 *      from this runtime.
 *    · a THREAD buys PARALLELISM — one more core actually doing the work.
 *    An operator on a small machine with bursty clients wants many sockets and
 *    few threads; one on a big quiet machine wants the reverse. Forcing them
 *    equal would take a capacity away from both.
 * 🛑 THE ONE CONSTRAINT IS `workers <= listeners`: a thread with no socket has
 *    nothing to accept, so it would be a V8 isolate and its heap for nothing.
 *    That is refused by NAME rather than clamped — clamping would start a pool
 *    of a size the operator never declared.
 * ⚠️ THE DISTRIBUTION IS DETERMINISTIC AND BALANCED: socket i goes to thread
 *    `i % workers`, so the leftovers land on the FIRST threads and no thread is
 *    ever two sockets behind another. A rotation here is legitimate where it was
 *    not for work: sockets are assigned ONCE, at startup, and they are
 *    interchangeable — nothing is known about how busy each will be.
 *
 * @param {unknown} listeners how many sockets the config declares
 * @param {unknown} workers how many threads the pool will hold
 * @returns {{ assignment: number[][]|null, refusal: string|null }} `assignment[t]`
 *   = the socket indices thread `t` owns
 */
function assignSockets(listeners, workers) {
  if (!isWholeNumber(listeners) || listeners < 1) {
    return {
      assignment: null,
      refusal: `\`http.listeners\` must be a positive integer, received ${JSON.stringify(listeners)}.`,
    };
  }
  if (!isWholeNumber(workers) || workers < 1) {
    return {
      assignment: null,
      refusal: `the pool size must be a positive integer here, received ${JSON.stringify(workers)}. `
        + 'A pool of zero is decided by `poolSize`, never by this distribution.',
    };
  }
  if (workers > listeners) {
    return {
      assignment: null,
      refusal: `\`workers\` is ${workers} but only ${listeners} socket(s) are declared. `
        + 'A thread with no socket has nothing to accept — it would cost a V8 isolate and its heap '
        + `for nothing. Declare \`http.listeners\` >= ${workers}, or lower \`workers\`. `
        + 'Nothing is clamped: a pool of a size you did not declare is a pool you cannot reason about.',
    };
  }
  const assignment = Array.from({ length: workers }, () => []);
  for (let socket = 0; socket < listeners; socket += 1) {
    assignment[socket % workers].push(socket);
  }
  return { assignment, refusal: null };
}

/**
 * Which worker takes the next piece of work.
 *
 * 🛑 LEAST-LOADED, NEVER ROUND-ROBIN, AND THAT IS A MEASURED LESSON FROM
 *    ELSEWHERE IN THIS REPOSITORY: Node's own `cluster` defaults to letting the
 *    OS choose on Windows, and its documentation records the result — *"over
 *    70% of all connections ended up in just two processes, out of a total of
 *    eight"*. A rotation is blind to how long each piece of work takes; the
 *    depth of each queue is the only fact that is actually known here.
 * ⚠️ TIES GO TO THE LOWEST INDEX so the choice is DETERMINISTIC — a pool that
 *    picks differently on two identical states cannot be reasoned about, and a
 *    test of it would be a coin toss.
 *
 * @param {unknown[]|unknown} loads in-flight count per worker, index-aligned
 * @returns {number} the index to dispatch to, or -1 when there is nobody
 */
function nextWorker(loads) {
  if (!Array.isArray(loads) ||
    // Stryker disable next-line ConditionalExpression: EQUIVALENT, the test STAYS. An empty
    //    list runs the loop zero times and answers the same -1; the early return says it.
    loads.length === 0) return -1;
  let best = -1;
  let bestLoad = Infinity;
  // Stryker disable next-line EqualityOperator: EQUIVALENT. One step past the end reads
  //    `undefined`, which the whole-number test below skips — the same answer.
  for (let i = 0; i < loads.length; i += 1) {
    const load = loads[i];
    if (!isWholeNumber(load) || load < 0) continue;
    if (load < bestLoad) { bestLoad = load; best = i; }
  }
  return best;
}

/**
 * May THIS request's work leave the loop?
 *
 * 🛑 FAILS TOWARDS THE LOOP, ALWAYS. Anything unanswerable — no pool, no
 *    invocation id, an action already collected — is done on the main thread,
 *    which is today's behaviour byte for byte. A dispatch decided on a doubt is
 *    how one action's corpus reaches another.
 * ⚠️ ONLY THE FIRST FRAME OF AN ACTION IS ELIGIBLE: the other thirty-one answer
 *    from the memo, so dispatching them would pay a thread hand-off to skip
 *    work that no longer exists.
 *
 * @param {unknown} size the pool size
 * @param {unknown} invocationId `tool_use_id`, or ''
 * @param {unknown} alreadyCollected whether this action's accumulator exists
 * @returns {boolean}
 */
function mayOffload(size, invocationId, alreadyCollected) {
  if (!isWholeNumber(size) || size < 1) return false;
  if (typeof invocationId !== 'string' || invocationId === '') return false;
  return alreadyCollected !== true;
}

module.exports = { NONE, MAX_WORKERS, resolveAuto, poolSize, assignSockets, nextWorker, mayOffload };
