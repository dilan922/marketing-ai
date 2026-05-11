import { Router } from 'express'
import { generarImagen } from '../services/gemini.js'

const router = Router()

router.post('/generate', async (req, res) => {
  const { prompt } = req.body
  if (!prompt) return res.status(400).json({ error: 'El prompt es obligatorio' })

  try {
    const b64 = await generarImagen(prompt)
    res.json({ ok: true, imagen: `data:image/png;base64,${b64}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
