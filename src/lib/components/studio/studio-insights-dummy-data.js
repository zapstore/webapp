/**
 * Insights empty-state preview (30 days, both apps combined in headline totals).
 *
 * Intent: upward month, ~3 small irregular bumps (not waves, not pyramids, not symmetric).
 * — Hand-tuned daily totals, then scaled to 500 downloads / 10k impressions.
 * — Chart uses default smooth cubics (same as live Insights).
 */

const PREVIEW_DAY_COUNT = 30;
const PREVIEW_DOWNLOADS_TOTAL = 500;
const PREVIEW_IMPRESSIONS_TOTAL = 10_000;
const PREVIEW_ZAPS_TOTAL = 21_000;

/** @param {number[]} weights @param {number} targetTotal */
function scaleToTotal(weights, targetTotal) {
	const sum = weights.reduce((s, w) => s + w, 0);
	if (sum <= 0) return weights.map(() => 0);
	return weights.map((w) => Math.max(0, Math.round((w / sum) * targetTotal)));
}

/** @param {number[]} total */
function splitTotalAcrossApps(total, aShare = 0.56) {
	const a = [];
	const b = [];
	for (let i = 0; i < total.length; i++) {
		const v = total[i];
		if (v <= 0) {
			a.push(0);
			b.push(0);
			continue;
		}
		const drift = ((i * 5 + 2) % 7) / 100 - 0.03;
		const share = Math.min(0.68, Math.max(0.42, aShare + drift));
		const av = Math.min(v, Math.round(v * share));
		a.push(av);
		b.push(v - av);
	}
	return { a, b };
}

/**
 * Combined daily totals before scaling — irregular spacing, modest peaks (~15–25% above neighbors).
 * Downloads (~16/day average before scale).
 */
const DOWNLOAD_DAILY_TOTAL = [
	9, 10, 11, 12, 12, 13, 13, 14, 16, 13, 14, 14, 13, 13, 9, 11, 12, 13, 15, 16, 22, 17, 16, 17,
	18, 19, 20, 21, 22, 23
];

/**
 * Same rhythm, different numbers; scales to 10k.
 */
const IMPRESSION_DAILY_TOTAL = [
	180, 210, 240, 270, 285, 305, 315, 330, 395, 325, 340, 330, 320, 300, 230, 280, 300, 320, 350, 370,
	490, 390, 360, 365, 385, 405, 430, 455, 480, 500
];

/** Zaps: low start, lumpy climb; scaled to 21k. */
const ZAP_DAILY_TOTAL = [
	2, 3, 4, 5, 6, 8, 10, 11, 19, 10, 9, 8, 7, 7, 5, 7, 8, 10, 13, 15, 26, 17, 15, 16, 18, 21, 25, 30,
	34, 38
];

/** @typedef {{ id: string, name: string, icon: string, counts: number[] }} AppSeriesDatum */

/** @returns {AppSeriesDatum[]} */
function buildDownloads() {
	const total = scaleToTotal(DOWNLOAD_DAILY_TOTAL, PREVIEW_DOWNLOADS_TOTAL);
	const { a, b } = splitTotalAcrossApps(total, 0.56);
	return [
		{ id: 'preview-oslo', name: 'Oslo Notes', icon: '', counts: a },
		{ id: 'preview-nexus', name: 'Nexus Timer', icon: '', counts: b }
	];
}

/** @returns {AppSeriesDatum[]} */
function buildImpressions() {
	const total = scaleToTotal(IMPRESSION_DAILY_TOTAL, PREVIEW_IMPRESSIONS_TOTAL);
	const { a, b } = splitTotalAcrossApps(total, 0.53);
	return [
		{ id: 'preview-oslo-i', name: 'Oslo Notes', icon: '', counts: a },
		{ id: 'preview-nexus-i', name: 'Nexus Timer', icon: '', counts: b }
	];
}

/** @returns {AppSeriesDatum[]} */
function buildZaps() {
	const total = scaleToTotal(ZAP_DAILY_TOTAL, PREVIEW_ZAPS_TOTAL);
	const { a, b } = splitTotalAcrossApps(total, 0.56);
	return [
		{ id: 'preview-oslo-z', name: 'Oslo Notes', icon: '', counts: a },
		{ id: 'preview-nexus-z', name: 'Nexus Timer', icon: '', counts: b }
	];
}

/** @typedef {{ countryKey: string, label: string, impressions: number, downloads: number }} CountryDatum */

/** @returns {CountryDatum[]} */
export function studioInsightsDummyCountryRows() {
	return [
		{ countryKey: 'US', label: 'United States', impressions: 18420, downloads: 412 },
		{ countryKey: 'NL', label: 'Netherlands', impressions: 8320, downloads: 266 },
		{ countryKey: 'DE', label: 'Germany', impressions: 6120, downloads: 158 },
		{ countryKey: 'JP', label: 'Japan', impressions: 4280, downloads: 121 },
		{ countryKey: 'BR', label: 'Brazil', impressions: 3040, downloads: 94 }
	];
}

export const STUDIO_INSIGHTS_DUMMY_DAY_COUNT = PREVIEW_DAY_COUNT;

/** @returns {{ downloads: AppSeriesDatum[], zaps: AppSeriesDatum[], impressions: AppSeriesDatum[] }} */
export function studioInsightsDummyAppSeries() {
	return {
		downloads: buildDownloads(),
		zaps: buildZaps(),
		impressions: buildImpressions()
	};
}
