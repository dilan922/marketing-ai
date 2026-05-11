import Groq from 'groq-sdk'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))
const TMP = join(__dirname, '..', 'downloads')

let groq = null
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return groq
}

// Transcribir audio con Whisper y obtener timestamps por palabra
export async function transcribirConTimestamps(audioBuffer, mimetype = 'audio/mpeg') {
  const ext = mimetype.split('/')[1]?.split(';')[0] || 'mp3'
  const file = new File([audioBuffer], `audio.${ext}`, { type: mimetype })

  const result = await getGroq().audio.transcriptions.create({
    file,
    model: 'whisper-large-v3-turbo',
    language: 'es',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  })

  return result.words || []
}

// Agrupar palabras en bloques para subtítulos estilo TikTok/Reels
function agruparPalabras(words, porBloque = 4) {
  const bloques = []
  for (let i = 0; i < words.length; i += porBloque) {
    const chunk = words.slice(i, i + porBloque)
    bloques.push({
      texto: chunk.map(w => w.word.toUpperCase()).join(' '),
      inicio: chunk[0].start,
      fin: chunk[chunk.length - 1].end,
    })
  }
  return bloques
}

function segundosToSRT(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 1000)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`
}

export function generarSRT(words) {
  const bloques = agruparPalabras(words, 4)
  return bloques.map((b, i) =>
    `${i + 1}\n${segundosToSRT(b.inicio)} --> ${segundosToSRT(b.fin)}\n${b.texto}`
  ).join('\n\n')
}

// Quemar subtítulos en video con FFmpeg (estilo llamativo)
export async function quemarSubtitulos(videoBuffer, words, outputName) {
  const ts = Date.now()
  const videoIn  = join(TMP, `in_${ts}.mp4`)
  const srtFile  = join(TMP, `sub_${ts}.srt`)
  const videoOut = join(TMP, `${outputName}_sub.mp4`)

  try {
    await writeFile(videoIn, videoBuffer)
    await writeFile(srtFile, generarSRT(words))

    // Estilo subtítulos: blanco bold con borde negro grueso, fuente grande
    const style = [
      'FontName=Arial Black',
      'FontSize=22',
      'PrimaryColour=&H00FFFFFF',
      'OutlineColour=&H00000000',
      'BackColour=&H80000000',
      'Bold=1',
      'Outline=4',
      'Shadow=2',
      'Alignment=2',
      'MarginV=40',
    ].join(',')

    const srtPath = srtFile.replace(/\\/g, '/').replace(/:/g, '\\:')
    await execAsync(
      `ffmpeg -i "${videoIn}" -vf "subtitles='${srtPath}':force_style='${style}'" -c:a copy "${videoOut}" -y`,
      { timeout: 120000 }
    )

    const result = await readFile(videoOut)
    return result
  } finally {
    for (const f of [videoIn, srtFile, videoOut]) {
      unlink(f).catch(() => {})
    }
  }
}

export async function ffmpegDisponible() {
  try {
    await execAsync('ffmpeg -version')
    return true
  } catch {
    return false
  }
}
