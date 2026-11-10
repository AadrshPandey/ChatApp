import { useEffect, useState } from 'react'
import { useAuth, api } from '../context/AuthContext.jsx'

function getErrorMessage(error) {
  return error.response?.data?.error
    || error.response?.data?.message
    || 'Could not search users. Please try again.'
}

export default function Sidebar({ activeUser, onSelectUser }) {
  const { user, signOut } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    setError('')
    try {
      await signOut()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
      setSigningOut(false)
    }
  }

  useEffect(() => {
    const value = query.trim()
    if (!value) return undefined

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get('/api/users/search', {
          params: { q: value },
          signal: controller.signal,
        })
        setResults(Array.isArray(data) ? data : [])
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setResults([])
          setError(getErrorMessage(requestError))
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  return (
    <aside className="flex w-full shrink-0 flex-col border-r border-slate-800 bg-slate-900 md:w-80">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-violet-500/15 text-lg text-violet-300">✦</span>
          <div>
            <p className="font-semibold text-white">Gather</p>
            <p className="max-w-40 truncate text-xs text-slate-400">{user?.username}</p>
          </div>
        </div>
        <button
          aria-label="Sign out"
          className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
          disabled={signingOut}
          onClick={handleSignOut}
          type="button"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      <div className="border-b border-slate-800 p-5">
        <h1 className="text-lg font-semibold text-white">Messages</h1>
        <label className="mt-4 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-violet-400">
          <span aria-hidden="true" className="text-slate-500">⌕</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            onChange={(event) => {
              setQuery(event.target.value)
              setResults([])
              setError('')
              setLoading(false)
            }}
            placeholder="Search people..."
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && <p className="px-3 py-4 text-sm text-slate-400">Searching…</p>}
        {error && <p className="m-2 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
        {!loading && !error && query.trim() && results.length === 0 && (
          <p className="px-3 py-4 text-sm text-slate-400">No users found.</p>
        )}
        {results.map((result) => {
          const selected = activeUser?.id === result.id
          return (
            <button
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                selected ? 'bg-violet-500/15' : 'hover:bg-slate-800'
              }`}
              key={result.id}
              onClick={() => onSelectUser(result)}
              type="button"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 font-semibold text-white">
                {result.username?.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-100">{result.username}</span>
                <span className="block truncate text-xs text-slate-500">Start a conversation</span>
              </span>
            </button>
          )
        })}
        {!query.trim() && (
          <p className="px-3 py-4 text-sm leading-6 text-slate-500">
            Search for a username to start a conversation.
          </p>
        )}
      </div>
    </aside>
  )
}
