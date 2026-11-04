import redis from '../config/redis.js';
import pool from '../config/db.js';


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
    const payload = JSON.parse(message);
    const targetSocket = activeSockets.get(payload.receiverId);

    if(targetSocket && targetSocket.readyState === 1) {
        targetSocket.send(JSON.stringify(payload));
    }
});


// Function to handle heartbeat mechanism for WebSocket connections. 
// It sets the isAlive property of the WebSocket connection to true when a pong response is received.
function heartbeat(){
    this.isAlive = true;
}

function setUpSocketManager(wsServer) {
    wsServer.on('connection', (ws) => { 
        ws.isAlive = true; // Initialize the isAlive property to true when a new WebSocket connection is established.
        ws.on('pong', heartbeat); // Listen for pong responses to tell that the connection is alive.

        let currentUserId = null;

        // rawBuffer = {type: 'init', userId: 'user1'} or 
        // {type: 'message', receiverId: 'user2', encryptedContent: 'encrypted_message'}
        ws.on('message', async(rawBuffer) => {
            try{
                const payload = JSON.parse(rawBuffer.toString());

                // Register the userId of the connected client and store the WebSocket connection in the activeSockets map.
                // Also, sends the offline messages to the client if there are any and deletes them from the database.
                if(payload.type === 'init'){
                    currentUserId = payload.userId;
                    activeSockets.set(currentUserId, ws);

                    await redis.set(`socket:${currentUserId}`, SERVER_ID);
                    console.log(`User ${currentUserId} connected to server ${SERVER_ID}`);

                    const [rows] = await pool.execute(
                        'SELECT id, sender_id, encrypted_content FROM offline_messages WHERE receiver_id = ?',
                        [currentUserId]
                    );

                    if(rows.length > 0){
                        ws.send(JSON.stringify({type : 'offline_messages', messages : rows}));

                        const messageIds = rows.map(row => row.id);
                        await pool.query(
                            'DELETE FROM offline_messages WHERE id IN (?)',
                            [messageIds]
                        );
                    }
                    return;
                }

                // Handle incoming messages from clients.
                // If the receiver is connected to the same server, send the message directly through WebSocket.
                // If the receiver is connected to a different server, publish the message to that server's Redis channel.
                // If the receiver is not connected to any server, store the message in the database for later retrieval.
                if(payload.type === 'message'){
                    const {receiverId, encryptedContent} = payload;

                    const targetServerId = await redis.get(`socket:${receiverId}`);

                    if(targetServerId){
                        if(targetServerId === SERVER_ID){
                            const targetSocket = activeSockets.get(receiverId);

                            if(targetSocket){
                                targetSocket.send(JSON.stringify(payload));
                            }
                        }
                        else{
                            await redis.publish(`server_channel_${targetServerId}`, JSON.stringify(payload));
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
            if(currentUserId){
                activeSockets.delete(currentUserId);
                await redis.del(`socket:${currentUserId}`);
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