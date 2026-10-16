// In-process event bus feeding the real-time (Server-Sent Events) streams.
import { EventEmitter } from 'node:events';

export const events = new EventEmitter();
events.setMaxListeners(0);

// Opens an SSE stream on an Express response. Returns a `send(event, data)` function.
export function openStream(req, res, onClose) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    onClose?.();
  });
  return send;
}
