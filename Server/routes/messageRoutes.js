import Router from "express";
import chatHistory from "../controllers/messageController.js";
import verifyHttpToken from "../middleware/httpAuth.js";

const messageRouter = Router();

// Route to fetch chat history with a specific contact. 
// It uses the verifyHttpToken middleware to ensure the user is authenticated before accessing the chat history.
messageRouter.get("/:contactId", verifyHttpToken, chatHistory);

export default messageRouter;