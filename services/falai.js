const QUEUE = 'https://queue.fal.run'
const UPLOAD = 'https://fal.run/files/upload'

const KEYS = [
  process.env.FAL_KEY_1,  process.env.FAL_KEY_2,  process.env.FAL_KEY_3,
  process.env.FAL_KEY_4,  process.env.FAL_KEY_5,  process.env.FAL_KEY_6,
  process.env.FAL_KEY_7,  process.env.FAL_KEY_8,  process.env.FAL_KEY_9,
  process.env.FAL_KEY_10, process.env.FAL_KEY_11, process.env.FAL_KEY_12,
  process.env.FAL_KEY_13, process.env.FAL_KEY_14, process.env.FAL_KEY_15,
  process.env.FAL_KEY_16, process.env.FAL_KEY_17, process.env.FAL_KEY_18,
  process.env.FAL_KEY_19, process.env.FAL_KEY_20,
].filter(Boolean)

const keyState = new Map(KEYS.map(k => [k, { exhausted: false, lastUsed: 0, exhaustedAt: 0 }]))

function isPastMidnight(exhaustedAt) {
  const then = new Date(exhaustedAt)
  const now = new Date()
  return now.getFullYear() !== then.getFullYear() ||
    now.getMonth() !== then.getMonth() ||
    now.getDate() !== then.getDate()
}

function getAvailableKey() {
  KEYS.forEach(k => {
    const s = keyState.get(k)
    if (s.exhausted && s.exhaustedAt && isPastMidnight(s.exhaustedAt)) {
      s.exhausted = false; s.exhaustedAt = 0
    }
  })
  const available = KEYS.filter(k => !keyState.get(k)?.exhausted)
  if (available.length === 0) return null
  return available.sort((a, b) => keyState.get(a).lastUsed - keyState.get(b).lastUsed)[0]
}

export function resetFalKeys() {
  KEYS.forEach(k => { const s = keyState.get(k); if (s) { s.exhausted = false; s.exhaustedAt = 0 } })
}

export function getFalKeysStatus() {
  const now = Date.now()
  return KEYS.map((k, i) => {
    const s = keyState.get(k)
    return {
      numero: i + 1,
      agotada: s?.exhausted || false,
      horasRestantes: s?.exhausted && s?.exhaustedAt
        ? Math.max(0, Math.ceil((RESET_MS - (now - s.exhaustedAt)) / 3600000)) : 0,
    }
  })
}

function falHeaders(key) {
  return { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }
}

// Modelo frontend → endpoint de Fal.ai
function modelToFal(modelo, hasImage) {
  const map = {
    'kling-3.0': hasImage ? 'fal-ai/kling-video/v2.1/standard/image-to-video' : 'fal-ai/kling-video/v2.1/standard/text-to-video',
    'ltx-2':     hasImage ? 'fal-ai/ltx-video/image-to-video' : 'fal-ai/ltx-video',
    'sora-2':    hasImage ? 'fal-ai/wan/v2.1/1.3b/image-to-video' : 'fal-ai/wan/v2.1/1.3b',
  }
  return map[modelo] || (hasImage ? 'fal-ai/ltx-video/image-to-video' : 'fal-ai/ltx-video')
}

async function uploadToFal(buffer, mimetype, key) {
  const res = await fetch(UPLOAD, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': mimetype },
    body: buffer,
  })
  if (res.status === 402 || res.status === 429) throw { noCredits: true }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Fal upload error ${res.status}`)
  }
  const data = await res.json()
  return data.url
}

export async function crearVideoFal({ prompt, imageBuffer, imageExt = 'jpg', duracion = 5, modelo = 'ltx-2', aspectRatio = '9:16' }) {
  let intentos = 0
  while (intentos < KEYS.length) {
    const key = getAvailableKey()
    if (!key) break
    keyState.get(key).lastUsed = Date.now()

    try {
      let imageUrl = null
      if (imageBuffer) {
        imageUrl = await uploadToFal(imageBuffer, `image/${imageExt}`, key)
      }

      const modelId = modelToFal(modelo, !!imageUrl)
      const input = {
        prompt,
        ...(imageUrl && { image_url: imageUrl }),
        ...(aspectRatio && { aspect_ratio: aspectRatio }),
      }

      const res = await fetch(`${QUEUE}/${modelId}`, {
        method: 'POST',
        headers: falHeaders(key),
        body: JSON.stringify({ input }),
      })

      if (res.status === 402 || res.status === 429) {
        keyState.get(key).exhausted = true
        keyState.get(key).exhaustedAt = Date.now()
        console.log(`[FAL] Key #${KEYS.indexOf(key) + 1} sin créditos, rotando...`)
        intentos++
        continue
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || err.message || `Fal error ${res.status}`)
      }

      const data = await res.json()
      console.log(`[FAL] Job enviado: ${data.request_id}, model: ${modelId}`)
      return { requestId: data.request_id, modelId, key, provider: 'fal' }

    } catch (err) {
      if (err.noCredits) {
        keyState.get(key).exhausted = true
        keyState.get(key).exhaustedAt = Date.now()
        intentos++
        continue
      }
      throw err
    }
  }
  return null // Señal de que Fal no tiene keys disponibles → intentar Magic Hour
}

export async function estadoVideoFal(requestId, modelId, key) {
  const statusRes = await fetch(`${QUEUE}/${modelId}/requests/${requestId}/status`, {
    headers: { Authorization: `Key ${key}` },
  })
  if (!statusRes.ok) throw new Error(`Fal status error ${statusRes.status}`)
  const status = await statusRes.json()

  if (status.status === 'COMPLETED') {
    const resultRes = await fetch(`${QUEUE}/${modelId}/requests/${requestId}`, {
      headers: { Authorization: `Key ${key}` },
    })
    if (!resultRes.ok) throw new Error('Error obteniendo resultado de Fal')
    const result = await resultRes.json()
    return { status: 'complete', downloadUrl: result.video?.url || null }
  }
  if (status.status === 'FAILED') return { status: 'error' }
  return { status: 'in_progress' }
}
