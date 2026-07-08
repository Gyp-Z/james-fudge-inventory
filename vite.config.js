import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only stand-in for Vercel's /api functions, so a plain `npm run dev` serves the FULL
// app (Jarvis chat, entry chat, trivia) without needing a linked `vercel dev`. It loads
// api/<name>.js through Vite's module runner and adapts Node's req/res to the Vercel
// handler shape (req.body, res.status().json()). Production is untouched — Vercel still
// runs the real functions; this plugin only applies to `serve`.
function vercelApiDev(env) {
  return {
    name: 'vercel-api-dev',
    apply: 'serve',
    configureServer(server) {
      // Vercel functions read secrets from process.env (ANTHROPIC_API_KEY etc.) — mirror
      // the full .env there, since Vite itself only exposes VITE_* to client code.
      Object.assign(process.env, env)
      server.middlewares.use('/api', async (req, res) => {
        try {
          const name = (req.url || '').split('?')[0].replace(/^\/+/, '')
          if (!/^[a-z-]+$/i.test(name)) { res.statusCode = 404; res.end('Not found'); return }
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          let raw = ''
          for await (const chunk of req) raw += chunk
          try { req.body = raw ? JSON.parse(raw) : undefined } catch { req.body = undefined }
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
          await mod.default(req, res)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e?.message || 'Dev API error' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), vercelApiDev(env)],
  }
})
