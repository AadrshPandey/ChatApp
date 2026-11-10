import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useSocket } from '../context/SocketContext.jsx'

export default function ChatWindow({ activeUser }) {
  const { user } = useAuth()
  const { status, messages, sendMessage } = useSocket()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  const thread = activeUser
    ? messages.filter((message) => {
      if (message.senderId === user.userId) return message.receiverId === activeUser.id
      return message.senderId === activeUser.id
    })
    : []
  const hasUnidentifiedIncoming = messages.some(
    (message) => message.receiverId === user.userId && !message.senderId,
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread.length, activeUser?.id])

  const handleSubmit = (event) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !activeUser) return

    setError('')
    try {
      sendMessage(activeUser.id, content)
      setDraft('')
    } catch (sendError) {
      setError(sendError.message)
    }
  }

  if (!activeUser) {
    return (
      <section className="hidden min-w-0 flex-1 items-center justify-center bg-slate-950/50 md:flex">
        <div className="max-w-sm px-8 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-violet-500/10 text-3xl text-violet-300">✦</span>
          <h2 className="mt-5 text-xl font-semibold text-white">Your conversations, together</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Search for someone and choose them to open a chat.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-slate-950/50">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 font-semibold text-white">
            {activeUser.username?.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-white">{activeUser.username}</h2>
          </div>
        </div>
      </header>

      <div aria-live="polite" className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-7">
        {hasUnidentifiedIncoming && (
          <p className="mx-auto max-w-lg rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
            The server sent a message without its sender ID, so it cannot be assigned to this conversation.
          </p>
        )}
        {thread.length === 0 && (
          <div className="flex h-full min-h-40 items-center justify-center">
            <p className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-400">
              Say hello to {activeUser.username}
            </p>
          </div>
        )}
        {thread.map((message) => {
          const outgoing = message.senderId === user.userId
          return (
            <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`} key={message.id}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[70%] ${
                outgoing
                  ? 'rounded-br-md bg-violet-600 text-white'
                  : 'rounded-bl-md border border-slate-800 bg-slate-900 text-slate-200'
              }`}>
                <p className="break-words whitespace-pre-wrap">{message.encryptedContent}</p>
                {!outgoing && !message.senderId && (
                  <p className="mt-1 text-[10px] text-amber-300">Sender not identified by server</p>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-800 p-4 sm:px-7 sm:py-5">
        {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}
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
            className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.trim() || status !== 'connected'}
            type="submit"
          >
            Send
          </button>
        </form>
        
      </div>
    </section>
  )
}
