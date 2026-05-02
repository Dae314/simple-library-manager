import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { authService } from '$lib/server/services/auth.js';
import { validatePasswordInput, validatePasswordChangeInput } from '$lib/server/validation.js';

// --- Arbitraries ---

/** Non-empty, non-whitespace-only strings (bcrypt max input is 72 bytes) */
const nonWhitespaceString = fc
	.string({ minLength: 1, maxLength: 72 })
	.filter((s) => s.trim().length > 0);

/** Whitespace-only strings (including empty) */
const whitespaceOnlyString = fc.oneof(
	fc.constant(''),
	fc
		.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 })
		.map((chars) => chars.join(''))
);

/** Pairs of distinct non-empty strings */
const distinctStringPair = fc
	.tuple(nonWhitespaceString, nonWhitespaceString)
	.filter(([a, b]) => a !== b);

/**
 * Feature: management-password-protection, Property 1: Password hashing round-trip
 *
 * For any non-empty, non-whitespace password string, hashing it with `hashPassword`
 * and then verifying the original string against the hash with `verifyPassword`
 * SHALL return `true`.
 *
 * **Validates: Requirements 1.1, 1.3, 3.1**
 */
describe('Property 1: Password hashing round-trip', () => {
	it('hashing then verifying the same password returns true', async () => {
		await fc.assert(
			fc.asyncProperty(nonWhitespaceString, async (password) => {
				const hash = await authService.hashPassword(password);
				const result = await authService.verifyPassword(password, hash);
				expect(result).toBe(true);
			}),
			{ numRuns: 20 } // bcrypt is slow, keep runs low
		);
	});

	it('hash output is a valid bcrypt string', async () => {
		await fc.assert(
			fc.asyncProperty(nonWhitespaceString, async (password) => {
				const hash = await authService.hashPassword(password);
				expect(hash).toMatch(/^\$2[aby]?\$\d{2}\$.{53}$/);
			}),
			{ numRuns: 10 }
		);
	});
});


/**
 * Feature: management-password-protection, Property 2: Wrong password rejection
 *
 * For any two distinct non-empty password strings `p1` and `p2`, hashing `p1`
 * and then verifying `p2` against that hash SHALL return `false`.
 *
 * **Validates: Requirements 6.3, 7.4, 10.3**
 */
describe('Property 2: Wrong password rejection', () => {
	it('verifying a different password against a hash returns false', async () => {
		await fc.assert(
			fc.asyncProperty(distinctStringPair, async ([p1, p2]) => {
				const hash = await authService.hashPassword(p1);
				const result = await authService.verifyPassword(p2, hash);
				expect(result).toBe(false);
			}),
			{ numRuns: 10 } // bcrypt is slow
		);
	});
});

/**
 * Feature: management-password-protection, Property 3: Password confirmation mismatch rejection
 *
 * For any two distinct non-empty strings submitted as password and confirmation,
 * `validatePasswordInput` SHALL return `valid: false` with an error on the
 * confirmation field.
 *
 * **Validates: Requirements 3.2, 6.4**
 */
describe('Property 3: Password confirmation mismatch rejection', () => {
	it('rejects mismatched password and confirmation', () => {
		fc.assert(
			fc.property(distinctStringPair, ([password, confirmation]) => {
				const result = validatePasswordInput({ password, confirmation });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('confirmation');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects mismatched new password and confirmation in change input', () => {
		fc.assert(
			fc.property(
				nonWhitespaceString,
				distinctStringPair,
				(currentPassword, [newPassword, newPasswordConfirmation]) => {
					const result = validatePasswordChangeInput({
						currentPassword,
						newPassword,
						newPasswordConfirmation
					});
					expect(result.valid).toBe(false);
					expect(result.errors).toHaveProperty('newPasswordConfirmation');
					expect(result.data).toBeUndefined();
				}
			)
		);
	});
});

/**
 * Feature: management-password-protection, Property 4: Empty/whitespace password rejection
 *
 * For any string composed entirely of whitespace characters (including the empty string),
 * `validatePasswordInput` SHALL return `valid: false` with an error on the password field.
 *
 * **Validates: Requirements 3.3, 6.5**
 */
describe('Property 4: Empty/whitespace password rejection', () => {
	it('rejects empty or whitespace-only passwords', () => {
		fc.assert(
			fc.property(whitespaceOnlyString, (password) => {
				const result = validatePasswordInput({ password, confirmation: password });
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('password');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects empty or whitespace-only new passwords in change input', () => {
		fc.assert(
			fc.property(nonWhitespaceString, whitespaceOnlyString, (currentPassword, newPassword) => {
				const result = validatePasswordChangeInput({
					currentPassword,
					newPassword,
					newPasswordConfirmation: newPassword
				});
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('newPassword');
				expect(result.data).toBeUndefined();
			})
		);
	});

	it('rejects empty or whitespace-only current passwords in change input', () => {
		fc.assert(
			fc.property(whitespaceOnlyString, nonWhitespaceString, (currentPassword, newPassword) => {
				const result = validatePasswordChangeInput({
					currentPassword,
					newPassword,
					newPasswordConfirmation: newPassword
				});
				expect(result.valid).toBe(false);
				expect(result.errors).toHaveProperty('currentPassword');
				expect(result.data).toBeUndefined();
			})
		);
	});
});

/**
 * Feature: management-password-protection, Property 10: Valid password input acceptance
 *
 * For any non-empty, non-whitespace string `p`, calling
 * `validatePasswordInput({ password: p, confirmation: p })` SHALL return
 * `valid: true` with `data.password` equal to `p`.
 *
 * **Validates: Requirements 3.1, 6.2**
 */
describe('Property 10: Valid password input acceptance', () => {
	it('accepts matching non-empty, non-whitespace passwords', () => {
		fc.assert(
			fc.property(nonWhitespaceString, (password) => {
				const result = validatePasswordInput({ password, confirmation: password });
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
				expect(result.data).toBeDefined();
				expect(result.data!.password).toBe(password);
			})
		);
	});

	it('accepts valid password change input', () => {
		fc.assert(
			fc.property(nonWhitespaceString, nonWhitespaceString, (currentPassword, newPassword) => {
				const result = validatePasswordChangeInput({
					currentPassword,
					newPassword,
					newPasswordConfirmation: newPassword
				});
				expect(result.valid).toBe(true);
				expect(result.errors).toEqual({});
				expect(result.data).toBeDefined();
				expect(result.data!.currentPassword).toBe(currentPassword);
				expect(result.data!.newPassword).toBe(newPassword);
			})
		);
	});
});

/**
 * Feature: management-password-protection, Property 5: Session cookie creation sets expiry 30 minutes from now
 *
 * For any point in time, a session cookie created at that time SHALL contain
 * an expiry timestamp exactly 30 minutes (1,800,000 ms) in the future.
 *
 * **Validates: Requirements 5.1**
 */
describe('Property 5: Session cookie creation sets expiry 30 minutes from now', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('cookie expiry is 30 minutes from creation time', () => {
		const SESSION_DURATION_MS = 30 * 60 * 1000;

		fc.assert(
			fc.property(
				fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
				(now) => {
					vi.useFakeTimers({ now });
					const cookie = authService.createSessionCookie();
					vi.useRealTimers();

					const expiryStr = cookie.split('.')[0];
					const expiryMs = Number(expiryStr);
					expect(expiryMs).toBe(now + SESSION_DURATION_MS);
				}
			),
			{ numRuns: 100 }
		);
	});
});

/**
 * Feature: management-password-protection, Property 6: Expired sessions are rejected
 *
 * For any session cookie whose expiry timestamp is in the past,
 * `verifySessionCookie` SHALL return `false`.
 *
 * **Validates: Requirements 5.2**
 */
describe('Property 6: Expired sessions are rejected', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('rejects cookies with past expiry timestamps', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
				fc.integer({ min: 1, max: 100_000_000 }),
				(creationTime, elapsedExtra) => {
					// Create cookie at creationTime
					vi.useFakeTimers({ now: creationTime });
					const cookie = authService.createSessionCookie();
					vi.useRealTimers();

					// Advance time past expiry (30 min + extra)
					const SESSION_DURATION_MS = 30 * 60 * 1000;
					const futureTime = creationTime + SESSION_DURATION_MS + elapsedExtra;
					vi.useFakeTimers({ now: futureTime });
					const result = authService.verifySessionCookie(cookie);
					vi.useRealTimers();

					expect(result).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});
});

/**
 * Feature: management-password-protection, Property 7: HMAC tamper detection
 *
 * For any valid session cookie string, modifying any character in the cookie value
 * SHALL cause `verifySessionCookie` to return `false`.
 *
 * **Validates: Requirements 5.3, 5.4**
 */
describe('Property 7: HMAC tamper detection', () => {
	it('detects single-character mutations in the cookie', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 200 }),
				(posOffset) => {
					const cookie = authService.createSessionCookie();

					// Verify the original is valid
					expect(authService.verifySessionCookie(cookie)).toBe(true);

					// Pick a position to mutate
					const pos = posOffset % cookie.length;
					const originalChar = cookie[pos];

					// Replace with a different character
					const replacement = originalChar === 'a' ? 'b' : 'a';
					const tampered = cookie.substring(0, pos) + replacement + cookie.substring(pos + 1);

					// Tampered cookie should be rejected
					if (tampered !== cookie) {
						const result = authService.verifySessionCookie(tampered);
						expect(result).toBe(false);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('rejects completely random strings', () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 200 }), (randomStr) => {
				const result = authService.verifySessionCookie(randomStr);
				expect(result).toBe(false);
			}),
			{ numRuns: 100 }
		);
	});

	it('rejects empty string', () => {
		expect(authService.verifySessionCookie('')).toBe(false);
	});

	it('rejects string without dot separator', () => {
		expect(authService.verifySessionCookie('nodot')).toBe(false);
	});
});

/**
 * Feature: management-password-protection, Property 8: Rate limiter delay monotonicity
 *
 * For any two failure counts `a` and `b` where `a < b`, the rate limit delay
 * for `b` consecutive failures SHALL be greater than or equal to the delay for
 * `a` consecutive failures, and the delay for any count >= 1 SHALL be greater than 0.
 *
 * **Validates: Requirements 8.1, 8.2**
 */
describe('Property 8: Rate limiter delay monotonicity', () => {
	beforeEach(() => {
		// Reset rate limit state by resetting a known IP
		authService.resetRateLimit('test-mono');
	});

	it('delay is monotonically non-decreasing with failure count', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 20 }),
				fc.integer({ min: 1, max: 20 }),
				(a, bExtra) => {
					const b = a + bExtra; // ensure b > a
					const ip = `mono-${a}-${b}-${Math.random()}`;

					// Record `a` failures
					for (let i = 0; i < a; i++) {
						authService.recordFailedAttempt(ip);
					}
					const delayA = authService.getRateLimitDelay(ip);

					// Record more failures to reach `b` total
					for (let i = a; i < b; i++) {
						authService.recordFailedAttempt(ip);
					}
					const delayB = authService.getRateLimitDelay(ip);

					expect(delayA).toBeGreaterThan(0);
					expect(delayB).toBeGreaterThanOrEqual(delayA);

					// Clean up
					authService.resetRateLimit(ip);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('delay is capped at 5000ms', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 100 }), (attempts) => {
				const ip = `cap-${attempts}-${Math.random()}`;

				for (let i = 0; i < attempts; i++) {
					authService.recordFailedAttempt(ip);
				}
				const delay = authService.getRateLimitDelay(ip);

				expect(delay).toBeLessThanOrEqual(5000);
				expect(delay).toBeGreaterThan(0);

				authService.resetRateLimit(ip);
			}),
			{ numRuns: 100 }
		);
	});
});

/**
 * Feature: management-password-protection, Property 9: Rate limiter reset on success
 *
 * For any client IP with a positive failure count, calling `resetRateLimit`
 * SHALL result in `getRateLimitDelay` returning 0 for that IP.
 *
 * **Validates: Requirements 8.3**
 */
describe('Property 9: Rate limiter reset on success', () => {
	it('delay returns to 0 after reset', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 50 }), (attempts) => {
				const ip = `reset-${attempts}-${Math.random()}`;

				// Record failures
				for (let i = 0; i < attempts; i++) {
					authService.recordFailedAttempt(ip);
				}
				expect(authService.getRateLimitDelay(ip)).toBeGreaterThan(0);

				// Reset
				authService.resetRateLimit(ip);
				expect(authService.getRateLimitDelay(ip)).toBe(0);
			}),
			{ numRuns: 100 }
		);
	});
});
