import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

function getErrorMessage(error) {
  return error.response?.data?.message
    || error.response?.data?.error
    || error.message
    || 'Something went wrong. Please try again.'
}

export default function Auth() {
  const navigate = useNavigate()
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const isLogin = mode === 'login'

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)

    try {
      if (isLogin) {
        await login({ username: username.trim(), password })
        navigate('/', { replace: true })
      } else {
        await register({ username: username.trim(), password })
        setMode('login')
        setPassword('')
        setNotice('Account created. Sign in with your new credentials.')
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40 md:grid-cols-2">
        <section className="hidden flex-col justify-between bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-700 p-12 md:flex">
          <div className="flex items-center gap-3 font-semibold tracking-wide">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15 text-xl">✦</span>
            <span>Gather</span>
          </div>
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-indigo-100">Stay close</p>
            <h1 className="max-w-sm text-4xl font-semibold leading-tight tracking-tight">
              Good conversations start here.
            </h1>
            <p className="mt-5 max-w-sm leading-7 text-indigo-100">
              Find your people and keep the conversation going, wherever they are.
            </p>
          </div>
          <p className="text-sm text-indigo-100/80">Simple, private, and always in touch.</p>
        </section>

        <section className="p-7 sm:p-11">
          <div className="mb-8 md:hidden">
            <span className="font-semibold tracking-wide text-violet-300">✦ Gather</span>
          </div>
          <p className="text-sm font-medium text-violet-300">{isLogin ? 'WELCOME BACK' : 'GET STARTED'}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {isLogin ? 'Sign in to Gather' : 'Create your account'}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {isLogin ? 'Your conversations are waiting for you.' : 'It only takes a moment to get connected.'}
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-300">
              Username
              <input
                autoComplete="username"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
                maxLength={50}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Your username"
                required
                value={username}
              />
            </label>

            <label className="block text-sm font-medium text-slate-300">
              Password
              <input
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                required
                type="password"
                value={password}
              />
            </label>

            {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
            {notice && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</p>}

            <button
              className="w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {isLogin ? 'New to Gather?' : 'Already have an account?'}{' '}
            <button
              className="font-semibold text-violet-300 hover:text-violet-200"
              onClick={() => {
                setError('')
                setNotice('')
                setMode(isLogin ? 'register' : 'login')
              }}
              type="button"
            >
              {isLogin ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </section>
      </div>
    </main>
  )
}
