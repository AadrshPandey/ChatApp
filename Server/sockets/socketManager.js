import redis from '../config/redis.js';
import pool from '../config/mysql.js';


// Map to keep track of active WebSocket connections of specific servers. 
// The key is the userId and the value is the WebSocket connection.
const activeSockets = new Map();
const SERVER_ID = process.env.SERVER_ID || 'server1';

// Duplicate the Redis client for subscribing to messages from other servers. 
// Now redis can perform pub/sub and set/get operations simultaneously.
const redisSubscriber = redis.duplicate();
redisSubscriber.subscribe(`server_channel_${SERVER_ID}`); // Subscribe to the channel for this server to receive messages from other servers.

// Listen for messages from other servers and forward them to the appropriate WebSocket connection if it exists. 
// Server to Server communication is handled through Redis pub/sub, while server to client communication is handled through WebSocket connections(activeSockets).
redisSubscriber.on('message', async(channel, message) => {
    try {
        const payload = JSON.parse(message);
        const targetSocket = activeSockets.get(payload.receiverId);

        if(targetSocket && targetSocket.readyState === 1) {
            targetSocket.send(JSON.stringify(payload));
        }
    } catch (error) {
        console.error('Error forwarding Redis message:', error);
    }
});


// Function to handle heartbeat mechanism for WebSocket connections. 
// It sets the isAlive property of the WebSocket connection to true when a pong response is received.
function heartbeat(){
    this.isAlive = true;
}

function setUpSocketManager(wsServer) {
    wsServer.on('connection', (ws, req) => {
        ws.isAlive = true; // Initialize the isAlive property to true when a new WebSocket connection is established.
        ws.on('pong', heartbeat); // Listen for pong responses to tell that the connection is alive.

        const currentUserId = req.userId;
        let registrationReady = false;
        activeSockets.set(currentUserId, ws);

        const registerConnection = async () => {
            try {
                await redis.set(`socket:${currentUserId}`, SERVER_ID);
                const [rows] = await pool.execute(
                    'SELECT id, sender_id, encrypted_content FROM offline_messages WHERE receiver_id = ?',
                    [currentUserId]
                );

                if(rows.length > 0 && ws.readyState === 1){
                    ws.send(JSON.stringify({type: 'offline_messages', messages: rows}));

                    const messageIds = rows.map((row) => row.id);
                    await pool.query(
                        'DELETE FROM offline_messages WHERE id IN (?)',
                        [messageIds]
                    );
                }
                registrationReady = true;
            } catch (error) {
                console.error('Error initializing WebSocket connection:', error);
                ws.close(1011, 'Unable to initialize connection');
            }
        };

        const registrationPromise = registerConnection();

        ws.on('message', async(rawBuffer) => {
            try{
                await registrationPromise;
                if (!registrationReady || ws.readyState !== 1) return;

                const payload = JSON.parse(rawBuffer.toString());

                // Handle incoming messages from clients.
                // If the receiver is connected to the same server, send the message directly through WebSocket.
                // If the receiver is connected to a different server, publish the message to that server's Redis channel.
                // If the receiver is not connected to any server, store the message in the database for later retrieval.
                if(payload.type === 'message' && currentUserId){
                    const {receiverId, encryptedContent} = payload;
                    if (typeof receiverId !== 'string'
                        || !receiverId
                        || receiverId === currentUserId
                        || typeof encryptedContent !== 'string'
                        || !encryptedContent.trim()) {
                        return;
                    }

                    const outgoingPayload = {
                        type: 'message',
                        senderId: currentUserId,
                        receiverId,
                        encryptedContent,
                    };


                    await pool.execute(
                        'INSERT INTO messages (sender_id, receiver_id, encrypted_content) VALUES (?, ?, ?)',
                        [currentUserId, receiverId, encryptedContent]
                    );

                    console.log(`User ${currentUserId} sent a message to user ${receiverId}: ${encryptedContent}`);

                    
                    // Check if the receiver is connected to any server by looking up their server ID in Redis.
                    // If the receiver is connected to the same server, send the message directly through WebSocket.
                    // If the receiver is connected to a different server, publish the message to that server's Redis channel.
                    // If the receiver is not connected to any server, store the message in the database for later retrieval.

                    const targetServerId = await redis.get(`socket:${receiverId}`);

                    if(targetServerId){
                        if(targetServerId === SERVER_ID){
                            const targetSocket = activeSockets.get(receiverId);

                            if(targetSocket){
                                targetSocket.send(JSON.stringify(outgoingPayload));
                            }
                        }
                        else{
                            await redis.publish(`server_channel_${targetServerId}`, JSON.stringify(outgoingPayload));
                        }
                    }
                    else{
                        await pool.execute(
                            'INSERT INTO offline_messages (sender_id, receiver_id, encrypted_content) VALUES (?, ?, ?)',
                            [currentUserId, receiverId, encryptedContent]
                        );
                    }
                }
            }
            catch(error){
                console.error('Error parsing WebSocket message:', error);
            }
        });
        
        // Handle WebSocket connection closure. Remove the userId from the activeSockets map and delete the corresponding Redis key.
        ws.on('close', async() => {
            if(currentUserId && activeSockets.get(currentUserId) === ws){
                activeSockets.delete(currentUserId);
                try {
                    const socketServer = await redis.get(`socket:${currentUserId}`);
                    if (socketServer === SERVER_ID) {
                        await redis.del(`socket:${currentUserId}`);
                    }
                } catch (error) {
                    console.error('Error cleaning up WebSocket connection:', error);
                }
                console.log(`User ${currentUserId} disconnected from server ${SERVER_ID}`);
            }
        });
    });

    // Set up a heartbeat mechanism to check if WebSocket connections are still alive.
    const interval = setInterval(() => {
        wsServer.clients.forEach((ws) => {
            if(ws.isAlive === false){
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    // Clear the heartbeat interval when the WebSocket server is closed to prevent memory leaks.
    wsServer.on('close', () => {
        clearInterval(interval);
    });
};


export default setUpSocketManager;