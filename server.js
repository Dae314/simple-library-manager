import { WebSocketServer } from 'ws';

// Create the WebSocketServer before importing the SvelteKit app so that
// hooks.server.ts can pick it up via globalThis.__wss during startup.
const wss = new WebSocketServer({ noServer: true });
globalThis.__wss = wss;

// Importing build/index.js starts the HTTP server with all adapter-node
// features: graceful shutdown, keep-alive timeout, headers timeout, request
// tracking, and socket activation support.
const { server } = await import('./build/index.js');

// Access the underlying http.Server from the Polka instance.
const httpServer = server.server;

// Handle HTTP upgrade requests — only accept our /ws path.
httpServer.on('upgrade', (request, socket, head) => {
	const { pathname } = new URL(request.url, `http://${request.headers.host}`);

	if (pathname === '/ws') {
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit('connection', ws, request);
		});
	} else {
		// Not our WebSocket path — destroy the socket.
		socket.destroy();
	}
});

// The adapter-node build/index.js emits 'sveltekit:shutdown' on the process
// object after the HTTP server closes during graceful shutdown (SIGTERM/SIGINT).
// Close all WebSocket connections with code 1001 ("Going Away") so clients
// know to reconnect, then close the WebSocketServer itself.
process.on('sveltekit:shutdown', () => {
	for (const client of wss.clients) {
		client.close(1001, 'Server shutting down');
	}
	wss.close();
});
