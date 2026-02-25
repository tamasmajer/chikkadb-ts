# Fork Notes

This is a fork of [chikkadb-ts](https://github.com/athkishore/chikkadb-ts) with patches to improve stability and MongoDB Compass compatibility.

## Branch structure

- **`main`** — tracks upstream. Not modified directly.
- **`dev`** — integration branch. Feature branches merge here.
- **`fix/*`** — individual fix branches merged into `dev`.
- **`feat/*`** — feature branches merged into `dev`.

## Changes

### fix/checksum — Wire protocol checksum handling
MongoDB Compass sends OP_MSG messages with `flagBits` set to 65536 (checksum bit), appending a 4-byte CRC32C checksum to the message. The wire parser did not account for this, reading the checksum bytes as part of the payload and corrupting the decoded message.

**Fix:** Detect the checksum flag and exclude the trailing 4 bytes from section parsing.

### fix/compass-stats — Compass collection/database stats + crash protection
Compass could connect and list collections but not display their documents. Three issues:

1. **Missing `$collStats` / `dbStats`:** Compass sends a `$collStats` aggregate pipeline and `dbStats` command to get collection metadata before showing documents. Both were unsupported, returning empty results. Compass got stuck waiting for stats that never came.

   **Fix:** Intercept these specific query patterns before the normal pipeline and return approximate stats queried from SQLite (row count, total doc size, file size).

2. **Projection parser crash:** Compass sends projections with operator expressions like `{$meta: "textScore"}`. The parser only handled `1`, `0`, or nested field objects — anything else caused infinite recursion and a stack overflow.

   **Fix:** Skip projection expressions containing `$` operators.

3. **No error handling in socket handler:** Any unhandled error during message processing (unsupported command, parse failure, etc.) crashed the entire server process, dropping all connections.

   **Fix:** Wrap the socket data handler in try-catch. Errors are logged and the affected connection is closed; the server stays alive.

### feat/tls-auth — TLS encryption and SCRAM-SHA-256 authentication
Enable secure remote access from MongoDB Compass and Node.js drivers without needing an SSH tunnel. A single fixed credential is configured via CLI args — no user management.

**Connection string:** `mongodb://admin:secret@host:27018/?tls=true&tlsAllowInvalidCertificates=true`

1. **TLS support:** `--tls`, `--tlsCert <path>`, `--tlsKey <path>` flags wrap the TCP server in `tls.createServer`. Without these flags, behaves as before (plain TCP).

2. **SCRAM-SHA-256 auth:** `--authUser <user>`, `--authPass <pass>` flags enable MongoDB's standard authentication handshake. At startup, the password is hashed via PBKDF2 and stored in memory. The SCRAM conversation (saslStart/saslContinue) follows RFC 5802. Only whitelisted commands (hello, ismaster, ping, buildInfo, getParameter) are allowed before authentication.

3. **Graceful command error handling:** Previously, any command-level error (e.g. unsupported `$type` operator) propagated to the socket handler and called `sock.destroy()`, killing the connection pool. Now errors in command execution are caught and returned as proper MongoDB error responses (`{ ok: 0, errmsg, code }`) while keeping the socket alive.

4. **findAndModify null doc fix:** `findAndModify` crashed with `"undefined" is not valid JSON` when the query matched no rows. Now returns `{ ok: 1, value: null }` as MongoDB does.

**New files:** `auth/credential.ts`, `auth/scram.ts`, `auth/handlers.ts`, `connection.ts`

**Known limitation:** Compass document editing requires docs to have an explicit `_id` field. ChikkaDB does not auto-generate ObjectIds on insert like MongoDB, so Compass sends `_id: null` in the filter and the update matches nothing.
