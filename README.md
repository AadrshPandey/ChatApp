# ChatApp

ChatApp is a browser-based messaging application built with React and Vite. Its
backend is an Express HTTP API with native WebSocket messaging, MySQL persistence,
and Redis-assisted routing. Message plaintext is encrypted in the browser before
it is sent to the server.

This repository contains two independently installed applications:

| Directory | Application | Main technologies |
| --- | --- | --- |
| [`Client/`](./Client/README.md) | Browser UI | React, React Router, Vite, Axios, Web Crypto |
| [`Server/`](./Server/README.md) | HTTP and WebSocket backend | Express, `ws`, MySQL, Redis |

Read the [client guide](./Client/README.md) and [server guide](./Server/README.md)
for component/API details, configuration, local setup, and implementation
limitations.

## Features currently implemented

- Username/password registration and login.
- JWT authentication using an HttpOnly `chat_token` cookie.
- Authenticated user search.
- One-to-one chat history and real-time message delivery over WebSocket.
- Offline message queueing in MySQL and cross-server online delivery through
  Redis pub/sub.
- Browser-side RSA-OAEP message encryption, with separate ciphertext for the
  recipient and sender.
- Browser-local private key persistence in IndexedDB.

This is a small application, not a complete production platform. There are no
profile-management, file-upload, notification, message-edit, or message-delete
features in the inspected source. See the [limitations](#important-setup-and-security-notes)
and the component guides before deploying.

## Repository layout

```text
ChatApp/
├── Client/
│   ├── index.html
│   ├── package.json
│   ├── public/
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── components/
│       ├── context/
│       └── utils/
└── Server/
    ├── app.js
    ├── index.js
    ├── package.json
    ├── config/
    ├── controllers/
    ├── middleware/
    ├── routes/
    └── sockets/
```

The client and server each have their own `package.json` and dependency
installation. Run commands from the repository root with `--prefix`, or change
to the relevant directory first.

## Prerequisites

- Node.js and npm versions compatible with the Vite version in
  `Client/package-lock.json`.
- Docker Compose for the included local MySQL/Redis services, or independently
  managed MySQL 8-compatible and Redis services.
- A database schema matching the SQL used in the backend. **No SQL migration or
  schema-creation script is included**, so database startup alone does not make
  the application tables available.
- A modern browser supporting Web Crypto, IndexedDB structured cloning of
  `CryptoKey`, `TextEncoder`/`TextDecoder`, and WebSocket. Web Crypto requires a
  secure browser context (HTTPS or localhost).

## Local development

### 1. Start MySQL and Redis

From `Server/`, start the included services:

```powershell
docker compose up -d mysql redis
```

The compose file publishes MySQL on host port `3307` and Redis on `6379`, and
persists service data in named Docker volumes. Review and replace the local
credentials configured by `Server/docker-compose.yml` before using it beyond a
disposable local environment.

### 2. Configure and start the backend

Create `Server/.env` locally. Do not commit credentials. Configure the variables
documented in [`Server/README.md`](./Server/README.md), including a strong
`JWT_SECRET`, and make MySQL credentials match the database service.

Create the required database tables using a schema compatible with the SQL in
`Server/controllers/` and `Server/sockets/socketManager.js`; this repository
does not provide that DDL.

Install dependencies and run the development server:

```powershell
npm install --prefix Server
npm run dev --prefix Server
```

The backend listens on port `3000` unless `PORT` is configured. Its package
currently defines a `dev` script, but no `start`, `build`, or test script.

### 3. Configure and start the client

The client defaults to `http://localhost:3000` for HTTP and
`ws://localhost:3000` for WebSocket in Vite development mode. Optional overrides
are `VITE_API_BASE_URL` and `VITE_WS_URL`. Put local overrides in
`Client/.env`; never place server secrets in a `VITE_` variable because Vite
exposes those values to browser code.

```powershell
npm install --prefix Client
npm run dev --prefix Client
```

Vite's default frontend origin is `http://localhost:5173`, which matches the
backend's default `CLIENT_ORIGIN`. If the origin changes, configure the backend
to allow the exact new origin.

### 4. Use the application

Open the Vite URL, register a user, and then sign in. The client initializes an
RSA key pair and publishes the public key before treating the session as ready.
Create a second account in another browser profile to test two-party messaging.

## Architecture at a glance

```text
Browser
  index.html → src/main.jsx
    StrictMode → BrowserRouter → AuthProvider → App
      /auth → Auth
      /      → ProtectedRoute → Dashboard
                           ├── Sidebar (user search / sign out)
                           └── ChatWindow (history / encrypt / decrypt)
                     SocketProvider (authenticated user only)

HTTP:    Axios with credentials → Express routes → JWT cookie middleware
         → controllers → MySQL

Realtime: browser WebSocket → authenticated HTTP upgrade → socketManager
          → MySQL message/offline queue; Redis routes between server instances

Crypto:  browser Web Crypto → recipient + sender ciphertexts → server stores
         opaque ciphertext strings → browser decrypts with local private key
```

The detailed source-by-source frontend flows are in
[`Client/README.md`](./Client/README.md). Backend routing, request formats, SQL
contracts, and WebSocket event handling are in
[`Server/README.md`](./Server/README.md).

## Important setup and security notes

- **Database schema is not provisioned by this repository.** The server code
  references `users`, `messages`, and `offline_messages`, but no migrations or
  schema DDL were found. Create and validate the schema separately before
  expecting auth, history, or messaging to work.
- **Do not commit environment files or credentials.** The checked-out `.env`
  files are local configuration and are ignored by Git. This README intentionally
  lists variable names only and does not reproduce local values.
- **Cookie auth depends on correct origin and cookie settings.** The backend
  uses credentialed CORS and an HttpOnly cookie. For deployments where client
  and API are cross-site, configure a compatible `COOKIE_SAME_SITE` value and
  HTTPS (`secure` is enabled in production). Set `CLIENT_ORIGIN` to the exact
  allowed frontend origin.
- **The server does not serve the built client in the inspected source.** The
  production defaults in the client use the current host, but `Server/app.js`
  does not mount static files or a React route fallback. Deploy the frontend
  separately or configure an external web server/reverse proxy and make the
  client API/WebSocket URLs and backend origin policy agree.
- **Public-key authenticity is not established by the current API.** The server
  stores and returns user public keys without a fingerprint or independently
  authenticated key directory. Client-side encryption therefore does not, by
  itself, prevent a server that can substitute public keys from intercepting
  messages. Verify keys out of band before relying on strong end-to-end
  confidentiality.
- **Private keys are browser-specific.** The non-extractable private key is in
  IndexedDB, not on the server. Clearing browser data or switching browsers can
  make existing messages unreadable. Replacing a missing key does not restore
  old messages.
- **The UI enforces a 64 KiB message limit.** Messages use RSA-OAEP (2048-bit,
  SHA-256) in independently encrypted blocks; the server stores encrypted
  strings and does not encrypt plaintext on behalf of the client.
- **Review included development infrastructure before exposure.** The
  `docker-compose.yml` contains local credential configuration, and the server
  has no included production process manager, TLS termination, rate limiter, or
  database migration workflow.

## Scripts

| Package | Command | Purpose |
| --- | --- | --- |
| Client | `npm run dev --prefix Client` | Run Vite development server. |
| Client | `npm run build --prefix Client` | Build static frontend output in `Client/dist`. |
| Client | `npm run preview --prefix Client` | Preview a previously built client locally. |
| Client | `npm run lint --prefix Client` | Run ESLint. |
| Server | `npm run dev --prefix Server` | Run `nodemon index.js`. |

The client currently has no test script. The server currently has no build,
production-start, or test script.