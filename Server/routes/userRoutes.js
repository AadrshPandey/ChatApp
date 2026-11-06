import Router from "express";
import verifyHttpToken from "../middleware/httpAuth.js";
import searchUsers from "../controllers/userController.js";

const userRoutes = Router();

userRoutes.get("/search", verifyHttpToken, searchUsers);

export default userRoutes;