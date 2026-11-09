import "dotenv/config"
import http from "node:http"
import { WebSocketServer } from "ws"
import app from "./app.js"
import pool from "./config/mysql.js"
import redis from "./config/redis.js"
import setUpSocketManager from "./sockets/socketManager.js"
import verifySocketWebToken from "./middleware/wsAuth.js"
import { allowedOrigins } from "./config/origins.js"

const port = process.env.PORT || 3000
const server = http.createServer(app)
const wsServer = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin
  if (origin && !allowedOrigins.has(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }

  const userId = verifySocketWebToken(req, socket)
  if (!userId) return;

  req.userId = userId; // Attach the userId to the request object for later use in the WebSocket connection.

  wsServer.handleUpgrade(req, socket, head, (ws) => {
    wsServer.emit('connection', ws, req)
  })
  console.log(`User ${userId} connected to WebSocket server`);
})

setUpSocketManager(wsServer);

server.on('error', (err) => {
  console.error('Server error: ', err)
})

pool.getConnection()
  .then((connection) => {
    connection.release()
    console.log('Connected to MySQL database')
  })
  .catch((error) => {
    console.error('Error connecting to MySQL database: ', error)
  })

server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

redis.on('connect', () => {
  console.log('Connected to Redis database')
})

redis.on('error', (error) => {
  console.error('Error connecting to Redis database: ', error)
})