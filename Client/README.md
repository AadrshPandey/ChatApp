# ChatApp client

## Run locally

1. Start MySQL and Redis using the server's Docker Compose setup.
2. Configure `Server/.env` using `Server/.env.example`, including a strong `JWT_SECRET` and a database password matching your MySQL setup.
3. From `Server`, run `npm install` and `npm run dev`.
4. Configure `Client/.env` using `.env.example` if the API is not at `http://localhost:3000`.
5. From `Client`, run `npm install` and `npm run dev`. Optional local URL overrides are in `.env.example`.

The default Vite origin is `http://localhost:5173`, which is the backend's default allowed client origin. If you change the frontend origin, update `CLIENT_ORIGIN` in `Server/.env` to match it exactly. For multiple frontend origins, separate them with commas.

The browser keeps the JWT in the backend's HttpOnly cookie. Axios sends it using `withCredentials`; the client does not store or read the token. The WebSocket handshake reuses that cookie and is opened only after the authenticated session and local encryption key are ready. For deployments where the frontend and backend are on different sites, configure `COOKIE_SAME_SITE=none` and serve both over HTTPS.

Chat messages are encrypted in the browser with RSA-OAEP (2048-bit, SHA-256) for both the recipient and sender, then sent as `receiverEncryptedContent` and `senderEncryptedContent`. Ciphertext is stored in the browser's message history; non-extractable private CryptoKeys are stored in a dedicated IndexedDB object store using the browser's structured-clone support. The public-key metadata is stored through localforage. `localforage`'s default JSON serializer cannot persist `CryptoKey` objects, so the private key must not be stored through that serializer. RSA-OAEP accepts at most 190 bytes per operation with these parameters, so longer text is split into independently encrypted blocks inside a Base64-encoded envelope. Messages are limited to 64 KiB.

The private key is tied to this browser's IndexedDB. Clearing site data or signing in from another browser can make existing messages undecryptable. If the server has a public key but the corresponding private key is missing, the client offers an explicit key reset; messages encrypted with the old key cannot be recovered. The current API also serves public keys directly from the backend without key fingerprints or an authenticated key directory. As a result, this implements client-side encryption but does not protect against a malicious server substituting public keys; verify/authenticate public keys out of band before treating it as strong end-to-end encryption.

## Production

Build the client from the repository root with `npm run build --prefix Client`, without setting local `VITE_API_BASE_URL` or `VITE_WS_URL` overrides. Then, in PowerShell from `Server`, run `$env:NODE_ENV = "production"` followed by `npm start`. The Express server serves `Client/dist` and falls back to the React app for client-side routes; the client then uses the current host for HTTP and WebSocket connections. Configure `CLIENT_ORIGIN` to the exact public frontend origin for both API CORS and WebSocket origin checks.
