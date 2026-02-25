# Fork Notes

This is a fork of [chikkadb-ts](https://github.com/athkishore/chikkadb-ts) with patches to improve stability and MongoDB Compass compatibility.

## Branch structure

- **`main`** — tracks upstream. Not modified directly.
- **`dev`** — integration branch. Feature branches merge here.
- **`fix/*`** — individual fix branches merged into `dev`.

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
