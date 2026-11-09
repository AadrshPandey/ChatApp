import {Router} from "express";
import {getCurrentUser, loginUser, logoutUser, registerUser} from "../controllers/authController.js";
import verifyHttpToken from "../middleware/httpAuth.js";

const authRouter = Router();

authRouter.post("/register", registerUser);
authRouter.post("/login", loginUser);
authRouter.get("/me", verifyHttpToken, getCurrentUser);
authRouter.post("/logout", logoutUser);

export default authRouter;