import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist'),
  port = Number(process.env.RESUME_PORT || 8765);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
        path = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      if (!path.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!(await stat(path)).isFile()) throw Error();
      res.writeHead(200, {
        'Content-Type': types[extname(path)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(await readFile(path));
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
