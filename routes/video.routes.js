import { Router } from 'express'
import multer from 'multer'
import { crearVideo, uploadImage, esperarVideo, getKeysStatus } from '../services/magichour.js'
import { generarAudio } from '../services/elevenlabs.js'
import { transcribirConTimestamps, quemarSubtitulos, generarSRT, ffmpegDisponible } from '../services/subtitles.js'
import { mezclarMusica } from '../services/audiomix.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// Estado de las API keys
router.get('/keys-status', (req, res) => {
  res.json(getKeysStatus())
})

// Generar video (text-to-video o image-to-video)
router.post('/generate', upload.single('imagen'), async (req, res) => {
  const { prompt, duracion = 10, modelo = 'kling-3.0', aspectRatio = '9:16', guion } = req.body

  if (!prompt) return res.status(400).json({ error: 'El prompt es obligatorio' })

  try {
    // 1. Subir imagen si viene
    let filePath = null
    if (req.file) {
      const ext = req.file.mimetype.split('/')[1] || 'jpg'
      filePath = await uploadImage(req.file.buffer, ext)
    }

    // 2. Crear job de video en Magic Hour
    const { id } = await crearVideo({
      prompt,
      filePath,
      duracion: Math.min(Math.max(parseInt(duracion), 1), 60),
      modelo,
      aspectRatio,
    })

    res.json({ ok: true, jobId: id, mensaje: 'Video en cola, consultando estado...' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Consultar estado de un job
router.get('/status/:id', async (req, res) => {
  try {
    const { estadoVideo } = await import('../services/magichour.js')
    const data = await estadoVideo(req.params.id)
    res.json({
      status: data.status,
      downloadUrl: data.downloads?.[0]?.url || null,
      credits: data.credits_charged,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Generar audio desde guión + subtítulos + combinar con video
router.post('/audio-subtitulos', upload.single('video'), async (req, res) => {
  const { guion, conSubtitulos = 'true' } = req.body
  if (!guion) return res.status(400).json({ error: 'El guión es obligatorio' })
  if (!req.file) return res.status(400).json({ error: 'El video es obligatorio' })

  try {
    // 1. Generar audio con ElevenLabs
    const audioBuffer = await generarAudio(guion)

    let videoFinal = req.file.buffer

    // 2. Si FFmpeg está disponible, combinar video + audio + subtítulos
    if (conSubtitulos === 'true' && await ffmpegDisponible()) {
      const words = await transcribirConTimestamps(audioBuffer, 'audio/mpeg')
      if (words.length > 0) {
        videoFinal = await quemarSubtitulos(req.file.buffer, words, `video_${Date.now()}`)
      }
    }

    res.set({
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="video_con_audio.mp4"`,
    })
    res.send(videoFinal)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Solo generar subtítulos SRT desde audio
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

// Mezclar video con música de fondo (ducking 15%)
// Body: { videoUrl, musicUrl }
router.post('/mix-music', async (req, res) => {
  const { videoUrl, musicUrl } = req.body
  if (!videoUrl || !musicUrl) return res.status(400).json({ error: 'videoUrl y musicUrl son obligatorios' })

  if (!await ffmpegDisponible()) {
    return res.status(503).json({ error: 'FFmpeg no disponible en el servidor' })
  }

  try {
    // Descargar video desde Magic Hour
    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) throw new Error('No se pudo descargar el video')
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer())

    // Mezclar con música al 15%
    const mixed = await mezclarMusica(videoBuffer, musicUrl)

    res.set({
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="video_con_musica.mp4"`,
      'Content-Length': mixed.length,
    })
    res.send(mixed)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
