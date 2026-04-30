import type { WebSocketServer, WebSocket } from 'ws';
import { connectionManager } from './connection-manager.js';

const HEARTBEAT_INTERVAL = 30_000;

/**
 * Wire up connection tracking, close/error cleanup, and ping/pong heartbeat
 * on the given WebSocketServer instance.
 *
 * Used by both the production `server.js` entry point and the Vite dev plugin.
 */
export function setupWebSocketServer(wss: WebSocketServer): void {
	wss.on('connection', (ws: WebSocket) => {
		connectionManager.addConnection(ws);

		let alive = true;

		ws.on('pong', () => {
			alive = true;
		});

		ws.on('close', () => {
			connectionManager.removeConnection(ws);
			clearInterval(heartbeatTimer);
		});

		ws.on('error', () => {
			connectionManager.removeConnection(ws);
			clearInterval(heartbeatTimer);
		});

		const heartbeatTimer = setInterval(() => {
			if (!alive) {
				ws.terminate();
				return;
			}
			alive = false;
			ws.ping();
		}, HEARTBEAT_INTERVAL);
	});
}

/**
 * Attach to a WebSocketServer stored on `globalThis.__wss` by the production
 * `server.js` entry point. Called from `hooks.server.ts` at startup.
 * In dev mode the Vite plugin calls `setupWebSocketServer` directly, so this
 * is a no-op.
 */
export function initWebSocket(): void {
	const wss = (globalThis as Record<string, unknown>).__wss as WebSocketServer | undefined;
	if (wss) {
		setupWebSocketServer(wss);
	}
}
