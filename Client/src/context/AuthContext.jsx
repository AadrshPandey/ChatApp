import axios from 'axios'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  generateKeyPair,
  getStoredKeyPair,
  storeKeyPair,
} from '../utils/crypto.js'

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
const keyInitializationByUser = new Map()

async function initializeUserKeyPair(userId) {
  let keyPair = await getStoredKeyPair(userId)

  if (!keyPair?.privateKey || !keyPair.publicKey) {
    const { data } = await api.get(`/api/users/${encodeURIComponent(userId)}/public-key`)
    if (typeof data.publicKey === 'string' && data.publicKey.trim()) {
      const error = new Error(
        'This account already has an encryption key that is not stored in this browser. '
        + 'The existing private key cannot be recovered from the server.',
      )
      error.code = 'MISSING_PRIVATE_KEY'
      throw error
    }

    const generated = await generateKeyPair()
    keyPair = {
      privateKey: generated.privateKey,
      publicKey: generated.exportedPublicKey,
    }
    await storeKeyPair(userId, keyPair)
  }

  await api.post('/api/users/public-key', { publicKey: keyPair.publicKey })
}

function ensureUserKeyPair(userId) {
  const pendingInitialization = keyInitializationByUser.get(userId)
  if (pendingInitialization) return pendingInitialization

  const initialization = initializeUserKeyPair(userId)
  keyInitializationByUser.set(userId, initialization)
  initialization.then(
    () => {
      if (keyInitializationByUser.get(userId) === initialization) {
        keyInitializationByUser.delete(userId)
      }
    },
    () => {
      if (keyInitializationByUser.get(userId) === initialization) {
        keyInitializationByUser.delete(userId)
      }
    },
  )
  return initialization
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const [keyRecoveryUser, setKeyRecoveryUser] = useState(null)

  useEffect(() => {
    let active = true
    const restoreSession = async () => {
      let restoredUser = null
      try {
        const { data } = await api.get('/api/auth/me')
        if (!data.userId || !data.username) {
          throw new Error('The server returned an invalid session response.')
        }
        restoredUser = { userId: data.userId, username: data.username }
        await ensureUserKeyPair(data.userId)
        if (active) setKeyRecoveryUser(null)
        if (active) setUser(restoredUser)
      } catch (error) {
        if (active && error.code === 'MISSING_PRIVATE_KEY') {
          setKeyRecoveryUser(restoredUser)
        }
        if (error.response?.status !== 401) {
          console.error('Unable to restore the current session:', error)
          if (active) {
            setSessionError(error.message || 'Unable to restore your session.')
          }
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    restoreSession()

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const { data } = await api.post('/api/auth/login', credentials)
    if (!data.userId || !data.username) {
      throw new Error('The server returned an invalid login response.')
    }

    try {
      await ensureUserKeyPair(data.userId)
      setSessionError('')
      setKeyRecoveryUser(null)
      setUser({ userId: data.userId, username: data.username })
      return data
    } catch (error) {
      if (error.code === 'MISSING_PRIVATE_KEY') {
        setKeyRecoveryUser({ userId: data.userId, username: data.username })
      }
      throw error
    }
  }, [])

  const register = useCallback(async (credentials) => {
    await api.post('/api/auth/register', credentials)
    return login(credentials)
  }, [login])

  const logout = useCallback(() => setUser(null), [])
  const signOut = useCallback(async () => {
    await api.post('/api/auth/logout')
    logout()
    setKeyRecoveryUser(null)
  }, [logout])

  const resetEncryptionKey = useCallback(async () => {
    if (!keyRecoveryUser?.userId) {
      throw new Error('There is no account awaiting encryption key recovery.')
    }

    const generated = await generateKeyPair()
    const keyPair = {
      privateKey: generated.privateKey,
      publicKey: generated.exportedPublicKey,
    }

    await storeKeyPair(keyRecoveryUser.userId, keyPair)
    await api.post('/api/users/public-key', { publicKey: keyPair.publicKey })
    setUser(keyRecoveryUser)
    setKeyRecoveryUser(null)
    setSessionError('')
  }, [keyRecoveryUser])

  const value = useMemo(
    () => ({
      user,
      isLoading,
      sessionError,
      keyRecoveryUser,
      login,
      register,
      logout,
      signOut,
      resetEncryptionKey,
    }),
    [
      user,
      isLoading,
      sessionError,
      keyRecoveryUser,
      login,
      register,
      logout,
      signOut,
      resetEncryptionKey,
    ],
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
