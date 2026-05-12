import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

const SCENE_ANGLES = [
  'product hero shot, clean minimal background, studio lighting, commercial photography, 4k sharp',
  'lifestyle context, elegant environment, person using product, natural warm lighting, aspirational',
  'dramatic brand shot, artistic composition, luxury feel, golden hour lighting, cinematic professional',
]

function getDimensions(aspectRatio) {
  if (aspectRatio === '16:9') return [1024, 576]
  if (aspectRatio === '1:1') return [720, 720]
  return [576, 1024]
}

async function fetchImage(prompt, w, h) {
  const seed = Math.floor(Math.random() * 9999999)
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`
  const res = await fetch(url, { signal: AbortSignal.timeout(90000) })
  if (!res.ok) throw new Error(`Pollinations error ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function crearSlideshowVideo({ prompt, duracion = 30, aspectRatio = '9:16' }) {
  const [w, h] = getDimensions(aspectRatio)
  const n = 3
  const clipDur = 10.5
  const fadeDur = 0.5

  const tmpDir = join(tmpdir(), `ss_${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })
  const cleanup = []

  try {
    console.log('[SLIDESHOW] Generando 5 imágenes secuencialmente...')
    const scenePrompts = SCENE_ANGLES.map(a => `${prompt}, ${a}`)
    const buffers = []
    for (let i = 0; i < scenePrompts.length; i++) {
      console.log(`[SLIDESHOW] Imagen ${i + 1}/5...`)
      buffers.push(await fetchImage(scenePrompts[i], w, h))
      if (i < scenePrompts.length - 1) await new Promise(r => setTimeout(r, 1500))
    }

    const imgPaths = []
    for (let i = 0; i < buffers.length; i++) {
      const p = join(tmpDir, `img${i}.jpg`)
      await writeFile(p, buffers[i])
      imgPaths.push(p)
      cleanup.push(p)
    }

    console.log('[SLIDESHOW] Creando video con FFmpeg...')
    const outPath = join(tmpDir, 'slideshow.mp4')
    cleanup.push(outPath)

    // Scale each input stream
    let fc = imgPaths.map((_, i) =>
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=25,format=yuv420p[v${i}]`
    ).join(';')
    fc += ';'

    // xfade chain — offset_i = i * (clipDur - fadeDur)
    let prev = '[v0]'
    for (let i = 1; i < n; i++) {
      const offset = i * (clipDur - fadeDur)
      const out = i === n - 1 ? '[vout]' : `[x${i}]`
      fc += `${prev}[v${i}]xfade=transition=fade:duration=${fadeDur}:offset=${offset}${out}`
      if (i < n - 1) fc += ';'
      prev = `[x${i}]`
    }

    const inputs = imgPaths.map(p => `-loop 1 -t ${clipDur} -i "${p}"`).join(' ')
    const cmd = `ffmpeg -y ${inputs} -filter_complex "${fc}" -map "[vout]" -t ${duracion} -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 "${outPath}"`

    await execAsync(cmd, { timeout: 180000 })

    const video = await readFile(outPath)
    console.log(`[SLIDESHOW] Listo: ${(video.length / 1024 / 1024).toFixed(1)}MB`)
    return video

  } finally {
    for (const f of cleanup) await unlink(f).catch(() => {})
    await execAsync(`rm -rf "${tmpDir}"`).catch(() => {})
  }
}
