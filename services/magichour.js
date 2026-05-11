const BASE = 'https://api.magichour.ai/v1'

const KEYS = [
  process.env.MH_KEY_1,  process.env.MH_KEY_2,  process.env.MH_KEY_3,
  process.env.MH_KEY_4,  process.env.MH_KEY_5,  process.env.MH_KEY_6,
  process.env.MH_KEY_7,  process.env.MH_KEY_8,  process.env.MH_KEY_9,
  process.env.MH_KEY_10, process.env.MH_KEY_11, process.env.MH_KEY_12,
  process.env.MH_KEY_13, process.env.MH_KEY_14, process.env.MH_KEY_15,
  process.env.MH_KEY_16, process.env.MH_KEY_17, process.env.MH_KEY_18,
  process.env.MH_KEY_19, process.env.MH_KEY_20,
].filter(Boolean)

// Estado de cada key: cuándo fue usada y si está agotada
const keyState = new Map(KEYS.map(k => [k, { exhausted: false, lastUsed: 0 }]))

function getAvailableKey() {
  const available = KEYS.filter(k => !keyState.get(k)?.exhausted)
  if (available.length === 0) {
    // Todas agotadas — reset diario y empezar de nuevo
    KEYS.forEach(k => { if (keyState.has(k)) keyState.get(k).exhausted = false })
    return KEYS[0]
  }
  // Usa la que lleva más tiempo sin usarse (round-robin justo)
  return available.sort((a, b) => keyState.get(a).lastUsed - keyState.get(b).lastUsed)[0]
}

function mhFetch(endpoint, method, body, key) {
  return fetch(`${BASE}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// Subir imagen de producto a Magic Hour y obtener file_path
export async function uploadImage(imageBuffer, extension = 'jpg') {
  const key = getAvailableKey()
  keyState.get(key).lastUsed = Date.now()

  const urlRes = await mhFetch('/files/generate-asset-upload-urls', 'POST', {
    items: [{ type: 'image', extension }]
  }, key)
  if (!urlRes.ok) {
    const err = await urlRes.json().catch(() => ({}))
    throw new Error(err.message || `Error obteniendo upload URL: ${urlRes.status}`)
  }
  const { items } = await urlRes.json()
  const { upload_url, file_path } = items[0]

  const putRes = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': `image/${extension}` },
    body: imageBuffer,
  })
  if (!putRes.ok) {
    throw new Error(`Error subiendo imagen a S3: ${putRes.status}`)
  }

  return file_path
}

// Crear job de video con rotación automática de keys
export async function crearVideo({ prompt, filePath, duracion = 10, modelo = 'kling-3.0', aspectRatio = '9:16' }) {
  let intentos = 0
  while (intentos < KEYS.length) {
    const key = getAvailableKey()
    keyState.get(key).lastUsed = Date.now()

    const endpoint = filePath ? '/image-to-video' : '/text-to-video'
    const body = {
      end_seconds: duracion,
      style: { prompt },
      model: modelo,
      aspect_ratio: aspectRatio,
      resolution: '720p',
      ...(filePath && { assets: { image_file_path: filePath } }),
    }

    const res = await mhFetch(endpoint, 'POST', body, key)

    if (res.status === 402) {
      // Sin créditos — marcar key como agotada y reintentar
      keyState.get(key).exhausted = true
      console.log(`[MH] Key agotada, rotando a siguiente...`)
      intentos++
      continue
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `Magic Hour error ${res.status}`)
    }

    const data = await res.json()
    return { id: data.id, key, creditsUsed: data.credits_charged }
  }
  throw new Error('Todas las API keys de Magic Hour están agotadas por hoy. Se renovarán mañana.')
}

// Consultar estado del video
export async function estadoVideo(id) {
  const key = getAvailableKey()
  const res = await mhFetch(`/video-projects/${id}`, 'GET', null, key)
  if (!res.ok) throw new Error(`Error consultando estado: ${res.status}`)
  return res.json()
}

// Esperar hasta que el video esté listo (polling)
export async function esperarVideo(id, onProgress) {
  const DELAYS = [3000, 5000, 8000, 10000, 15000, 20000]
  let attempt = 0

  while (true) {
    const data = await estadoVideo(id)
    if (onProgress) onProgress(data.status)

    if (data.status === 'complete') {
      return data.downloads?.[0]?.url || null
    }
    if (data.status === 'error') {
      throw new Error(data.error?.message || 'Error generando video')
    }
    if (data.status === 'canceled') {
      throw new Error('Video cancelado')
    }

    const delay = DELAYS[Math.min(attempt, DELAYS.length - 1)]
    await new Promise(r => setTimeout(r, delay))
    attempt++
  }
}

export function getKeysStatus() {
  return KEYS.map((k, i) => ({
    numero: i + 1,
    agotada: keyState.get(k)?.exhausted || false,
    ultimoUso: keyState.get(k)?.lastUsed || 0,
  }))
}
