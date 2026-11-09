import "dotenv/config";

const configuredOrigins = process.env.CLIENT_ORIGIN || "http://localhost:5173";

export const allowedOrigins = new Set(
  configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
