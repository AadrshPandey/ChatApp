import "dotenv/config"
import http from "node:http"
import { WebSocketServer } from "ws"
import app from "./app.js"
import pool from "./config/mysql.js"
import redis from "./config/redis.js"

const port = process.env.PORT || 3000
const server = http.createServer(app)
const wsServer = new WebSocketServer({ server })

wsServer.on('connection', () => {
  console.log('Client Connected...')
})

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
