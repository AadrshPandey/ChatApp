import pool from "../config/mysql.js";

const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: "Search query is required" });
    }

    // Find up to 20 matching usernames, excluding the logged-in user
    const [users] = await pool.execute(
      "SELECT id, username FROM users WHERE username LIKE ? AND id != ? LIMIT 20",
      [`%${q}%`, req.userId]
    );

    return res.status(200).json(users);
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Failed to search users" });
  }
};

const uploadPublicKey = async (req, res) => {
  try {
    const { publicKey } = req.body;
    const userId = req.userId;

    if (!publicKey) {
      return res.status(400).json({ error: "Public key is required" });
    }

    await pool.execute(
      "UPDATE users SET public_key = ? WHERE id = ?",
      [publicKey, userId]
    );

    return res.status(200).json({ message: "Public key uploaded successfully" });
  } catch (error) {
    console.error("Error uploading public key:", error);
    return res.status(500).json({ error: "Failed to upload public key" });
  }
};

const getPublicKey = async (req, res) => {
  try {
    const targetUserId = req.params.id;

    const [user] = await pool.execute(
      "SELECT public_key FROM users WHERE id = ?",
      [targetUserId]
    );

    if (!user.length) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({ publicKey: user[0].public_key });
  } catch (error) {
    console.error("Error fetching public key:", error);
    return res.status(500).json({ error: "Failed to fetch public key" });
  }
};

export { searchUsers, uploadPublicKey, getPublicKey };