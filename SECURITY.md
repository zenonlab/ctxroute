# Security Policy

## Scope — what ctxroute is, and is not

ctxroute is a **guardrail, not a security boundary**. Its hooks are fail-open
by design: if a hook dies, the harness proceeds without it. `enforce: true`
refuses an action, but it protects against a distracted agent — never against
an adversary who controls the machine or the harness. Do not rely on it for
access control.

The engine spawns no network connection, ships zero runtime dependencies, and
reads/writes only its own folder (`state/`, `docs/`) plus the harness payload
it is given.

## Reporting a vulnerability

If you find an issue with security impact (e.g. a crafted doc or payload that
escapes the declared perimeter, injects into the wrong session, or executes
content), please open a **private security advisory** on GitHub rather than a
public issue. You should receive a response within a week.

## Supported versions

Only the latest released version is supported.
