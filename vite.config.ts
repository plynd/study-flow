// Путь: vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// В разработке (npm run dev) отдаём /api/* теми же функциями, что запустятся на Vercel
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      for (const name of ['ics', 'directory', 'search']) {
        server.middlewares.use('/api/' + name, async (req, res) => {
          try {
            const mod = await server.ssrLoadModule(`/api/${name}.ts`)
            const r: Response = await mod.GET(new Request('http://localhost' + req.originalUrl))
            res.statusCode = r.status
            r.headers.forEach((v, k) => res.setHeader(k, v))
            res.end(await r.text())
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(e) }))
          }
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDev()],
})
