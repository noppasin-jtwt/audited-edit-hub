# SQL Server API contract

The app talks to SQL Server through your own HTTPS API. Set two secrets:
`MDM_API_URL` (base URL) and `MDM_API_KEY`. Also set `SESSION_SECRET` (random, 32+ chars).
Until both API secrets are set, the app runs on built-in demo data
(users: `viewer`/`viewer123`, `editor`/`editor123`, `editor2`/`editor123`).

Every call: `POST {MDM_API_URL}/rpc`, header `x-api-key`, body `{ "action": string, "payload": object }`, JSON response.

| action | payload | returns |
|---|---|---|
| findUser | `{ username }` | `{ UserID, Username, PasswordHash, Role }` or `null` |
| countUsers | `{}` | number |
| list | `{ table }` | rows (all columns + `id`, `status`, `CreatedBy`, `CreatedDate`, `ModifiedBy`, `ModifiedDate`) |
| insert / update | `{ table, row }` | — (never DELETE; inactive = `status='INACTIVE'`) |
| addAudit | `{ id, at, user, action, table?, recordId?, recordCode?, changes?: [{field, old, new}], note? }` | — |
| listAudit | `{ table?, recordId?, limit? }` | entries, newest first |
| getLocks / setLock / clearLock | `{ table }` / `{ table, id, userId, username, expiresAt }` / `{ table, id, userId }` | locks not yet expired |

`table` is `HERUTU_S04` or `HERUTU_S25`. `PasswordHash` format: `pbkdf2$<iterations>$<saltBase64>$<hashBase64>` (PBKDF2-SHA256, 32-byte hash).
