import { WebSocket } from 'ws';
import type { EventMessage } from './events.js';

class ConnectionManager {
	private connections = new Set<WebSocket>();

	addConnection(ws: WebSocket): void {
		this.connections.add(ws);
	}

	removeConnection(ws: WebSocket): void {
		this.connections.delete(ws);
	}

	broadcast(event: EventMessage): void {
		const message = JSON.stringify(event);
		for (const ws of this.connections) {
			if (ws.readyState !== WebSocket.OPEN) {
				this.connections.delete(ws);
				continue;
			}
			try {
				ws.send(message);
			} catch {
				this.connections.delete(ws);
			}
		}
	}

	getConnectionCount(): number {
		return this.connections.size;
	}

	/** Reset all connections. For testing only. */
	_reset(): void {
		this.connections.clear();
	}
}

export const connectionManager = new ConnectionManager();
