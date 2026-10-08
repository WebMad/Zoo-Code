# Codex WebSocket transport

The `openAiCodexUseWebSocket` provider preference enables WebSocket streaming for
OpenAI Codex authenticated with a ChatGPT subscription. It defaults to `false`.
The Settings view buffers the checkbox in the selected provider profile until
Save. Provider schemas, profile storage, import/export, and the existing
`apiConfiguration` webview round trip carry the value without a separate global
setting or environment variable.

## Responsibilities

- `CodexWebSocketTransport` translates requests into `response.create`, emits the
  ordinary Responses events, and enforces one active request. The provider's existing event processor handles
  text, reasoning, tools, and usage for both HTTP and WebSocket streams.
- `CodexWebSocketRequestScope` combines caller cancellation with the request's
  inactivity deadline and releases its timer and abort listener when disposed.
- `CodexWebSocketResponse` tracks output, completion, and the one permitted
  cache-miss recovery independently of socket IO.
- `CodexWebSocketConnection` owns authentication, the socket, and connection
  lifetime. It rotates before one hour, reconnects when headers change, closes
  after two idle minutes, and throttles failed upgrades for one minute. New
  credentials bypass that cooldown.
- `CodexWebSocketContinuation` retains the cached response and compares request
  settings and history prefixes to decide whether continuation is safe. Real edits,
  compaction, or an explicit reset require full context.
- `CodexWebSocketItemSnapshot` normalizes history items and retains only hashes.
  Response-only metadata does not cause false mismatches, and diagnostics identify
  changed fields without retaining messages or encrypted payloads.
  `PreparedCodexRequest` defines the shared request contract in a separate file.

The subscription endpoint is `wss://chatgpt.com/backend-api/codex/responses` and
uses the Codex `responses_websockets=2026-02-06` beta header and Responses Lite
metadata. This is distinct from the public API-key Responses endpoint.

## Recovery rules

An HTTP upgrade failure allows the provider's existing HTTP fallback. After a
request is sent, a disconnect or protocol error must not automatically replay it:
the server may already have accepted it. A `previous_response_not_found` error
permits exactly one full-context resend, only before any response event arrives.
Failed or incomplete responses preserve the server error details. Stop closes
the connection and clears continuation; the next request starts with full context.

Reasoning summaries and encrypted reasoning are saved together in conversation
history. The encrypted state is replayed to the provider; the visible summary is
kept for display. This preservation applies to HTTP providers too.

## Verification

Loopback WebSocket tests cover connection reuse, incremental input, history
changes, cancellation, timeout, rotation, idle cleanup, cache recovery, upgrade
fallback and refreshed credentials. Provider integration tests cover routing and
preventing ambiguous HTTP replays. Settings tests cover cached editing, Save,
profile persistence, import/export and the host-to-webview round trip for true,
false and unset values. The Codex settings gallery covers both checkbox states in
light and dark themes.
