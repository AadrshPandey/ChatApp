import jwt from "jsonwebtoken";

const verifyHttpToken = (req, res, next) => {
  const cookieHeader = req.headers.cookie;
  
  if (!cookieHeader || !cookieHeader.includes("chat_token=")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = cookieHeader.split("chat_token=")[1].split(";")[0];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

export default verifyHttpToken;