const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export async function generarImagen(prompt) {
  const key = process.env.GEMINI_API_KEY
  if (!key || key === 'TU_GEMINI_KEY_AQUI') {
    throw new Error('Falta la Gemini API Key en el archivo .env')
  }

  const res = await fetch(
    `${BASE}/models/imagen-4.0-generate-001:predict?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Gemini error ${res.status}`)
  }

  const data = await res.json()
  // Imagen 4 usa image.imageBytes, Imagen 3 usaba bytesBase64Encoded
  const pred = data.predictions?.[0]
  const b64 = pred?.bytesBase64Encoded || pred?.image?.imageBytes
  if (!b64) throw new Error('No se recibió imagen de Gemini')
  return b64
}
