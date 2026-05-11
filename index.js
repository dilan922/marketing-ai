import 'dotenv/config'
import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import videoRoutes from './routes/video.routes.js'
import imageRoutes from './routes/image.routes.js'
import audioRoutes from './routes/audio.routes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000

const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, 'public')))

app.use('/api/video', videoRoutes)
app.use('/api/image', imageRoutes)
app.use('/api/audio', audioRoutes)

app.listen(PORT, () => {
  console.log(`\n🎬 MARKETING AI corriendo en http://localhost:${PORT}\n`)
})
