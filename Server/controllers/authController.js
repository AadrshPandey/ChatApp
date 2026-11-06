import pool from "../config/mysql.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const registerUser = async (req, res) => {
  const { username, password } = req.body;
  try {
    const [existingUsers] = await pool.execute(
      "SELECT * FROM users WHERE username = ?",
      [username],
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: "User already exists" });
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.execute(
      "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
      [userId, username, hashedPassword],
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
    const { username, password } = req.body;

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE username = ?",
      [username],
    );
    if (rows.length === 0)
      return res.status(401).json({ error: "Invalid credentials" });

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("chat_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({ userId: user.id, username: user.username });

  } catch (error) {
    console.error(error);

    return res.status(500).json({ error: "Login failed" });
  }
};

export { registerUser, loginUser };
