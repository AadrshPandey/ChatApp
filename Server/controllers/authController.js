import pool from "../config/mysql.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.COOKIE_SAME_SITE || "strict",
  path: "/",
};

const registerUser = async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (
      typeof username !== "string"
      || typeof password !== "string"
      || !username.trim()
      || password.length < 6
    ) {
      return res.status(400).json({
        error: "Username is required and password must be at least 6 characters",
      });
    }

    const normalizedUsername = username.trim();
    const [existingUsers] = await pool.execute(
      "SELECT id FROM users WHERE username = ?",
      [normalizedUsername],
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: "User already exists" });
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.execute(
      "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
      [userId, normalizedUsername, hashedPassword],
    );

    return res
      .status(201)
      .json({ message: "User registered Successfully", userId });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE username = ?",
      [username.trim()],
    );
    if (rows.length === 0)
      return res.status(401).json({ error: "Invalid credentials" });

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("chat_token", token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({ userId: user.id, username: user.username });

  } catch (error) {
    console.error(error);

    return res.status(500).json({ error: "Login failed" });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, username FROM users WHERE id = ?",
      [req.userId],
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    return res.status(200).json({ userId: rows[0].id, username: rows[0].username });
  } catch (error) {
    console.error("Session lookup error:", error);
    return res.status(500).json({ error: "Failed to verify session" });
  }
};

const logoutUser = (_req, res) => {
  res.clearCookie("chat_token", cookieOptions);
  return res.status(200).json({ message: "Logged out" });
};

export { registerUser, loginUser, getCurrentUser, logoutUser };
