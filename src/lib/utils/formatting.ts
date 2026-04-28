// Client-side formatting utilities for dates, durations, and weights.
// All timestamps use server local time per Requirement 10.7.

/**
 * Format a Date or ISO string to a locale date string (e.g. "Jan 15, 2026").
 */
export function formatDate(date: Date | string | null | undefined): string {
	if (!date) return '—';
	const d = typeof date === 'string' ? new Date(date) : date;
	if (isNaN(d.getTime())) return '—';
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a Date or ISO string to a locale date+time string (e.g. "Jan 15, 2026, 3:42 PM").
 */
export function formatDateTime(date: Date | string | null | undefined): string {
	if (!date) return '—';
	const d = typeof date === 'string' ? new Date(date) : date;
	if (isNaN(d.getTime())) return '—';
	return d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * Examples: "2h 15m", "45m", "3d 1h 30m"
 */
export function formatDuration(ms: number): string {
	if (ms < 0) return '—';

	const totalMinutes = Math.floor(ms / 60_000);
	const days = Math.floor(totalMinutes / 1440);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	const minutes = totalMinutes % 60;

	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

	return parts.join(' ');
}

/**
 * Format a weight value with the given unit (e.g. "12.5 oz", "3.2 kg").
 */
export function formatWeight(weight: number | null | undefined, unit: string = 'oz'): string {
	if (weight == null) return '—';
	return `${weight.toFixed(1)} ${unit}`;
}
