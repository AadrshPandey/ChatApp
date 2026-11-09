import jwt from "jsonwebtoken";

const verifySocketWebToken = (req, socket) => {
    const cookieHeader = req.headers.cookie;
    const token = cookieHeader
        ?.split(";")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith("chat_token="))
        ?.slice("chat_token=".length);

    if(!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return null;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded.userId; 
    } catch (error) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return null;
    }
};

export default verifySocketWebToken;