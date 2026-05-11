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

const keyState = new Map(KEYS.map(k => [k, { exhausted: false, lastUsed: 0 }]))

function getAvailableKey(exclude = null) {
  const available = KEYS.filter(k => !keyState.get(k)?.exhausted && k !== exclude)
  if (available.length === 0) {
    KEYS.forEach(k => { if (keyState.has(k)) keyState.get(k).exhausted = false })
    return KEYS[0]
  }
  return available.sort((a, b) => keyState.get(a).lastUsed - keyState.get(b).lastUsed)[0]
}

function mhFetch(endpoint, method, body, key) {
  return fetch(`${BASE}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// Sube imagen y devuelve { filePath, key } — la misma key debe usarse para crear el video
export async function uploadImage(imageBuffer, extension = 'jpg') {
  const key = getAvailableKey()
  keyState.get(key).lastUsed = Date.now()

  const urlRes = await mhFetch('/files/upload-urls', 'POST', {
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

  return { filePath: file_path, key }
}

// Crear job de video. Si se sube imagen primero, pasar uploadKey para usar la misma cuenta.
export async function crearVideo({ prompt, filePath, duracion = 10, modelo = 'kling-3.0', aspectRatio = '9:16', uploadKey = null }) {
  let intentos = 0
  const maxIntentos = uploadKey ? 1 : KEYS.length

  while (intentos < maxIntentos) {
    // Si hay imagen subida, DEBE usarse la misma key (misma cuenta)
    const key = uploadKey || getAvailableKey()
    if (!uploadKey) keyState.get(key).lastUsed = Date.now()

    const endpoint = filePath ? '/image-to-video' : '/text-to-video'
    const resolution = modelo === 'ltx-2' ? '480p' : '720p'
    const body = {
      end_seconds: duracion,
      style: { prompt },
      model: modelo,
      aspect_ratio: aspectRatio,
      resolution,
      ...(filePath && { assets: { image_file_path: filePath } }),
    }

    const res = await mhFetch(endpoint, 'POST', body, key)

    if (res.status === 402) {
      if (uploadKey) {
        keyState.get(key).exhausted = true
        throw new Error('La key usada para subir la imagen no tiene créditos.')
      }
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
