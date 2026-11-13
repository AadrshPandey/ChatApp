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

/* eslint react-refresh/only-export-components: off */

const SOCKET_URL = import.meta.env.VITE_WS_URL
  || (import.meta.env.DEV
    ? 'ws://localhost:3000'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`)
const SocketContext = createContext(null)

function normalizeIncoming(payload, currentUserId) {
  if (payload.type === 'offline_messages') {
    return (payload.messages || []).map((message) => ({
      id: message.id ?? `${Date.now()}-${Math.random()}`,
      sender_id: message.sender_id,
      receiver_id: currentUserId,
      receiver_encrypted_content: message.receiver_encrypted_content,
      sender_encrypted_content: message.sender_encrypted_content,
      created_at: message.created_at ?? new Date().toISOString(),
    }))
  }

  if (payload.type === 'message') {
    return [{
      id: `${Date.now()}-${Math.random()}`,
      sender_id: payload.senderId ?? payload.sender_id ?? null,
      receiver_id: payload.receiverId ?? payload.receiver_id ?? currentUserId,
      receiver_encrypted_content: payload.receiverEncryptedContent
        ?? payload.receiver_encrypted_content,
      sender_encrypted_content: payload.senderEncryptedContent
        ?? payload.sender_encrypted_content,
      created_at: payload.created_at ?? new Date().toISOString(),
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

    const scheduleReconnect = () => {
      if (disposed) return
      attempts += 1
      setStatus('reconnecting')
      const delay = Math.min(1000 * (2 ** Math.min(attempts - 1, 5)), 30000)
      retryTimer = window.setTimeout(connect, delay)
    }

    const connect = () => {
      if (disposed) return

      setStatus(attempts === 0 ? 'connecting' : 'reconnecting')
      let socket
      try {
        socket = new WebSocket(SOCKET_URL)
      } catch (error) {
        console.error('Unable to create the WebSocket connection:', error)
        scheduleReconnect()
        return
      }
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
        scheduleReconnect()
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

  const sendMessage = useCallback((
    receiverId,
    receiverEncryptedContent,
    senderEncryptedContent,
  ) => {
    const socket = socketRef.current
    if (!userId || !receiverId || !receiverEncryptedContent || !senderEncryptedContent) {
      throw new Error('Choose a chat partner and enter a message.')
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('The chat connection is not ready. Try again in a moment.')
    }

    const payload = {
      type: 'message',
      receiverId,
      receiverEncryptedContent,
      senderEncryptedContent,
    }
    socket.send(JSON.stringify(payload))
    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random()}`,
        sender_id: userId,
        receiver_id: receiverId,
        receiver_encrypted_content: receiverEncryptedContent,
        sender_encrypted_content: senderEncryptedContent,
        created_at: new Date().toISOString(),
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
