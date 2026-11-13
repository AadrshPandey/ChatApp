import localforage from 'localforage'

const KEY_STORE_PREFIX = 'chatapp:keypair:'
const KEY_DATABASE_NAME = 'chatapp-crypto'
const KEY_STORE_NAME = 'keypairs'
const RSA_ALGORITHM = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}
const OAEP_SHA256_MAX_BYTES = 190 
const MAX_MESSAGE_BYTES = 64 * 1024
const ENVELOPE_PREFIX = '{"algorithm":"RSA-OAEP-256","version":1,"chunks":'
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
let keyDatabasePromise;

function getSubtleCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable. Use a secure browser context (HTTPS or localhost).')
  }
  return globalThis.crypto.subtle
}

function toBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return btoa(binary)
}

function fromBase64(value) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('The encrypted data or public key is not valid Base64.')
  }

  let binary
  try {
    binary = atob(value)
  } catch (error) {
    throw new Error('The encrypted data or public key is not valid Base64.', { cause: error })
  }

  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function openKeyDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser.'))
  }
  if (keyDatabasePromise) return keyDatabasePromise

  keyDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DATABASE_NAME, 1)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(KEY_STORE_NAME)) {
        database.createObjectStore(KEY_STORE_NAME)
      }
    }

    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }

    request.onerror = () => {
      reject(request.error || new Error('Unable to open the encryption key database.'))
    }

    request.onblocked = () => {
      reject(new Error('The encryption key database is blocked by another browser tab.'))
    }
  }).catch((error) => {
    keyDatabasePromise = null
    throw error
  })

  return keyDatabasePromise
}

async function transactOnKeyStore(mode, operation) {
  const database = await openKeyDatabase()

  return new Promise((resolve, reject) => {
    let result
    let settled = false
    const transaction = database.transaction(KEY_STORE_NAME, mode)
    const request = operation(transaction.objectStore(KEY_STORE_NAME))

    request.onsuccess = () => {
      result = request.result
    }

    request.onerror = () => {
      if (settled) return
      settled = true
      reject(request.error || new Error('Unable to access the encryption key database.'))
    }

    transaction.oncomplete = () => {
      if (settled) return
      settled = true
      resolve(result)
    }

    transaction.onerror = () => {
      if (settled) return
      settled = true
      reject(transaction.error || new Error('The encryption key database transaction failed.'))
    }

    transaction.onabort = () => {
      if (settled) return
      settled = true
      reject(transaction.error || new Error('The encryption key database transaction was aborted.'))
    }
  })
}

function isUsablePrivateKey(privateKey) {
  return privateKey?.type === 'private'
    && privateKey.algorithm?.name === 'RSA-OAEP'
    && privateKey.usages?.includes('decrypt')
}

export async function generateKeyPair() {
  const subtle = getSubtleCrypto()
  const generated = await subtle.generateKey(RSA_ALGORITHM, true, ['encrypt', 'decrypt'])
  const publicKeyBytes = await subtle.exportKey('spki', generated.publicKey)
  const privateKeyBytes = await subtle.exportKey('pkcs8', generated.privateKey)

  try {
    const privateKey = await subtle.importKey(
      'pkcs8',
      privateKeyBytes,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt'],
    )

    return {
      publicKey: generated.publicKey,
      privateKey,
      exportedPublicKey: toBase64(publicKeyBytes),
    }
  } finally {
    new Uint8Array(privateKeyBytes).fill(0)
  }
}

export async function exportPublicKey(publicKey) {
  if (!publicKey || publicKey.type !== 'public' || publicKey.algorithm?.name !== 'RSA-OAEP') {
    throw new Error('A valid RSA-OAEP public key is required.')
  }

  return toBase64(await getSubtleCrypto().exportKey('spki', publicKey))
}

export async function importPublicKey(publicKeyBase64) {
  return getSubtleCrypto().importKey(
    'spki',
    fromBase64(publicKeyBase64),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )
}

function splitIntoRsaBlocks(plaintext) {
  const blocks = []
  let current = []
  let currentLength = 0

  for (const character of plaintext) {
    const encodedCharacter = encoder.encode(character)
    if (currentLength + encodedCharacter.length > OAEP_SHA256_MAX_BYTES) {
      blocks.push(new Uint8Array(current))
      current = []
      currentLength = 0
    }
    current.push(...encodedCharacter)
    currentLength += encodedCharacter.length
  }

  if (current.length) blocks.push(new Uint8Array(current))
  return blocks
}

export async function encryptMessage(plaintext, publicKey) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('Message content must be a string.')
  }
  if (!publicKey || publicKey.type !== 'public' || publicKey.algorithm?.name !== 'RSA-OAEP') {
    throw new Error('A valid RSA-OAEP public key is required.')
  }

  const plaintextBytes = encoder.encode(plaintext)
  if (plaintextBytes.length > MAX_MESSAGE_BYTES) {
    throw new Error(`Messages must be no larger than ${MAX_MESSAGE_BYTES / 1024} KiB.`)
  }

  const blocks = splitIntoRsaBlocks(plaintext)
  if (!blocks.length) blocks.push(new Uint8Array())
  const encryptedBlocks = []

  for (const block of blocks) {
    const encryptedBlock = await getSubtleCrypto().encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      block,
    )
    encryptedBlocks.push(toBase64(encryptedBlock))
  }

  const envelope = `${ENVELOPE_PREFIX}${JSON.stringify(encryptedBlocks)}}`
  return toBase64(encoder.encode(envelope))
}

export async function decryptMessage(encryptedContent, privateKey) {
  if (!privateKey || privateKey.type !== 'private' || privateKey.algorithm?.name !== 'RSA-OAEP') {
    throw new Error('A valid RSA-OAEP private key is required.')
  }

  const encodedContent = fromBase64(encryptedContent)
  const encodedEnvelope = new TextDecoder().decode(encodedContent)
  let encryptedBlocks

  if (encodedEnvelope.startsWith(ENVELOPE_PREFIX)) {
    try {
      const envelope = JSON.parse(encodedEnvelope)
      if (envelope.version !== 1
        || envelope.algorithm !== 'RSA-OAEP-256'
        || !Array.isArray(envelope.chunks)
        || envelope.chunks.length === 0
        || envelope.chunks.some((chunk) => typeof chunk !== 'string')) {
        throw new Error('The encrypted message envelope is invalid.')
      }
      encryptedBlocks = envelope.chunks.map(fromBase64)
    } catch (error) {
      throw new Error('The encrypted message envelope is invalid.', { cause: error })
    }
  } else {
    encryptedBlocks = [encodedContent]
  }

  const plaintextBlocks = []
  for (const block of encryptedBlocks) {
    plaintextBlocks.push(new Uint8Array(await getSubtleCrypto().decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      block,
    )))
  }

  const plaintextLength = plaintextBlocks.reduce((length, block) => length + block.length, 0)
  const plaintextBytes = new Uint8Array(plaintextLength)
  let offset = 0
  for (const block of plaintextBlocks) {
    plaintextBytes.set(block, offset)
    offset += block.length
  }

  return decoder.decode(plaintextBytes)
}

export async function storeKeyPair(userId, keyPair) {
  if (!userId || !isUsablePrivateKey(keyPair?.privateKey) || !keyPair.publicKey) {
    throw new Error('A user ID and complete key pair are required.')
  }

  const storedKeyPair = {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  }

  await transactOnKeyStore('readwrite', (store) => (
    store.put(storedKeyPair, userId)
  ))
  await localforage.setItem(`${KEY_STORE_PREFIX}${userId}`, {
    publicKey: keyPair.publicKey,
  })
}

export async function getStoredKeyPair(userId) {
  if (!userId) throw new Error('A user ID is required to retrieve a key pair.')

  const keyPair = await transactOnKeyStore('readonly', (store) => store.get(userId))
  if (!keyPair || !isUsablePrivateKey(keyPair.privateKey)) return null

  return keyPair
}