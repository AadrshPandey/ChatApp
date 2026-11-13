# ChatApp Server

The server is an Express HTTP API and native WebSocket service. It uses
MySQL for users and message records, Redis for active-socket routing and
cross-server pub/sub, and a JWT stored in an HttpOnly cookie for HTTP and
WebSocket authentication.

The repository root guide is [`../README.md`](../README.md). Client startup,
React state, encryption, and request callers are documented in
[`../Client/README.md`](../Client/README.md).

## Stack and current scripts

- Node.js ES modules.
- Express for REST endpoints and CORS.
- `ws` for WebSocket connections.
- `mysql2/promise` connection pool for SQL.
- ioredis for server presence and pub/sub.
- bcrypt for password hashing.
- jsonwebtoken for seven-day JWTs.
- uuid for user IDs.
- dotenv for local server configuration.

From the repository root:

```powershell
npm install --prefix Server
npm run dev --prefix Server
```

`npm run dev` invokes `nodemon index.js`. The current `Server/package.json` has
no `start`, build, migration, or test script. The application code does not
include a production process manager or TLS listener.

## Runtime structure

| Path | Responsibility |
| --- | --- |
| `index.js` | Loads dotenv, creates the HTTP server and no-server WebSocket server, checks WebSocket Origin/auth on upgrades, connects socket manager, pings MySQL, listens on `PORT`, and logs Redis events. |
| `app.js` | Configures credentialed CORS and `express.json()`, then mounts `/api/auth`, `/api/users`, and `/api/messages`. A health text route `/` is available only outside production. |
| `config/mysql.js` | Creates the MySQL promise pool. |
| `config/redis.js` | Creates the ioredis client. |
| `config/origins.js` | Parses comma-separated `CLIENT_ORIGIN` into an allowed-origin set. |
| `routes/authRoutes.js` | Registration, login, current-user, and logout routes. |
| `routes/userRoutes.js` | Authenticated user search and public-key routes. |
| `routes/messageRoutes.js` | Authenticated conversation history route. |
| `middleware/httpAuth.js` | Reads `chat_token` cookie, verifies JWT, and assigns `req.userId`. |
| `middleware/wsAuth.js` | Reads the cookie during HTTP upgrade and verifies JWT; rejects unauthenticated sockets. |
| `controllers/authController.js` | Validates credentials, hashes/checks passwords, issues/clears cookie, and returns session identity. |
| `controllers/userController.js` | Search users and get/update public keys. |
| `controllers/messageController.js` | Reads chronological history in both directions for a contact. |
| `sockets/socketManager.js` | Registers connections; drains offline messages; validates, persists, and routes incoming message events; manages Redis and heartbeat cleanup. |
| `docker-compose.yml` | Local MySQL and Redis services. Review its local credential configuration before use beyond development. |

The route/controller code accesses the database directly. There is no separate
service/business-logic layer or database migration directory in the project
tree.

## Configuration

Create `Server/.env` locally. Keep it out of version control and use strong,
deployment-specific secrets. This guide lists variable names only; it does not
include the values in any local environment file.

| Variable | Used by | Behavior/default |
| --- | --- | --- |
| `PORT` | `index.js` | HTTP/WebSocket server port; defaults to `3000`. |
| `NODE_ENV` | `app.js`, auth controller | Controls the development root route and secure cookie flag. |
| `JWT_SECRET` | Auth controllers and HTTP/WS auth middleware | Secret used to sign and verify JWTs; must be configured securely. |
| `COOKIE_SAME_SITE` | `authController.js` | Cookie SameSite value; defaults to `strict`. |
| `CLIENT_ORIGIN` | `config/origins.js`, `app.js`, `index.js` | Comma-separated exact frontend origins; defaults to `http://localhost:5173`. |
| `DB_HOST` | `config/mysql.js` | MySQL host; defaults to `127.0.0.1`. |
| `DB_PORT` | `config/mysql.js` | MySQL host port; defaults to `3307`. |
| `DB_USER` | `config/mysql.js` | Database user; defaults to `appuser`. |
| `DB_PASSWORD` | `config/mysql.js` | Database password; has no source default. |
| `DB_NAME` | `config/mysql.js` | Database name; defaults to `chatapp`. |
| `REDIS_HOST` | `config/redis.js` | Redis host; defaults to `localhost`. |
| `REDIS_PORT` | `config/redis.js` | Redis port; defaults to `6379`. |
| `SERVER_ID` | `sockets/socketManager.js` | Identifier for this server instance; defaults to `server1`. |

The included compose file exposes MySQL host port `3307` and Redis host port
`6379`. Configure `DB_*` to match the local MySQL service. The compose file
currently contains development credentials directly; replace them before
sharing or exposing the environment.

For cross-site frontend/API deployment, cookie policy and transport must agree:
the server sets `secure` only when `NODE_ENV === 'production'`; cross-site cookie
use requires HTTPS and an appropriate SameSite configuration. The client also
requires credentialed CORS and must use the exact allowed origin.

## Database prerequisite and inferred schema

**No schema DDL, migrations, or seed script is included.** The server code issues
SQL against the following tables and columns; these are code references, not a
verified schema contract:

| Table | Columns referenced by source |
| --- | --- |
| `users` | `id`, `username`, `password_hash`, `public_key` |
| `messages` | `id`, `sender_id`, `receiver_id`, `receiver_encrypted_content`, `sender_encrypted_content`, `created_at` |
| `offline_messages` | `id`, `sender_id`, `receiver_id`, `receiver_encrypted_content`, `sender_encrypted_content` |

Controllers use parameterized SQL for values. However, the application cannot
successfully serve auth, search, history, or message persistence until a
compatible schema exists. Define primary keys, indexes, foreign keys, timestamp
defaults, uniqueness for usernames, and retention policy deliberately for the
deployment; the repository does not establish those choices.

`index.js` requests a MySQL connection asynchronously and logs success/failure,
but starts listening independently. Therefore the server can begin accepting
connections even if the database is unavailable; requests relying on MySQL
will fail until the database is usable.

## Local startup

1. Start local dependencies from `Server/`:

   ```powershell
   docker compose up -d mysql redis
   ```

2. Create and configure `Server/.env` using the variable table above.
3. Provision a compatible MySQL schema. No automatic migration runs.
4. Install and start the backend from the repository root:

   ```powershell
   npm install --prefix Server
   npm run dev --prefix Server
   ```

5. In another terminal, install and start the client:

   ```powershell
   npm install --prefix Client
   npm run dev --prefix Client
   ```

6. If the client origin differs from the backend's default, set `CLIENT_ORIGIN`
   to the exact origin. The client development defaults target the backend at
   `localhost:3000`.

The root `GET /` health text is enabled only when `NODE_ENV` is not production.
It is a minimal process check; it does not prove that the database schema,
authentication, Redis routing, or the WebSocket path is healthy.

## HTTP middleware and authentication

`app.js` configures CORS with credentials and JSON parsing. Its origin callback
allows requests with no `Origin` header or an origin in `allowedOrigins`. The
route modules are mounted beneath `/api`.

`loginUser`:

1. Validates that username and password are strings.
2. Looks up the trimmed username in `users`.
3. Compares the submitted password with `password_hash` using bcrypt.
4. Signs `{ userId }` with `JWT_SECRET` and a seven-day expiry.
5. Sets `chat_token` as an HttpOnly cookie with `path=/`, configured SameSite,
   and `secure` enabled in production.
6. Returns `{ userId, username }`; token content is not returned in JSON.

`verifyHttpToken` reads the `chat_token` cookie from the request header and
verifies it with `jwt.verify`. On success it attaches the subject ID to
`req.userId`; missing/invalid tokens return `401`. `logoutUser` clears the
cookie using the same options. No server-side token revocation list is present;
logout clears the browser cookie.

The WebSocket upgrade is checked independently in `index.js`:

1. If an Origin header exists, reject it unless included in `allowedOrigins`.
2. `verifySocketWebToken` extracts and verifies `chat_token`.
3. Attach `req.userId`, then complete the WebSocket upgrade.

## HTTP API

| Method and path | Auth | Handler | Success result |
| --- | --- | --- | --- |
| `POST /api/auth/register` | Public | `registerUser` | `201 { message, userId }`; validates username/password, checks duplicate username, bcrypt-hashes, inserts user. |
| `POST /api/auth/login` | Public | `loginUser` | `200 { userId, username }` and sets cookie. |
| `GET /api/auth/me` | Cookie JWT | `getCurrentUser` | `200 { userId, username }`. |
| `POST /api/auth/logout` | No middleware | `logoutUser` | `200 { message }`; clears cookie. |
| `GET /api/users/search?q=...` | Cookie JWT | `searchUsers` | `200 [{ id, username }]`, maximum 20 and excludes current user. |
| `POST /api/users/public-key` | Cookie JWT | `uploadPublicKey` | JSON body `{ publicKey }`; updates the authenticated user's key; returns `{ message }`. |
| `GET /api/users/:id/public-key` | Cookie JWT | `getPublicKey` | `200 { publicKey }`; `404` if no such user. |
| `GET /api/messages/:contactId` | Cookie JWT | `chatHistory` | `200` array of conversation rows ordered by `created_at` ascending. |

Error responses are returned by the controllers as JSON. Observed status classes
include `400` for invalid/missing input, `401` for invalid session/credentials,
`404` for unknown public-key user, `409` for duplicate username, and `500` for
controller/database failures. Exact response object fields vary by handler
(`error` or `message`).

There are no REST endpoints for message creation, edit/delete, profile updates,
uploads, downloads, or notifications. Message creation is handled through the
WebSocket protocol.

## WebSocket message lifecycle

The server uses the `ws` package with a `WebSocketServer({ noServer: true })`
attached to the HTTP server. No Socket.IO protocol is used.

### Connection setup

`setUpSocketManager()` registers the authenticated connection in an in-memory
`activeSockets` map and sets `socket:${userId}` in Redis to this instance's
`SERVER_ID`. It then reads the user's `offline_messages`. If rows exist, it
sends one `offline_messages` event and deletes those row IDs from the offline
table. If initialization fails, it logs the error and closes the socket with
code `1011`.

### Client-to-server event

The client sends a JSON text frame:

```json
{
  "type": "message",
  "receiverId": "recipient-user-id",
  "receiverEncryptedContent": "base64-ciphertext-for-recipient",
  "senderEncryptedContent": "base64-ciphertext-for-sender"
}
```

The server waits for connection registration, parses JSON, checks `type`,
receiver ID, rejects self-send, and requires nonempty strings for both
ciphertexts. It constructs a live event by adding `senderId` from the
authenticated socket and inserts the ciphertext fields into `messages`.

It then reads `socket:${receiverId}` from Redis:

- If the recipient is connected to this server, send to its local WebSocket.
- If the recipient is connected to another server, publish the event to
  `server_channel_${targetServerId}`. The receiving server's Redis subscriber
  forwards it to its local socket.
- If no server mapping exists, insert the record into `offline_messages`.

Messages are inserted into the main `messages` table before the online/offline
routing decision. There is no transaction or client-visible delivery
acknowledgement in this flow.

### Server-to-client events

Live event:

```json
{
  "type": "message",
  "senderId": "sender-user-id",
  "receiverId": "recipient-user-id",
  "receiverEncryptedContent": "base64-ciphertext",
  "senderEncryptedContent": "base64-ciphertext"
}
```

Offline batch:

```json
{
  "type": "offline_messages",
  "messages": [
    {
      "id": "database-message-id",
      "sender_id": "sender-user-id",
      "receiver_encrypted_content": "base64-ciphertext",
      "sender_encrypted_content": "base64-ciphertext"
    }
  ]
}
```

The offline query does not select a timestamp; the client normalizer supplies
the current time when `created_at` is absent. The client then retrieves the
local private key and decrypts only the ciphertext for the authenticated user.

### Heartbeat and cleanup

Every 30 seconds, the server pings connected clients. A socket not marked alive
by a prior pong is terminated. On close, the manager removes the matching local
socket and removes its Redis presence key if it still points at this server.

## Infrastructure and scaling behavior

`config/mysql.js` creates a MySQL promise pool. `config/redis.js` creates an
ioredis connection. `socketManager.js` duplicates the Redis client for
subscription because a Redis subscriber connection has a dedicated role.

`SERVER_ID` distinguishes instances for Redis routing. `activeSockets` is
process-local; Redis holds the server location for connected users, while
pub/sub carries events between instances. The Redis presence key has no expiry
set in the inspected code; normal cleanup removes it on socket close.

The included compose file starts MySQL and Redis for local development. It does
not start the Node server or create the required SQL tables.

## Deployment notes and limitations

- `Server/app.js` does not serve `Client/dist` or implement an SPA fallback.
  Host the frontend separately or add an external reverse proxy/static host.
- The server creates a plain HTTP listener. Terminate TLS at a trusted proxy or
  platform and configure forwarded/proxy behavior as needed. Ensure WebSocket
  upgrades are passed through to the Node process.
- Production cookie `secure` depends on `NODE_ENV === 'production'`; cookie
  SameSite and CORS origin must match the deployment topology.
- Public keys are stored and returned without fingerprint verification or an
  authenticated key directory. A client cannot establish key authenticity from
  this API alone.
- The server stores ciphertext strings but does not validate the RSA envelope,
  enforce a message-size limit, or decrypt messages. Client-side limits are not
  a substitute for server-side transport/frame size limits.
- No rate limiter, schema validator library, request logging policy, database
  migration, backup procedure, or retention job is included.
- Search uses a `LIKE` query and a fixed maximum of 20 results. There is no
  pagination endpoint.
- HTTP logout clears the cookie but does not actively close a previously
  established WebSocket or revoke the JWT server-side.
- Offline message rows are deleted after they are sent to a connected client;
  there is no acknowledgement/retry protocol to prove the client persisted or
  decrypted the batch.