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

function getAvailableKey() {
  const available = KEYS.filter(k => !keyState.get(k)?.exhausted)
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

async function uploadImageWithKey(imageBuffer, extension, key) {
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
  if (!putRes.ok) throw new Error(`Error subiendo imagen a S3: ${putRes.status}`)

  return file_path
}

// Crear video. Si se pasa imageBuffer, el retry sube la imagen de nuevo con la nueva key.
export async function crearVideo({ prompt, imageBuffer = null, imageExt = 'jpg', duracion = 10, modelo = 'kling-3.0', aspectRatio = '9:16' }) {
  let intentos = 0

  while (intentos < KEYS.length) {
    const key = getAvailableKey()
    keyState.get(key).lastUsed = Date.now()

    // Subir imagen con esta key si corresponde
    let filePath = null
    if (imageBuffer) {
      try {
        filePath = await uploadImageWithKey(imageBuffer, imageExt, key)
      } catch (uploadErr) {
        console.log(`[MH] Error subiendo imagen con key ${intentos + 1}: ${uploadErr.message}`)
        keyState.get(key).exhausted = true
        intentos++
        continue
      }
    }

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
      keyState.get(key).exhausted = true
      console.log(`[MH] Key ${intentos + 1} agotada, rotando...`)
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

export async function esperarVideo(id, onProgress) {
  const DELAYS = [3000, 5000, 8000, 10000, 15000, 20000]
  let attempt = 0
  while (true) {
    const data = await estadoVideo(id)
    if (onProgress) onProgress(data.status)
    if (data.status === 'complete') return data.downloads?.[0]?.url || null
    if (data.status === 'error') throw new Error(data.error?.message || 'Error generando video')
    if (data.status === 'canceled') throw new Error('Video cancelado')
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
