import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.ETCH_PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.json': 'application/json' };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
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
