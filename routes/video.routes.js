import { Router } from 'express'
import multer from 'multer'
import { crearVideo, getKeysStatus, resetKeys, estadoVideo } from '../services/magichour.js'
import { crearVideoFal, estadoVideoFal, getFalKeysStatus, resetFalKeys } from '../services/falai.js'
import { generarAudio } from '../services/elevenlabs.js'
import { transcribirConTimestamps, quemarSubtitulos, generarSRT, ffmpegDisponible } from '../services/subtitles.js'
import { mezclarMusica } from '../services/audiomix.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// Mapa en memoria: jobId → { provider, modelId, key }
const jobMeta = new Map()

// Estado de keys (Fal + Magic Hour)
router.get('/keys-status', (req, res) => {
  res.json({
    magichour: getKeysStatus(),
    fal: getFalKeysStatus(),
  })
})

router.post('/reset-keys', (req, res) => {
  resetKeys()
  resetFalKeys()
  res.json({ ok: true, magichour: getKeysStatus(), fal: getFalKeysStatus() })
})

// Generar video: Fal.ai primero, Magic Hour como respaldo
router.post('/generate', upload.single('imagen'), async (req, res) => {
  const { prompt, duracion = 5, modelo = 'ltx-2', aspectRatio = '9:16' } = req.body
  if (!prompt) return res.status(400).json({ error: 'El prompt es obligatorio' })

  const imageBuffer = req.file ? req.file.buffer : null
  const imageExt = req.file ? (req.file.mimetype.split('/')[1] || 'jpg') : 'jpg'
  const dur = Math.min(Math.max(parseInt(duracion), 1), 30)

  try {
    // 1. Intentar con Fal.ai
    const falResult = await crearVideoFal({ prompt, imageBuffer, imageExt, duracion: dur, modelo, aspectRatio })

    if (falResult) {
      const jobId = `fal_${falResult.requestId}`
      jobMeta.set(jobId, { provider: 'fal', modelId: falResult.modelId, key: falResult.key })
      return res.json({ ok: true, jobId, provider: 'fal', mensaje: 'Video en cola en Fal.ai...' })
    }

    // 2. Fal sin keys → intentar Magic Hour
    console.log('[VIDEO] Fal.ai sin keys, intentando Magic Hour...')
    const mhResult = await crearVideo({ prompt, imageBuffer, imageExt, duracion: dur, modelo, aspectRatio })
    const jobId = `mh_${mhResult.id}`
    jobMeta.set(jobId, { provider: 'magichour' })
    return res.json({ ok: true, jobId, provider: 'magichour', mensaje: 'Video en cola en Magic Hour...' })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Consultar estado (detecta proveedor por prefijo del jobId)
router.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params
  const meta = jobMeta.get(jobId)

  try {
    if (jobId.startsWith('fal_') && meta) {
      const requestId = jobId.replace('fal_', '')
      const data = await estadoVideoFal(requestId, meta.modelId, meta.key)
      return res.json(data)
    }

    // Magic Hour (prefijo mh_ o ids legacy)
    const mhId = jobId.replace('mh_', '')
    const data = await estadoVideo(mhId)
    return res.json({
      status: data.status,
      downloadUrl: data.downloads?.[0]?.url || null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Generar audio + subtítulos
router.post('/audio-subtitulos', upload.single('video'), async (req, res) => {
  const { guion, conSubtitulos = 'true' } = req.body
  if (!guion) return res.status(400).json({ error: 'El guión es obligatorio' })
  if (!req.file) return res.status(400).json({ error: 'El video es obligatorio' })

  try {
    const audioBuffer = await generarAudio(guion)
    let videoFinal = req.file.buffer

    if (conSubtitulos === 'true' && await ffmpegDisponible()) {
      const words = await transcribirConTimestamps(audioBuffer, 'audio/mpeg')
      if (words.length > 0) {
        videoFinal = await quemarSubtitulos(req.file.buffer, words, `video_${Date.now()}`)
      }
    }

    res.set({ 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="video_con_audio.mp4"' })
    res.send(videoFinal)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/subtitulos', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Audio obligatorio' })
  try {
    const words = await transcribirConTimestamps(req.file.buffer, req.file.mimetype)
    const srt = generarSRT(words)
    res.set({ 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="subtitulos.srt"' })
    res.send(srt)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/mix-music', async (req, res) => {
  const { videoUrl, musicUrl } = req.body
  if (!videoUrl || !musicUrl) return res.status(400).json({ error: 'videoUrl y musicUrl son obligatorios' })
  if (!await ffmpegDisponible()) return res.status(503).json({ error: 'FFmpeg no disponible' })

  try {
    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) throw new Error('No se pudo descargar el video')
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer())
    const mixed = await mezclarMusica(videoBuffer, musicUrl)
    res.set({ 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="video_con_musica.mp4"', 'Content-Length': mixed.length })
    res.send(mixed)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
