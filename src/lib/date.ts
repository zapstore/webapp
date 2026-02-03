/**
 * Formats a date-like value into "Oct 3rd, 2025" by default
 * Accepts ISO strings, Date objects, milliseconds, or unix seconds
 */
export function formatDisplayDate(
	input: string | number | Date,
	options: { month?: 'short' | 'long'; includeOrdinal?: boolean } = {}
): string {
	const date = normalizeToDate(input);
	if (!date) return '';

	const monthStyle = options.month === 'long' ? 'long' : 'short';
	const month = monthStyle === 'long' ? LONG_MONTH_NAMES[date.getMonth()] : SHORT_MONTH_NAMES[date.getMonth()];
	const day = date.getDate();
	const year = date.getFullYear();
	const includeOrdinal = options.includeOrdinal !== false; // default true
	const dayPart = includeOrdinal ? `${day}${getOrdinalSuffix(day)}` : String(day);

	return `${month} ${dayPart}, ${year}`;
}

/**
 * Formats a unix timestamp (seconds) into display date
 */
export function formatTimestampSeconds(
	seconds: number,
	options: { month?: 'short' | 'long'; includeOrdinal?: boolean } = {}
): string {
	return formatDisplayDate(seconds, options);
}

function normalizeToDate(value: string | number | Date): Date | null {
	if (value instanceof Date) {
		return isNaN(value.getTime()) ? null : value;
	}

	if (typeof value === 'number') {
		// Heuristic: treat < 1e12 as unix seconds, otherwise milliseconds
		const ms = value < 1e12 ? value * 1000 : value;
		const d = new Date(ms);
		return isNaN(d.getTime()) ? null : d;
	}

	if (typeof value === 'string') {
		const d = new Date(value);
		return isNaN(d.getTime()) ? null : d;
	}

	return null;
}

function getOrdinalSuffix(n: number): string {
	const v = n % 100;
	if (v >= 11 && v <= 13) return 'th';
	switch (n % 10) {
		case 1:
			return 'st';
		case 2:
			return 'nd';
		case 3:
			return 'rd';
		default:
			return 'th';
	}
}

const SHORT_MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

const LONG_MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];
