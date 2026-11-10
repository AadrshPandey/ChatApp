# ChatApp client

## Run locally

1. Start MySQL and Redis using the server's Docker Compose setup.
2. Configure `Server/.env` using `Server/.env.example`, including a strong `JWT_SECRET` and a database password matching your MySQL setup.
3. From `Server`, run `npm install` and `npm run dev`.
4. Configure `Client/.env` using `.env.example` if the API is not at `http://localhost:3000`.
5. From `Client`, run `npm install` and `npm run dev`. Optional local URL overrides are in `.env.example`.

The default Vite origin is `http://localhost:5173`, which is the backend's default allowed client origin. If you change the frontend origin, update `CLIENT_ORIGIN` in `Server/.env` to match it exactly. For multiple frontend origins, separate them with commas.

The browser keeps the JWT in the backend's HttpOnly cookie. The client restores the session through `GET /api/auth/me`; it does not store or read the token. The WebSocket handshake reuses that cookie. For deployments where the frontend and backend are on different sites, configure `COOKIE_SAME_SITE=none` and serve both over HTTPS.

Chat messages are sent in the backend's `encryptedContent` field. The current text input does not encrypt message content; add an agreed client-side encryption and key-distribution protocol before using it for private messages.

## Production

Build the client from the repository root with `npm run build --prefix Client`, without setting local `VITE_API_BASE_URL` or `VITE_WS_URL` overrides. Then, in PowerShell from `Server`, run `$env:NODE_ENV = "production"` followed by `npm start`. The Express server serves `Client/dist` and falls back to the React app for client-side routes; the client then uses the current host for HTTP and WebSocket connections. Configure `CLIENT_ORIGIN` to the exact public frontend origin for both API CORS and WebSocket origin checks.
