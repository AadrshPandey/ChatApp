import pool from '../config/mysql.js';

const chatHistory = async (req, res) => {
    try{
        const loggedInUserId = req.userId; // Provided by httpAuth middleware
        const contactId = req.params.contactId;

        if (!contactId) {
            return res.status(400).json({ error: "Contact ID is required" });
        }

        const [messages] = await pool.execute(
            `SELECT id, sender_id, receiver_id, receiver_encrypted_content, sender_encrypted_content, created_at 
             FROM messages 
             WHERE (sender_id = ? AND receiver_id = ?) 
                OR (sender_id = ? AND receiver_id = ?) 
             ORDER BY created_at ASC`,
            [loggedInUserId, contactId, contactId, loggedInUserId]
        );

        return res.status(200).json(messages);
    } catch (error) {
        console.error("Error fetching chat history:", error);
        return res.status(500).json({ error: "Failed to retrieve chat history" });
    }
};

export default chatHistory;