const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export async function generarImagen(prompt) {
  const key = process.env.GEMINI_API_KEY
  if (!key || key === 'TU_GEMINI_KEY_AQUI') {
    throw new Error('Falta la Gemini API Key en el archivo .env')
  }

  const res = await fetch(
    `${BASE}/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Gemini error ${res.status}`)
  }

  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts
  const b64 = parts?.find(p => p.inlineData)?.inlineData?.data
  if (!b64) throw new Error('No se recibió imagen de Gemini')
  return b64
}
