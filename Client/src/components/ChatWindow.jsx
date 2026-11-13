import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, LockKeyhole, Send } from 'lucide-react'
import { api, useAuth } from '../context/AuthContext.jsx'
import { useSocket } from '../context/SocketContext.jsx'
import {
  decryptMessage,
  encryptMessage,
  getStoredKeyPair,
  importPublicKey,
} from '../utils/crypto.js'

function isInConversation(message, userId, contactId) {
  return (message.sender_id === userId && message.receiver_id === contactId)
    || (message.sender_id === contactId && message.receiver_id === userId)
}

function getCiphertextForUser(message, userId) {
  if (message.sender_id === userId) return message.sender_encrypted_content
  if (message.receiver_id === userId) return message.receiver_encrypted_content
  throw new Error('This message does not belong to the current user.')
}

async function decryptRecord(message, userId, privateKey) {
  try {
    const encryptedContent = getCiphertextForUser(message, userId)
    if (typeof encryptedContent !== 'string' || !encryptedContent) {
      throw new Error('The server did not include the ciphertext for this user.')
    }

    return {
      ...message,
      content: await decryptMessage(encryptedContent, privateKey),
      decryptionError: '',
    }
  } catch (error) {
    return {
      ...message,
      content: '',
      decryptionError: error.message || 'This message could not be decrypted.',
    }
  }
}

function mergeMessages(history, liveMessages) {
  const merged = []
  const seenIds = new Set()
  const seenCiphertexts = new Set()

  for (const message of [...history, ...liveMessages]) {
    const ciphertextKey = [
      message.sender_id,
      message.receiver_id,
      message.sender_encrypted_content,
      message.receiver_encrypted_content,
    ].join(':')

    if (seenIds.has(message.id) || seenCiphertexts.has(ciphertextKey)) continue
    seenIds.add(message.id)
    seenCiphertexts.add(ciphertextKey)
    merged.push(message)
  }

  return merged.sort((first, second) => (
    new Date(first.created_at).getTime() - new Date(second.created_at).getTime()
  ))
}

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export default function ChatWindow({ activeUser, onBack }) {
  const { user } = useAuth()
  const { status, messages, sendMessage } = useSocket()
  const [historyResult, setHistoryResult] = useState({
    contactId: null,
    messages: [],
    error: '',
  })
  const [liveMessages, setLiveMessages] = useState([])
  const [incomingError, setIncomingError] = useState('')
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState('')
  const bottomRef = useRef(null)
  const processedLiveIdsRef = useRef(new Set())

  const contactId = activeUser?.id
  const currentHistory = useMemo(
    () => historyResult.contactId === contactId ? historyResult.messages : [],
    [historyResult, contactId],
  )
  const currentLiveMessages = useMemo(
    () => liveMessages.filter((message) => isInConversation(message, user.userId, contactId)),
    [liveMessages, user.userId, contactId],
  )
  const historyError = historyResult.contactId === contactId ? historyResult.error : ''
  const isLoadingHistory = Boolean(contactId) && historyResult.contactId !== contactId
  const thread = useMemo(
    () => mergeMessages(currentHistory, currentLiveMessages),
    [currentHistory, currentLiveMessages],
  )

  useEffect(() => {
    if (!contactId) return undefined

    const controller = new AbortController()

    const loadHistory = async () => {
      try {
        const { data } = await api.get(`/api/messages/${encodeURIComponent(contactId)}`, {
          signal: controller.signal,
        })
        if (!Array.isArray(data)) {
          throw new Error('The server returned an invalid chat history response.')
        }

        const keyPair = await getStoredKeyPair(user.userId)
        if (!keyPair?.privateKey) {
          throw new Error('Your private encryption key is unavailable in this browser.')
        }

        const decryptedHistory = await Promise.all(
          data.map((message) => decryptRecord(message, user.userId, keyPair.privateKey)),
        )
        if (!controller.signal.aborted) {
          setHistoryResult({ contactId, messages: decryptedHistory, error: '' })
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setHistoryResult({
            contactId,
            messages: [],
            error: error.response?.data?.error || error.message || 'Could not load messages.',
          })
        }
      }
    }

    loadHistory()
    return () => controller.abort()
  }, [contactId, user.userId])

  useEffect(() => {
    const pending = messages.filter((message) => (
      contactId
      && isInConversation(message, user.userId, contactId)
      && !processedLiveIdsRef.current.has(message.id)
    ))
    if (!pending.length) return

    for (const message of pending) processedLiveIdsRef.current.add(message.id)

    const decryptLiveMessages = async () => {
      try {
        const keyPair = await getStoredKeyPair(user.userId)
        if (!keyPair?.privateKey) {
          throw new Error('Your private encryption key is unavailable in this browser.')
        }

        const decryptedMessages = await Promise.all(
          pending.map((message) => decryptRecord(message, user.userId, keyPair.privateKey)),
        )
        setLiveMessages((current) => [...current, ...decryptedMessages])
      } catch (error) {
        setIncomingError(error.message || 'Could not decrypt incoming messages.')
      }
    }

    decryptLiveMessages()
  }, [messages, contactId, user.userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread.length, contactId])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !activeUser) return

    setSendError('')
    try {
      const [receiverResponse, senderResponse] = await Promise.all([
        api.get(`/api/users/${encodeURIComponent(activeUser.id)}/public-key`),
        api.get(`/api/users/${encodeURIComponent(user.userId)}/public-key`),
      ])
      const receiverPublicKeyBase64 = receiverResponse.data.publicKey
      const senderPublicKeyBase64 = senderResponse.data.publicKey
      if (!receiverPublicKeyBase64 || !senderPublicKeyBase64) {
        throw new Error('An encryption key is not available for this conversation.')
      }

      const [receiverPublicKey, senderPublicKey] = await Promise.all([
        importPublicKey(receiverPublicKeyBase64),
        importPublicKey(senderPublicKeyBase64),
      ])
      const [receiverEncryptedContent, senderEncryptedContent] = await Promise.all([
        encryptMessage(content, receiverPublicKey),
        encryptMessage(content, senderPublicKey),
      ])

      sendMessage(activeUser.id, receiverEncryptedContent, senderEncryptedContent)
      setDraft('')
    } catch (error) {
      setSendError(error.response?.data?.error || error.message || 'Message could not be sent.')
    }
  }

  if (!activeUser) {
    return (
      <section className="hidden min-w-0 flex-1 items-center justify-center bg-slate-950/50 md:flex">
        <div className="max-w-sm px-8 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-violet-500/10 text-violet-300">
            <LockKeyhole aria-hidden="true" size={27} />
          </span>
          <h2 className="mt-5 text-xl font-semibold text-white">Your conversations, together</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Search for someone and choose them to open an encrypted chat.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-slate-950/50">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="Back to conversations"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={19} />
          </button>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-indigo-500 to-fuchsia-500 font-semibold text-white">
            {activeUser.username?.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-white">{activeUser.username}</h2>
            <p className="flex items-center gap-1 text-xs text-emerald-300">
              <LockKeyhole aria-hidden="true" size={12} /> End-to-end encrypted
            </p>
          </div>
        </div>
        <span className={`text-xs ${
          status === 'connected' ? 'text-emerald-300' : 'text-amber-300'
        }`}>
          {status === 'connected' ? 'Connected' : status === 'disconnected' ? 'Offline' : 'Connecting…'}
        </span>
      </header>

      <div aria-live="polite" className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-7">
        {isLoadingHistory && (
          <p className="text-center text-sm text-slate-500">Loading conversation…</p>
        )}
        {(historyError || incomingError) && (
          <p className="mx-auto max-w-lg rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-300">
            {historyError || incomingError}
          </p>
        )}
        {!isLoadingHistory && thread.length === 0 && !historyError && (
          <div className="flex h-full min-h-40 items-center justify-center">
            <p className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-400">
              Say hello to {activeUser.username}
            </p>
          </div>
        )}
        {thread.map((message) => {
          const outgoing = message.sender_id === user.userId
          return (
            <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`} key={message.id}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[70%] ${
                outgoing
                  ? 'rounded-br-md bg-violet-600 text-white'
                  : 'rounded-bl-md border border-slate-800 bg-slate-900 text-slate-200'
              }`}>
                {message.decryptionError ? (
                  <p className="text-rose-200">Unable to decrypt this message.</p>
                ) : (
                  <p className="wrap-break-words whitespace-pre-wrap">{message.content}</p>
                )}
                <p className={`mt-1 text-right text-[10px] ${
                  outgoing ? 'text-violet-200' : 'text-slate-500'
                }`}>
                  {formatTime(message.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-800 p-4 sm:px-7 sm:py-5">
        {sendError && <p className="mb-3 text-sm text-rose-300">{sendError}</p>}
        <form className="flex items-end gap-3" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="chat-message">Message</label>
          <textarea
            className="max-h-32 min-h-12 flex-1 resize-y rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400"
            id="chat-message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={`Message ${activeUser.username}…`}
            value={draft}
          />
          <button
            aria-label="Send message"
            className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.trim() || status !== 'connected' || isLoadingHistory}
            type="submit"
          >
            <Send aria-hidden="true" size={16} />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </section>
  )
}
