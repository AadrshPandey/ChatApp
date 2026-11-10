import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext.jsx'


const SOCKET_URL = import.meta.env.VITE_WS_URL
  || (import.meta.env.DEV
    ? 'ws://localhost:3000'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`)
const SocketContext = createContext(null)

function normalizeIncoming(payload, currentUserId) {
  if (payload.type === 'offline_messages') {
    return (payload.messages || []).map((message) => ({
      id: message.id,
      senderId: message.sender_id,
      receiverId: currentUserId,
      encryptedContent: message.encrypted_content,
      receivedAt: Date.now(),
    }))
  }

  if (payload.type === 'message') {
    return [{
      id: `${Date.now()}-${Math.random()}`,
      senderId: payload.senderId ?? payload.sender_id ?? null,
      receiverId: payload.receiverId ?? currentUserId,
      encryptedContent: payload.encryptedContent,
      receivedAt: Date.now(),
    }]
  }

  return []
}

export function SocketProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.userId
  const socketRef = useRef(null)
  const [status, setStatus] = useState(userId ? 'connecting' : 'disconnected')
  const [messages, setMessages] = useState([])

  useEffect(() => {
    if (!userId) return undefined

    let disposed = false
    let retryTimer
    let stableTimer
    let attempts = 0

    const connect = () => {
      if (disposed) return

      setStatus(attempts === 0 ? 'connecting' : 'reconnecting')
      const socket = new WebSocket(SOCKET_URL)
      socketRef.current = socket

      socket.onopen = () => {
        setStatus('connected')
        stableTimer = window.setTimeout(() => {
          attempts = 0
        }, 10000)
      }

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          const incoming = normalizeIncoming(payload, userId)
          if (incoming.length) {
            setMessages((current) => [...current, ...incoming])
          }
        } catch (error) {
          console.error('Unable to parse a WebSocket message:', error)
        }
      }

      socket.onerror = () => {
        setStatus('reconnecting')
      }

      socket.onclose = () => {
        window.clearTimeout(stableTimer)
        if (socketRef.current === socket) socketRef.current = null
        if (disposed) return

        attempts += 1
        setStatus('reconnecting')
        const delay = Math.min(1000 * (2 ** Math.min(attempts - 1, 5)), 30000)
        retryTimer = window.setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      disposed = true
      window.clearTimeout(retryTimer)
      window.clearTimeout(stableTimer)
      const socket = socketRef.current
      socketRef.current = null
      if (socket) {
        socket.onclose = null
        socket.close()
      }
    }
  }, [userId])

  const sendMessage = useCallback((receiverId, encryptedContent) => {
    const socket = socketRef.current
    if (!userId || !receiverId || !encryptedContent) {
      throw new Error('Choose a chat partner and enter a message.')
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('The chat connection is not ready. Try again in a moment.')
    }

    const payload = { type: 'message', receiverId, encryptedContent }
    socket.send(JSON.stringify(payload))
    setMessages((current) => [
      ...current,
      {
        ...payload,
        id: `${Date.now()}-${Math.random()}`,
        senderId: userId,
        sentAt: Date.now(),
      },
    ])
  }, [userId])

  const value = useMemo(
    () => ({ status, messages, sendMessage }),
    [status, messages, sendMessage],
  )

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider.')
  }
  return context
}
