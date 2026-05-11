// Generación de imágenes con Pollinations.ai (gratuito, sin API key)
export async function generarImagen(prompt) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=576&height=1024&nologo=true&model=flux&seed=${Date.now()}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pollinations error ${res.status}`)

  const buffer = await res.arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}
