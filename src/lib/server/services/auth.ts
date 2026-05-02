import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// --- Secret ---

const AUTH_SECRET: string = (() => {
	const envSecret = process.env.AUTH_SECRET;
	if (envSecret) {
		return envSecret;
	}
	console.warn(
		'[auth] AUTH_SECRET is not set. Generating a random secret. Sessions will not survive server restarts. ' +
			'Set AUTH_SECRET in your environment for session persistence.'
	);
	return crypto.randomBytes(32).toString('hex');
})();

// --- Rate Limit State ---

interface RateLimitEntry {
	attempts: number;
	lastAttempt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_DELAY_MS = 5000;

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

const BCRYPT_COST_FACTOR = 10;

// --- Auth Service ---

export const authService = {
	/**
	 * Hash a plaintext password using bcrypt with cost factor 10.
	 */
	async hashPassword(plaintext: string): Promise<string> {
		return bcrypt.hash(plaintext, BCRYPT_COST_FACTOR);
	},

	/**
	 * Verify a plaintext password against a bcrypt hash.
	 */
	async verifyPassword(plaintext: string, hash: string): Promise<boolean> {
		return bcrypt.compare(plaintext, hash);
	},

	/**
	 * Create a session cookie value.
	 * Format: `{expiryMs}.{hmacHex}`
	 * Expiry is set to 30 minutes from now.
	 */
	createSessionCookie(): string {
		const expiryMs = Date.now() + SESSION_DURATION_MS;
		const hmac = crypto.createHmac('sha256', AUTH_SECRET).update(String(expiryMs)).digest('hex');
		return `${expiryMs}.${hmac}`;
	},

	/**
	 * Verify a session cookie value.
	 * Checks HMAC signature and expiry timestamp.
	 */
	verifySessionCookie(cookieValue: string): boolean {
		try {
			if (!cookieValue) return false;

			const dotIndex = cookieValue.indexOf('.');
			if (dotIndex === -1) return false;

			const expiryStr = cookieValue.substring(0, dotIndex);
			const providedHmac = cookieValue.substring(dotIndex + 1);

			const expiryMs = Number(expiryStr);
			if (!Number.isFinite(expiryMs)) return false;

			// Check expiry
			if (expiryMs <= Date.now()) return false;

			// Verify HMAC
			const expectedHmac = crypto.createHmac('sha256', AUTH_SECRET).update(expiryStr).digest('hex');

			const providedBuf = Buffer.from(providedHmac, 'hex');
			const expectedBuf = Buffer.from(expectedHmac, 'hex');

			if (providedBuf.length !== expectedBuf.length) return false;

			return crypto.timingSafeEqual(providedBuf, expectedBuf);
		} catch {
			return false;
		}
	},

	/**
	 * Get the rate limit delay in milliseconds for a client IP.
	 * Returns 0 if no failed attempts are recorded or the entry has expired.
	 * Formula: min(attempts * 1000, 5000) ms.
	 */
	getRateLimitDelay(clientIp: string): number {
		const entry = rateLimitMap.get(clientIp);
		if (!entry) return 0;

		// Expire entries after 15 minutes of inactivity
		if (Date.now() - entry.lastAttempt > RATE_LIMIT_EXPIRY_MS) {
			rateLimitMap.delete(clientIp);
			return 0;
		}

		return Math.min(entry.attempts * 1000, RATE_LIMIT_MAX_DELAY_MS);
	},

	/**
	 * Record a failed password attempt for a client IP.
	 */
	recordFailedAttempt(clientIp: string): void {
		const entry = rateLimitMap.get(clientIp);
		if (entry) {
			entry.attempts += 1;
			entry.lastAttempt = Date.now();
		} else {
			rateLimitMap.set(clientIp, { attempts: 1, lastAttempt: Date.now() });
		}
	},

	/**
	 * Reset the rate limit counter for a client IP (called on successful auth).
	 */
	resetRateLimit(clientIp: string): void {
		rateLimitMap.delete(clientIp);
	}
};
