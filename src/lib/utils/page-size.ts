const STORAGE_KEY = 'preferredPageSize';
const DEFAULT_PAGE_SIZE = 10;
const VALID_PAGE_SIZES = [10, 25, 50];

/**
 * Read the user's preferred page size from localStorage.
 * Returns the default if nothing is stored or the stored value is invalid.
 */
export function getPreferredPageSize(): number {
	if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = parseInt(stored, 10);
			if (VALID_PAGE_SIZES.includes(parsed)) return parsed;
		}
	} catch {
		// localStorage may be unavailable (private browsing, etc.)
	}
	return DEFAULT_PAGE_SIZE;
}

/**
 * Save the user's preferred page size to localStorage.
 */
export function savePreferredPageSize(size: number): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, String(size));
	} catch {
		// Silently ignore storage errors
	}
}
