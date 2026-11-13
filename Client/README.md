# ChatApp Client

The client is a React single-page application built with Vite. It provides
registration/sign-in, authenticated user search, and one-to-one encrypted
messaging. The client owns the encryption keys and encrypts message text before
sending ciphertext through the backend.

The repository root guide is [`../README.md`](../README.md). Backend routes,
environment settings, database requirements, and WebSocket processing are
documented in [`../Server/README.md`](../Server/README.md).

## Stack and scripts

- React and React DOM for the UI.
- React Router for the `/auth` and `/` routes.
- Axios for credentialed HTTP requests.
- Native browser WebSocket for realtime messages (not Socket.IO).
- Web Crypto and IndexedDB for RSA encryption and local key storage.
- localforage for a public-key copy; the private key is not stored through its
  serializer.
- Tailwind CSS through the Vite plugin; lucide-react for icons.
- ESLint with React Hooks and React Refresh rules.

Run commands from the repository root:

```powershell
npm install --prefix Client
npm run dev --prefix Client
npm run lint --prefix Client
npm run build --prefix Client
npm run preview --prefix Client
```

`npm run build` writes the production bundle to `Client/dist`. `npm run preview`
serves an existing build locally; it is not the backend's production server.
There is no client test script in `Client/package.json`.

## Configuration

The client reads only these Vite variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Axios HTTP API base URL. | `http://localhost:3000` in Vite development; `window.location.origin` otherwise. |
| `VITE_WS_URL` | WebSocket URL. | `ws://localhost:3000` in development; current host using `ws:` or `wss:` otherwise. |

Set optional overrides in a local `Client/.env`. No secret belongs in a
`VITE_` variable: Vite embeds client-exposed values in browser assets. The
backend must separately allow the frontend's exact origin through its
`CLIENT_ORIGIN` configuration. For cookie-based authentication, the browser,
API, CORS credentials, and cookie SameSite/Secure settings must be compatible.

The client uses `withCredentials: true` for Axios. JavaScript does not read or
write the authentication token; the browser manages the backend's HttpOnly
`chat_token` cookie.

## Entry point and component tree

`Client/index.html` contains `#root` and loads `/src/main.jsx`. The entry point
mounts:

```text
StrictMode
└── BrowserRouter
    └── AuthProvider
        └── App
            └── SocketProvider (keyed by userId or "anonymous")
                └── Routes
                    ├── /auth → PublicRoute → Auth
                    ├── /     → ProtectedRoute → Dashboard
                    │                             ├── Sidebar
                    │                             └── ChatWindow
                    └── * → redirect to /
```

| Source path | Responsibility |
| --- | --- |
| `src/main.jsx` | Creates the React root; installs `StrictMode`, `BrowserRouter`, and `AuthProvider`. Imports global `index.css`. |
| `src/App.jsx` | Defines `App`, `ProtectedRoute`, and `PublicRoute`. Displays a session restoration screen while auth is loading. |
| `src/context/AuthContext.jsx` | Creates the Axios `api` instance; restores session; exposes auth state/actions; initializes encryption keys. |
| `src/context/SocketContext.jsx` | Opens and reconnects the authenticated user's WebSocket; normalizes incoming messages; exposes send/state. |
| `src/components/Auth.jsx` | Login/register form and missing-key recovery action. |
| `src/components/Dashboard.jsx` | Owns selected contact (`activeUser`) and composes the chat layout. |
| `src/components/Sidebar.jsx` | Search form, result list, and sign-out action. |
| `src/components/ChatWindow.jsx` | Loads and decrypts history, encrypts/sends messages, processes incoming messages, and renders the conversation. |
| `src/utils/crypto.js` | RSA key generation/import/export, encryption/decryption, Base64/envelope transforms, and IndexedDB storage. |
| `src/index.css` | Tailwind import and global document/form defaults. |
| `src/App.css` | Legacy/demo styles; not imported by the application entry. |

No separate layout directory, external state store, service layer, or custom
hook directory exists. `useAuth()` and `useSocket()` are context accessors
defined in their context modules.

## Startup and session restoration

1. The browser loads `index.html` and executes `src/main.jsx`.
2. `AuthProvider` initializes `user=null`, `isLoading=true`, and empty error/key
   recovery state.
3. Its mount effect invokes the async `restoreSession()` function.
4. `restoreSession()` calls `api.get('/api/auth/me')`. The backend validates the
   HttpOnly cookie and returns `{ userId, username }`.
5. After validating the response, the client calls `ensureUserKeyPair(userId)`.
   It checks IndexedDB; if no local pair exists, it queries the server for the
   public key. If the server already has a key but the browser lacks its private
   key, the client enters key recovery rather than silently replacing it.
6. If the local key is available or successfully created, its public key is
   posted to the backend and the client sets the current user.
7. `ProtectedRoute`/`PublicRoute` select the page. The socket provider is active
   only when `userId` is present.

An HTTP `401` from the session check is treated as an anonymous session. Other
failures are logged and surfaced through `sessionError`. React `StrictMode` may
re-run mount effects in development; key initialization is coalesced per user,
but the session request itself is not deduplicated.

## Authentication interactions

### Register

`Auth.handleSubmit` prevents the form default, trims the username, and calls
`register({ username, password })`. The context posts to
`POST /api/auth/register`; on success it immediately calls `login(credentials)`.
The UI then navigates to `/`. The password minimum length is six in the UI and
backend. The UI limits username input to 50 characters; the backend trims and
requires a non-empty username but does not apply the same maximum.

### Login

`Auth.handleSubmit` calls context `login()`, which posts credentials to
`POST /api/auth/login`. The backend returns user identity and sets an HttpOnly
cookie. The client validates `userId`/`username`, waits for key initialization,
then sets auth state and navigates to `/`.

### Logout

`Sidebar.handleSignOut()` calls context `signOut()`, which awaits
`POST /api/auth/logout`. Only after success does it clear the React user and key
recovery state. If the request fails, the user remains in the current client
state and the sidebar displays the error.

### Missing private key recovery

If a public key exists on the server but the local private key is unavailable,
the Auth screen offers a confirmation. `resetEncryptionKey()` creates and
stores a new local key pair, publishes the new public key, then restores the
authenticated UI. Ciphertext made for the old public key cannot be decrypted
with the replacement key.

## User search and chat selection

`Sidebar` maintains a query and uses an effect with a 250 ms debounce. It trims
the value, calls `GET /api/users/search?q=...`, and passes an
`AbortController.signal` to Axios. Effect cleanup clears the timer and aborts
stale requests. The backend excludes the current user and returns up to 20
`{ id, username }` rows. Clicking a result invokes the `Dashboard` selection
callback; `ChatWindow` receives the selected user.

There is no profile page, profile edit flow, avatar upload, or dedicated
conversation list API in the current client/backend source.

## Message history, encryption, and sending

### Load history

When `contactId` changes, `ChatWindow` calls
`GET /api/messages/:contactId` with an abort signal. The backend returns
chronological database rows with IDs, sender/receiver IDs, both encrypted
content fields, and `created_at`.

The client verifies the response is an array, gets the current user's private
key from IndexedDB, then calls `decryptRecord()` for each item. For an outgoing
message it chooses `sender_encrypted_content`; for an incoming message it
chooses `receiver_encrypted_content`. Each resulting UI model has `content` and
`decryptionError`. `mergeMessages()` combines history and live messages,
deduplicates by ID or ciphertext tuple, and sorts by timestamp.

### Send a message

`ChatWindow.handleSubmit()` trims the draft and returns if it is empty or no
contact is selected. It fetches the receiver's and sender's public keys in
parallel, imports them, and encrypts the plaintext separately for each key.
`useSocket().sendMessage()` sends a JSON WebSocket event:

```json
{
  "type": "message",
  "receiverId": "recipient-user-id",
  "receiverEncryptedContent": "base64-encoded-envelope",
  "senderEncryptedContent": "base64-encoded-envelope"
}
```

After calling `WebSocket.send()`, the context appends a local optimistic
ciphertext row and the form clears its draft. There is no server delivery
acknowledgement tied to this optimistic update.

Pressing Enter submits; Shift+Enter inserts a newline. Send is disabled while
the socket is not connected, the draft is empty, or history is loading. The
client enforces a 64 KiB UTF-8 message limit in `encryptMessage()`.

### Encryption format

`src/utils/crypto.js` uses Web Crypto RSA-OAEP with a 2048-bit modulus and
SHA-256. It generates an extractable pair initially so it can export SPKI
public-key bytes and PKCS#8 private-key bytes. The private key is re-imported as
non-extractable with decrypt-only usage, and the temporary private bytes are
zeroed.

Plaintext is UTF-8 encoded and split at character boundaries into blocks of at
most 190 bytes. Each block is independently RSA-encrypted and Base64 encoded.
The client builds a versioned JSON envelope
`{algorithm:"RSA-OAEP-256",version:1,chunks:[...]}`, UTF-8 encodes that JSON,
then Base64 encodes the complete envelope. Decryption reverses those
transformations and uses fatal UTF-8 decoding. A legacy single-block decrypt
path is also present.

The backend sees ciphertext and public keys, not plaintext. However, the
backend's public-key API has no fingerprint verification or authenticated key
directory. A substituted key could undermine message confidentiality. Treat
the current scheme as browser-side encryption, not as a guarantee against a
malicious server, unless keys are authenticated out of band.

## Realtime and offline messages

`SocketProvider` creates a native `WebSocket` only for an authenticated user.
The browser sends the cookie with its handshake where applicable; backend
`wsAuth` verifies the JWT before completing the upgrade. On open, context status
becomes `connected`. On close, it reconnects with exponential delay from one
second up to 30 seconds; a stable ten-second connection resets the retry
counter.

Incoming JSON event types are:

- `message`: a live event with `senderId`, `receiverId`, and both encrypted
  contents. The client maps camelCase or snake_case fields to its row shape.
- `offline_messages`: an array of stored message rows. The client fills
  `receiver_id` with the current user ID.

`ChatWindow` filters events to the active conversation, avoids processing the
same generated ID twice, decrypts them, and merges them into the visible thread.
Malformed JSON is logged in the socket context. Decryption failures become an
incoming error or a per-message placeholder.

## HTTP API used by this client

All HTTP calls use the Axios `api` instance in
`src/context/AuthContext.jsx`, configured with `withCredentials: true`.

| Method and path | Caller | Purpose |
| --- | --- | --- |
| `POST /api/auth/register` | `AuthContext.register` | Create account; client follows with login. |
| `POST /api/auth/login` | `AuthContext.login` | Authenticate and receive cookie-backed session. |
| `GET /api/auth/me` | `AuthProvider.restoreSession` | Restore identity from cookie. |
| `POST /api/auth/logout` | `AuthContext.signOut` | Clear the cookie-backed session. |
| `GET /api/users/search?q=...` | `Sidebar` effect | Search up to 20 other users. |
| `POST /api/users/public-key` | Key initialization/recovery | Publish the current user's Base64 SPKI public key. |
| `GET /api/users/:id/public-key` | Key initialization and message send | Retrieve a user's public key. |
| `GET /api/messages/:contactId` | `ChatWindow` effect | Retrieve both directions of chat history. |

The client uses no Axios interceptors, generic retry policy, file upload, or REST
message create/update/delete endpoints.

## State and browser persistence

| Data | Owner / persistence |
| --- | --- |
| Current user, loading/error/key recovery | `AuthContext`; restored from `/api/auth/me`. |
| Socket status and received messages | `SocketContext`; in memory only. |
| Selected contact | `Dashboard` local React state. |
| Search query/results/errors | `Sidebar` local React state. |
| Draft, history, live decrypted records, errors | `ChatWindow` local state and refs. |
| JWT | HttpOnly `chat_token` cookie; JavaScript cannot access it. |
| Private/public key pair | IndexedDB database `chatapp-crypto`, store `keypairs`, record keyed by user ID. |
| Public-key copy | `localforage` entry `chatapp:keypair:${userId}`; source writes but does not read this copy. |
| Message history | Backend database; refetched when conversation opens. No local browser history cache. |

No `localStorage` or `sessionStorage` access was found. Clearing site data can
remove the private key while leaving the server's public key and ciphertext
intact, which makes the old messages unavailable to this browser.

## Styling, assets, and unused modules

`src/index.css` imports Tailwind and declares global styles. `vite.config.js`
loads the React and Tailwind plugins. `lucide-react` supplies component icons.
The app's public assets and `src/assets/` are not imported by the current
runtime components. `src/App.css` is not imported. `exportPublicKey()` is
exported by the crypto helper but has no call site in the client. `Auth.jsx`
maintains a `notice` state that is cleared and rendered but never populated.

## Errors and loading states

- Route guards show “Restoring your session…” while auth state is loading.
- Auth form tracks loading and renders API/context errors.
- Search uses a debounce, aborts stale requests, and shows loading/no-results
  states.
- History loads per selected contact; aborted requests do not update state.
- Send errors are shown below the composer; receive/decrypt errors are shown in
  the conversation.
- A decrypt failure on one record does not discard the rest of the history.
- Socket status is displayed as Connected, Offline, or Connecting; socket
  construction and JSON parse failures are logged.

## Not implemented / operational caveats

- No client-side database migrations or SQL setup.
- No local message cache, key backup/export, key fingerprint verification, or
  recovery of old messages after losing a private key.
- No Redux/Zustand store, global error boundary, Axios interceptor, or
  request-retry layer.
- No media/file uploads, downloads, profile management, notification UI, or
  message edit/delete.
- The server source does not serve `Client/dist` or provide SPA route fallback.
  Production hosting must be configured separately; use HTTPS and a compatible
  WebSocket reverse-proxy setup.