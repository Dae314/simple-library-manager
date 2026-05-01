import { invalidateAll } from '$app/navigation';
import type { EventMessage } from '$lib/server/ws/events.js';

// --- Page Classification ---

export const LIVE_UPDATE_PAGES = [
	'/checkout',
	'/checkin',
	'/catalog',
	'/management/games',
	'/management/transactions'
] as const;

export const STATIC_PAGES = [
	'/',
	'/statistics',
	'/management/config',
	'/management/backup',
	'/management/games/new'
] as const;

// --- Reconnection Delay ---

/**
 * Calculate the reconnection delay for a given attempt count.
 * Uses exponential backoff: min(1000 * 2^attempts, 30000).
 * Always returns at least 1000ms and never exceeds 30000ms.
 */
export function calculateReconnectDelay(attempts: number): number {
	return Math.min(1000 * Math.pow(2, attempts), 30000);
}

// --- Event Handler ---

export type EventAction = 'invalidate' | 'reload' | 'conflict' | 'ignore';

/**
 * Determine what action to take for an incoming event based on the current page.
 *
 * - full_resync on any page → 'reload'
 * - Static pages → 'ignore'
 * - Game edit page with matching gameId → 'conflict'
 * - Game edit page with non-matching gameId → 'invalidate'
 * - All other Live_Update_Pages → 'invalidate'
 * - Unknown pages → 'ignore'
 */
export function handleEvent(
	event: EventMessage,
	pathname: string,
	currentEditGameId?: number
): EventAction {
	// full_resync always triggers a full page reload regardless of page
	if (event.type === 'full_resync') {
		return 'reload';
	}

	// Static pages ignore all non-full_resync events
	if (isStaticPage(pathname)) {
		return 'ignore';
	}

	// Game edit page: check for conflict
	if (isGameEditPage(pathname)) {
		if (currentEditGameId !== undefined && hasGameId(event) && event.gameId === currentEditGameId) {
			return 'conflict';
		}
		return 'invalidate';
	}

	// Other live update pages
	if (isLiveUpdatePage(pathname)) {
		return 'invalidate';
	}

	// Unknown pages default to ignore
	return 'ignore';
}

function isStaticPage(pathname: string): boolean {
	return (STATIC_PAGES as readonly string[]).includes(pathname);
}

function isGameEditPage(pathname: string): boolean {
	// Matches /management/games/123 but not /management/games or /management/games/new
	return /^\/management\/games\/\d+$/.test(pathname);
}

function isLiveUpdatePage(pathname: string): boolean {
	// Check exact matches first
	if ((LIVE_UPDATE_PAGES as readonly string[]).includes(pathname)) {
		return true;
	}
	// Also match game edit pages /management/games/[id]
	if (isGameEditPage(pathname)) {
		return true;
	}
	return false;
}

function hasGameId(event: EventMessage): event is EventMessage & { gameId: number } {
	return 'gameId' in event && typeof (event as any).gameId === 'number';
}

// --- Debounce Utility ---

/**
 * Create a debounced version of invalidateAll.
 * Multiple calls within the window (default 300ms) are coalesced into a single call.
 * Returns an object with `trigger()` to schedule and `cancel()` to clear.
 */
export function createInvalidateDebouncer(windowMs: number = 300) {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let callCount = 0;

	function trigger(): void {
		if (timer !== null) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = null;
			callCount++;
			invalidateAll();
		}, windowMs);
	}

	function cancel(): void {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	function getCallCount(): number {
		return callCount;
	}

	function reset(): void {
		cancel();
		callCount = 0;
	}

	return { trigger, cancel, getCallCount, reset };
}

// --- WebSocket Client ---

export function createWebSocketClient() {
	let connected = $state(false);
	let ws: WebSocket | null = null;
	let reconnectAttempts = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let pingInterval: ReturnType<typeof setInterval> | null = null;

	const debouncer = createInvalidateDebouncer();

	// Callback for conflict events — set by the consuming page
	let onConflict: ((event: EventMessage) => void) | null = null;

	// Callback to get the current pathname
	let getPathname: (() => string) | null = null;

	// Callback to get the current edit game ID (for conflict detection)
	let getCurrentEditGameId: (() => number | undefined) | null = null;

	function connect(): void {
		if (typeof window === 'undefined') return;

		try {
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const url = `${protocol}//${window.location.host}/ws`;
			ws = new WebSocket(url);

			ws.onopen = () => {
				connected = true;
				const wasReconnect = reconnectAttempts > 0;
				reconnectAttempts = 0;

				// On reconnection, sync state — but only for live-update pages
				const pathname = getPathname?.() ?? window.location.pathname;
				if (!isStaticPage(pathname)) {
					invalidateAll().catch((err) => {
						console.warn('[ws] invalidateAll on reconnect failed:', err);
					});
				}
			};

			ws.onclose = () => {
				connected = false;
				ws = null;
				clearPingInterval();
				scheduleReconnect();
			};

			ws.onerror = () => {
				// The close event will fire after error, so reconnection is handled there.
				// Just log for debugging.
				console.warn('[ws] WebSocket error');
			};

			ws.onmessage = (messageEvent: MessageEvent) => {
				let event: EventMessage;
				try {
					event = JSON.parse(messageEvent.data);
				} catch {
					console.warn('[ws] Received invalid JSON, ignoring');
					return;
				}

				if (!event || typeof event.type !== 'string') {
					console.warn('[ws] Received message without type, ignoring');
					return;
				}

				const pathname = getPathname?.() ?? window.location.pathname;
				const editGameId = getCurrentEditGameId?.();
				const action = handleEvent(event, pathname, editGameId);

				switch (action) {
					case 'reload':
						window.location.reload();
						break;
					case 'conflict':
						onConflict?.(event);
						break;
					case 'invalidate':
						debouncer.trigger();
						break;
					case 'ignore':
						// Do nothing
						break;
				}
			};
		} catch (err) {
			console.warn('[ws] Failed to construct WebSocket:', err);
		}
	}

	function disconnect(): void {
		clearReconnectTimer();
		clearPingInterval();
		debouncer.cancel();

		if (ws) {
			// Remove handlers to prevent reconnection on intentional close
			ws.onclose = null;
			ws.onerror = null;
			ws.onmessage = null;
			ws.close();
			ws = null;
		}

		connected = false;
	}

	function scheduleReconnect(): void {
		clearReconnectTimer();
		const delay = calculateReconnectDelay(reconnectAttempts);
		reconnectAttempts++;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connect();
		}, delay);
	}

	function clearReconnectTimer(): void {
		if (reconnectTimer !== null) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	function clearPingInterval(): void {
		if (pingInterval !== null) {
			clearInterval(pingInterval);
			pingInterval = null;
		}
	}

	return {
		get connected() {
			return connected;
		},
		connect,
		disconnect,
		setOnConflict(handler: (event: EventMessage) => void) {
			onConflict = handler;
		},
		setGetPathname(fn: () => string) {
			getPathname = fn;
		},
		setGetCurrentEditGameId(fn: () => number | undefined) {
			getCurrentEditGameId = fn;
		}
	};
}
