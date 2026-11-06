import {Router} from "express";
import {registerUser, loginUser} from "../controllers/authController.js";

const authRouter = Router();

authRouter.post("/register", registerUser);
authRouter.post("/login", loginUser);

export default authRouter;