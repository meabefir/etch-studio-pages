import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep, isAbsolute, basename } from 'node:path';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.ETCH_PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.json': 'application/json' };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host) || (req.headers.origin && !allowedHosts.some(host => req.headers.origin === `http://${host}`))) { res.writeHead(403).end('Local app requests only.'); return; }
      if (pathname === '/api/capabilities' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ localPaths: true })); return; }
      if (!['/api/model', '/api/model-info'].includes(pathname) || req.method !== 'POST') { res.writeHead(404).end('Not found'); return; }
      if (!req.headers['content-type']?.startsWith('application/json')) { res.writeHead(415).end('Send a JSON model path.'); return; }
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 8192) { res.writeHead(413).end('Path request too long.'); return; } }
      let path; try { path = JSON.parse(body).path; } catch { res.writeHead(400).end('Invalid path request.'); return; }
      if (typeof path !== 'string' || !isAbsolute(path) || !['.obj', '.glb'].includes(extname(path).toLowerCase())) { res.writeHead(400).end('Enter the full local path to an OBJ or GLB file.'); return; }
      try {
        const info = await stat(path); if (!info.isFile()) throw new Error('Not a file');
        if (pathname === '/api/model-info') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ filename: basename(path), size: info.size })); return; }
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': info.size, 'X-Model-Filename': encodeURIComponent(basename(path)) });
        const stream = createReadStream(path); stream.on('error', () => res.destroy()); stream.pipe(res); return;
      } catch { res.writeHead(404).end('Model file not found or cannot be read. Update its path to continue.'); return; }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
    const info = await stat(path); if (!info.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(await readFile(path));
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`; console.log(`Etch studio: ${url}`);
  if (process.argv.includes('--open')) {
    const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
    const executable = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(executable, args, { windowsHide: true, detached: true, stdio: 'ignore' }); child.on('error', () => {}); child.unref();
  }
});
