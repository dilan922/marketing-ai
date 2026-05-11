import { Router } from 'express'

const router = Router()
const BASE_KM = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree'
const BASE_SH = 'https://www.soundhelix.com/examples/mp3'

// Catálogo curado — Kevin MacLeod (CC BY 4.0) + SoundHelix (libre de derechos)
const CATALOG = [
  // ── URBAN ───────────────────────────────────────────────
  { id:'km1',  title:'Funky Chunk',      artist:'Kevin MacLeod', genre:'urban',    duration:134, previewUrl:`${BASE_KM}/Funky%20Chunk.mp3`,      coverUrl:'', bpm:100 },
  { id:'km2',  title:'Funkorama',        artist:'Kevin MacLeod', genre:'urban',    duration:128, previewUrl:`${BASE_KM}/Funkorama.mp3`,           coverUrl:'', bpm:105 },
  { id:'km3',  title:'Bass Walker',      artist:'Kevin MacLeod', genre:'urban',    duration:156, previewUrl:`${BASE_KM}/Bass%20Walker.mp3`,        coverUrl:'', bpm:98  },
  { id:'km4',  title:'Sneaky Snitch',    artist:'Kevin MacLeod', genre:'urban',    duration:133, previewUrl:`${BASE_KM}/Sneaky%20Snitch.mp3`,      coverUrl:'', bpm:92  },
  { id:'sh1',  title:'Electronic Groove',artist:'SoundHelix',    genre:'urban',    duration:356, previewUrl:`${BASE_SH}/SoundHelix-Song-9.mp3`,    coverUrl:'', bpm:120 },

  // ── LO-FI ───────────────────────────────────────────────
  { id:'km5',  title:'Slow Burn',        artist:'Kevin MacLeod', genre:'lofi',     duration:210, previewUrl:`${BASE_KM}/Slow%20Burn.mp3`,          coverUrl:'', bpm:70  },
  { id:'km6',  title:'Ouroboros',        artist:'Kevin MacLeod', genre:'lofi',     duration:184, previewUrl:`${BASE_KM}/Ouroboros.mp3`,            coverUrl:'', bpm:75  },
  { id:'km7',  title:'Fuzzball Parade',  artist:'Kevin MacLeod', genre:'lofi',     duration:142, previewUrl:`${BASE_KM}/Fuzzball%20Parade.mp3`,    coverUrl:'', bpm:80  },
  { id:'sh2',  title:'Lo-fi Chill',      artist:'SoundHelix',    genre:'lofi',     duration:380, previewUrl:`${BASE_SH}/SoundHelix-Song-3.mp3`,    coverUrl:'', bpm:68  },
  { id:'sh3',  title:'Ambient Dream',    artist:'SoundHelix',    genre:'lofi',     duration:412, previewUrl:`${BASE_SH}/SoundHelix-Song-7.mp3`,    coverUrl:'', bpm:72  },

  // ── TIKTOK VIBES ────────────────────────────────────────
  { id:'km8',  title:'Digital Lemonade', artist:'Kevin MacLeod', genre:'tiktok',   duration:176, previewUrl:`${BASE_KM}/Digital%20Lemonade.mp3`,   coverUrl:'', bpm:118 },
  { id:'km9',  title:'Doh De Oh',        artist:'Kevin MacLeod', genre:'tiktok',   duration:110, previewUrl:`${BASE_KM}/Doh%20De%20Oh.mp3`,        coverUrl:'', bpm:115 },
  { id:'km10', title:'Happy Bee',        artist:'Kevin MacLeod', genre:'tiktok',   duration:136, previewUrl:`${BASE_KM}/Happy%20Bee.mp3`,           coverUrl:'', bpm:130 },
  { id:'km11', title:'Take a Chance',    artist:'Kevin MacLeod', genre:'tiktok',   duration:152, previewUrl:`${BASE_KM}/Take%20a%20Chance.mp3`,    coverUrl:'', bpm:122 },
  { id:'sh4',  title:'Pop Pulse',        artist:'SoundHelix',    genre:'tiktok',   duration:298, previewUrl:`${BASE_SH}/SoundHelix-Song-2.mp3`,    coverUrl:'', bpm:128 },

  // ── ENERGÉTICO ──────────────────────────────────────────
  { id:'km12', title:'Evening of Chaos', artist:'Kevin MacLeod', genre:'energetic',duration:198, previewUrl:`${BASE_KM}/Evening%20of%20Chaos.mp3`, coverUrl:'', bpm:140 },
  { id:'km13', title:'Beauty Flow',      artist:'Kevin MacLeod', genre:'energetic',duration:244, previewUrl:`${BASE_KM}/Beauty%20Flow.mp3`,         coverUrl:'', bpm:135 },
  { id:'sh5',  title:'Power Drive',      artist:'SoundHelix',    genre:'energetic',duration:321, previewUrl:`${BASE_SH}/SoundHelix-Song-4.mp3`,    coverUrl:'', bpm:145 },
  { id:'sh6',  title:'Upbeat Rush',      artist:'SoundHelix',    genre:'energetic',duration:287, previewUrl:`${BASE_SH}/SoundHelix-Song-8.mp3`,    coverUrl:'', bpm:138 },

  // ── ROMÁNTICO ───────────────────────────────────────────
  { id:'km14', title:'Fluffing a Duck',  artist:'Kevin MacLeod', genre:'romantic', duration:124, previewUrl:`${BASE_KM}/Fluffing%20a%20Duck.mp3`,  coverUrl:'', bpm:85  },
  { id:'sh7',  title:'Soft Romance',     artist:'SoundHelix',    genre:'romantic', duration:345, previewUrl:`${BASE_SH}/SoundHelix-Song-13.mp3`,   coverUrl:'', bpm:76  },
  { id:'sh8',  title:'Gentle Melody',    artist:'SoundHelix',    genre:'romantic', duration:398, previewUrl:`${BASE_SH}/SoundHelix-Song-14.mp3`,   coverUrl:'', bpm:72  },
  { id:'sh9',  title:'Warm Feelings',    artist:'SoundHelix',    genre:'romantic', duration:362, previewUrl:`${BASE_SH}/SoundHelix-Song-15.mp3`,   coverUrl:'', bpm:78  },

  // ── CORPORATIVO ─────────────────────────────────────────
  { id:'km15', title:'Lobby Time',       artist:'Kevin MacLeod', genre:'corporate',duration:214, previewUrl:`${BASE_KM}/Lobby%20Time.mp3`,          coverUrl:'', bpm:90  },
  { id:'km16', title:'Ishikari Lore',    artist:'Kevin MacLeod', genre:'corporate',duration:188, previewUrl:`${BASE_KM}/Ishikari%20Lore.mp3`,       coverUrl:'', bpm:88  },
  { id:'sh10', title:'Professional Vibe',artist:'SoundHelix',    genre:'corporate',duration:334, previewUrl:`${BASE_SH}/SoundHelix-Song-16.mp3`,   coverUrl:'', bpm:95  },
  { id:'sh11', title:'Clean Motion',     artist:'SoundHelix',    genre:'corporate',duration:289, previewUrl:`${BASE_SH}/SoundHelix-Song-17.mp3`,   coverUrl:'', bpm:92  },
]

const GENRE_COLORS = {
  urban:     '#F97316',
  lofi:      '#7C3AED',
  tiktok:    '#EC4899',
  energetic: '#10B981',
  romantic:  '#F43F5E',
  corporate: '#3B82F6',
}

const GENRE_NAMES = {
  urban: 'Urban', lofi: 'Lo-fi', tiktok: 'TikTok Vibes',
  energetic: 'Energético', romantic: 'Romántico', corporate: 'Corporativo',
}

// GET /api/audio/genres
router.get('/genres', (req, res) => {
  const genres = [...new Set(CATALOG.map(t => t.genre))].map(key => ({
    key, name: GENRE_NAMES[key] || key, color: GENRE_COLORS[key] || '#6B7280',
  }))
  res.json(genres)
})

// GET /api/audio/trending?genre=urban
router.get('/trending', (req, res) => {
  const genre = req.query.genre || 'tiktok'
  const tracks = CATALOG.filter(t => t.genre === genre)
  res.json(tracks)
})

// GET /api/audio/search?q=texto
router.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim()
  if (!q) return res.json([])
  const results = CATALOG.filter(t =>
    t.title.toLowerCase().includes(q) ||
    t.artist.toLowerCase().includes(q) ||
    t.genre.toLowerCase().includes(q)
  )
  res.json(results)
})

export default router
