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

export default searchUsers;