import { Router } from 'express'

const router = Router()
const JAMENDO_ID = process.env.JAMENDO_CLIENT_ID || 'b6747d04'
const JAMENDO = 'https://api.jamendo.com/v3.0'

// Géneros predefinidos para secciones de Tendencias
const GENEROS = {
  urban:     { name: 'Urban', tags: 'urban+hip-hop', color: '#F97316' },
  lofi:      { name: 'Lo-fi', tags: 'lofi+chill',   color: '#7C3AED' },
  tiktok:    { name: 'TikTok Vibes', tags: 'pop+electronic', color: '#EC4899' },
  energetic: { name: 'Energético', tags: 'energetic+upbeat', color: '#10B981' },
  romantic:  { name: 'Romántico', tags: 'romantic+acoustic', color: '#F43F5E' },
  corporate: { name: 'Corporativo', tags: 'corporate+background', color: '#3B82F6' },
}

function mapTrack(t) {
  return {
    id:         t.id,
    title:      t.name,
    artist:     t.artist_name,
    duration:   t.duration,
    previewUrl: t.audio,        // MP3 streaming directo
    coverUrl:   t.album_image || t.image || '',
    genre:      t.musicinfo?.tags?.genres?.[0] || '',
  }
}

// GET /api/audio/search?q=texto
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.json([])
  try {
    const url = `${JAMENDO}/tracks/?client_id=${JAMENDO_ID}&format=json&limit=12&search=${encodeURIComponent(q)}&audioformat=mp32&include=musicinfo&imagesize=100`
    const data = await fetch(url).then(r => r.json())
    res.json((data.results || []).map(mapTrack))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/audio/trending?genre=urban
router.get('/trending', async (req, res) => {
  const genreKey = req.query.genre || 'tiktok'
  const g = GENEROS[genreKey] || GENEROS.tiktok
  try {
    const url = `${JAMENDO}/tracks/?client_id=${JAMENDO_ID}&format=json&limit=8&tags=${g.tags}&audioformat=mp32&include=musicinfo&imagesize=100&boost=popularity_total`
    const data = await fetch(url).then(r => r.json())
    res.json((data.results || []).map(mapTrack))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/audio/genres — lista de géneros disponibles
router.get('/genres', (req, res) => {
  res.json(Object.entries(GENEROS).map(([key, g]) => ({ key, ...g })))
})

export default router
