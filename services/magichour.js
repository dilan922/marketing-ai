const BASE = 'https://api.magichour.ai/v1'
const RESET_MS = 24 * 60 * 60 * 1000 // 24 horas

const KEYS = [
  process.env.MH_KEY_1,  process.env.MH_KEY_2,  process.env.MH_KEY_3,
  process.env.MH_KEY_4,  process.env.MH_KEY_5,  process.env.MH_KEY_6,
  process.env.MH_KEY_7,  process.env.MH_KEY_8,  process.env.MH_KEY_9,
  process.env.MH_KEY_10, process.env.MH_KEY_11, process.env.MH_KEY_12,
  process.env.MH_KEY_13, process.env.MH_KEY_14, process.env.MH_KEY_15,
  process.env.MH_KEY_16, process.env.MH_KEY_17, process.env.MH_KEY_18,
  process.env.MH_KEY_19, process.env.MH_KEY_20,
].filter(Boolean)

const keyState = new Map(KEYS.map(k => [k, { exhausted: false, lastUsed: 0, exhaustedAt: 0 }]))

function getAvailableKey() {
  const now = Date.now()
  // Auto-reset keys agotadas hace más de 24h (Magic Hour renueva créditos diariamente)
  KEYS.forEach(k => {
    const s = keyState.get(k)
    if (s.exhausted && s.exhaustedAt && (now - s.exhaustedAt) > RESET_MS) {
      s.exhausted = false
      s.exhaustedAt = 0
    }
  })

  const available = KEYS.filter(k => !keyState.get(k)?.exhausted)
  if (available.length === 0) return null
  return available.sort((a, b) => keyState.get(a).lastUsed - keyState.get(b).lastUsed)[0]
}

export function resetKeys() {
  KEYS.forEach(k => {
    const s = keyState.get(k)
    if (s) { s.exhausted = false; s.exhaustedAt = 0 }
  })
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

  if (urlRes.status === 402) throw { noCredits: true }
  if (!urlRes.ok) {
    const body = await urlRes.json().catch(() => ({}))
    throw new Error(body.message || `Upload URL error ${urlRes.status}`)
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

export async function crearVideo({ prompt, imageBuffer = null, imageExt = 'jpg', duracion = 10, modelo = 'kling-3.0', aspectRatio = '9:16' }) {
  let intentos = 0

  while (intentos < KEYS.length) {
    const key = getAvailableKey()
    if (!key) break

    keyState.get(key).lastUsed = Date.now()

    // Subir imagen con esta key (si falla por créditos, continuar con text-to-video)
    let filePath = null
    let usingTextFallback = false
    if (imageBuffer) {
      try {
        filePath = await uploadImageWithKey(imageBuffer, imageExt, key)
      } catch (uploadErr) {
        if (uploadErr.noCredits) {
          console.log(`[MH] Key #${KEYS.indexOf(key) + 1}: upload imagen sin créditos, usando text-to-video`)
          usingTextFallback = true
          // No marcar como agotada aún — intentar text-to-video con esta misma key
        } else {
          throw new Error(`Error subiendo imagen: ${uploadErr.message}`)
        }
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
      keyState.get(key).exhaustedAt = Date.now()
      console.log(`[MH] Key #${KEYS.indexOf(key) + 1} sin créditos para video, rotando...`)
      intentos++
      continue
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `Magic Hour error ${res.status}`)
    }

    const data = await res.json()
    console.log(`[MH] Video creado con key #${KEYS.indexOf(key) + 1}, id: ${data.id}`)
    return { id: data.id, key, creditsUsed: data.credits_charged }
  }

  throw new Error('Todas las API keys de Magic Hour están agotadas. Usa el botón "Resetear Keys" mañana cuando los créditos se renueven.')
}

export async function estadoVideo(id) {
  const key = getAvailableKey()
  if (!key) throw new Error('Sin keys disponibles para consultar estado')
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

// Prueba cada key con GET /video-projects (no crea nada, no gasta créditos)
export async function testKeys() {
  const results = []
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i]
    try {
      const res = await mhFetch('/video-projects?page=1&page_size=1', 'GET', null, key)
      results.push({ numero: i + 1, status: res.status, ok: res.ok })
    } catch (e) {
      results.push({ numero: i + 1, status: 'error', ok: false, error: e.message })
    }
  }
  return results
}

export function getKeysStatus() {
  const now = Date.now()
  return KEYS.map((k, i) => {
    const s = keyState.get(k)
    const horasRestantes = s.exhausted && s.exhaustedAt
      ? Math.max(0, Math.ceil((RESET_MS - (now - s.exhaustedAt)) / 3600000))
      : 0
    return {
      numero: i + 1,
      agotada: s?.exhausted || false,
      ultimoUso: s?.lastUsed || 0,
      horasRestantes,
    }
  })
}
