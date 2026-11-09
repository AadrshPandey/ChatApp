import express from "express";
import cors from "cors";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { allowedOrigins } from "./config/origins.js";

const app = express();

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  credentials: true,
}));
app.use(express.json());

if (process.env.NODE_ENV !== "production") {
  app.get('/', (_req, res) => {
    res.send('Messaging server is up and running...');
  });
}

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

export default app;