import jwt from "jsonwebtoken";

const verifySocketWebToken = (req, socket) => {
    const cookieHeader = req.headers.cookie;

    if(!cookieHeader || !cookieHeader.includes("chat_token")) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return null;
    }

    const token = cookieHeader.split('chat_token=')[1].split(';')[0];

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