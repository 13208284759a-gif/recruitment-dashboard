import { createServer } from 'node:http';
import worker from './worker.mjs';

const env = {
  FEISHU_APP_ID: process.env.FEISHU_APP_ID,
  FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET,
};

createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://localhost');
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      outgoing.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const request = new Request(url, { method: incoming.method === 'HEAD' ? 'GET' : incoming.method });
    // Serve the live roster through the existing Feishu integration until
    // dedicated credentials are configured for this Render service.
    const useSharedRoster = url.pathname === '/api/roster' &&
      !(env.FEISHU_APP_ID && env.FEISHU_APP_SECRET);
    const response = useSharedRoster
      ? await fetch('https://interview-desk-hr-1125.leapingcherry8.chatgpt.site/api/roster', {
          signal: AbortSignal.timeout(45000),
          headers: { Accept: 'application/json' },
        })
      : await worker.fetch(request, env);
    const headers = useSharedRoster
      ? { 'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' }
      : Object.fromEntries(response.headers);
    outgoing.writeHead(response.status, headers);
    outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('暂时无法加载工作台');
  }
}).listen(Number(process.env.PORT || 10000), '0.0.0.0');
