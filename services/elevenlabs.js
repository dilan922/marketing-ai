const VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Adam — voz masculina natural

const KEYS = [
  process.env.ELEVENLABS_API_KEY_1,
  process.env.ELEVENLABS_API_KEY_2,
].filter(Boolean)

const exhausted = new Set()

function getKey() {
  const available = KEYS.filter(k => !exhausted.has(k))
  if (available.length === 0) {
    exhausted.clear()
    return KEYS[0]
  }
  return available[0]
}

export async function generarAudio(texto, voiceId = VOICE_ID) {
  if (KEYS.length === 0) throw new Error('Falta la ElevenLabs API Key en el archivo .env')

  let intentos = 0
  while (intentos < KEYS.length) {
    const key = getKey()
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: texto,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
      }),
    })

    if (res.status === 429 || res.status === 401) {
      // Sin créditos o key inválida — rotar a la siguiente
      exhausted.add(key)
      intentos++
      continue
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail?.message || `ElevenLabs error ${res.status}`)
    }

    return Buffer.from(await res.arrayBuffer())
  }

  throw new Error('Ambas keys de ElevenLabs están agotadas')
}

export async function getVoices() {
  const key = getKey()
  if (!key) return []
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })
  const data = await res.json()
  return data.voices || []
}
