import axios from 'axios'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

/* eslint react-refresh/only-export-components: off */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin)

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.defaults.withCredentials = true

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    api.get('/api/auth/me')
      .then(({ data }) => {
        if (active && data.userId && data.username) {
          setUser({ userId: data.userId, username: data.username })
        }
      })
      .catch((error) => {
        if (error.response?.status !== 401) {
          console.error('Unable to restore the current session:', error)
        }
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const { data } = await api.post('/api/auth/login', credentials)
    if (!data.userId || !data.username) {
      throw new Error('The server returned an invalid login response.')
    }
    setUser({ userId: data.userId, username: data.username })
    return data
  }, [])

  const register = useCallback(async (credentials) => {
    const { data } = await api.post('/api/auth/register', credentials)
    return data
  }, [])

  const logout = useCallback(() => setUser(null), [])
  const signOut = useCallback(async () => {
    await api.post('/api/auth/logout')
    logout()
  }, [logout])

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout, signOut }),
    [user, isLoading, login, register, logout, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }
  return context
}
