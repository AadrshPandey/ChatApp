import Router from "express";
import verifyHttpToken from "../middleware/httpAuth.js";
import {searchUsers, getPublicKey, uploadPublicKey} from "../controllers/userController.js";

const userRoutes = Router();

userRoutes.get("/search", verifyHttpToken, searchUsers);
userRoutes.post("/public-key", verifyHttpToken, uploadPublicKey);
userRoutes.get("/:id/public-key", verifyHttpToken, getPublicKey);

export default userRoutes;