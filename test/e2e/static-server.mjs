// Minimal static file server for the built webview bundle (out/webview).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..', '..', 'out', 'webview')
const PORT = Number(process.env.E2E_STATIC_PORT || 4320)

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
    try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
        const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
        const filePath = join(ROOT, safePath)

        let body = await readFile(filePath)
        if (extname(filePath) === '.html') {
            body = Buffer.from(String(body).replace(/\{\{cspSource\}\}/g, "'self'"))
        }
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' })
        res.end(body)
    } catch {
        res.writeHead(404)
        res.end('Not found')
    }
})

server.listen(PORT, () => {
    console.log(`Lite webview static server listening on http://localhost:${PORT}`)
})

process.on('SIGTERM', () => server.close())
