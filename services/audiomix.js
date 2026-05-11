import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))
const TMP = join(__dirname, '..', 'downloads')

// Descargar URL a buffer
async function descargarUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo descargar: ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

// Mezclar video con música de fondo al 15% de volumen (ducking)
export async function mezclarMusica(videoBuffer, musicUrl) {
  const ts = Date.now()
  const videoIn = join(TMP, `vid_${ts}.mp4`)
  const musicIn = join(TMP, `mus_${ts}.mp3`)
  const videoOut = join(TMP, `mix_${ts}.mp4`)

  try {
    await writeFile(videoIn, videoBuffer)

    // Descargar la música
    const musicBuf = await descargarUrl(musicUrl)
    await writeFile(musicIn, musicBuf)

    // Obtener duración del video para fade out de música
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoIn}"`,
      { timeout: 15000 }
    )
    const duracion = parseFloat(stdout.trim()) || 30
    const fadeStart = Math.max(0, duracion - 2)

    // Mezcla: música al 15%, fade out 2s antes del final, loop si es más corta que el video
    await execAsync(
      `ffmpeg -i "${videoIn}" -stream_loop -1 -i "${musicIn}" ` +
      `-filter_complex "[1:a]volume=0.15,afade=t=out:st=${fadeStart}:d=2[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]" ` +
      `-map 0:v -map "[aout]" -c:v copy -shortest "${videoOut}" -y`,
      { timeout: 180000 }
    )

    return await readFile(videoOut)
  } finally {
    for (const f of [videoIn, musicIn, videoOut]) {
      unlink(f).catch(() => {})
    }
  }
}

export async function ffmpegDisponible() {
  try { await execAsync('ffmpeg -version', { timeout: 5000 }); return true }
  catch { return false }
}
