import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import { setupWebSocketServer } from './setup.js';

/**
 * Vite plugin that attaches a WebSocket server to the dev server for
 * real-time update broadcasting during development.
 *
 * Uses `{ noServer: true }` and manually handles the HTTP `upgrade` event,
 * filtering by the `/ws` path. This is critical because Vite uses its own
 * WebSocket for Hot Module Replacement — attaching a `ws` WebSocketServer
 * directly to the HTTP server would intercept ALL upgrade requests and
 * break Vite's HMR.
 */
export function webSocketPlugin(): Plugin {
	return {
		name: 'board-game-library-ws',
		configureServer(server) {
			const wss = new WebSocketServer({ noServer: true });

			server.httpServer?.on('upgrade', (request, socket, head) => {
				const { pathname } = new URL(request.url, `http://${request.headers.host}`);

				if (pathname === '/ws') {
					wss.handleUpgrade(request, socket, head, (ws) => {
						wss.emit('connection', ws, request);
					});
				}
				// IMPORTANT: Do NOT destroy the socket for non-/ws paths.
				// Vite needs to handle its own HMR WebSocket upgrades on other paths.
			});

			setupWebSocketServer(wss);
		}
	};
}
