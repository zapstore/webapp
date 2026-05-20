/** @typedef {{ titleWidthPx: number, profileNameWidthPx: number, descriptionWidthPx: number }} AppSearchHitSkeletonPreset */

/** Four fixed skeleton layouts for /apps?q search results. */
export const APP_SEARCH_HIT_SKELETON_PRESETS = /** @type {const} */ ([
	{ titleWidthPx: 104, profileNameWidthPx: 40, descriptionWidthPx: 200 },
	{ titleWidthPx: 120, profileNameWidthPx: 56, descriptionWidthPx: 220 },
	{ titleWidthPx: 96, profileNameWidthPx: 72, descriptionWidthPx: 176 },
	{ titleWidthPx: 112, profileNameWidthPx: 80, descriptionWidthPx: 240 }
]);

export const APP_SEARCH_HIT_SKELETON_VARIANT_COUNT = APP_SEARCH_HIT_SKELETON_PRESETS.length;

/** Modal instant-search loading rows (one of each preset). */
export const SEARCH_PREVIEW_SKELETON_VARIANTS = APP_SEARCH_HIT_SKELETON_PRESETS.map((_, i) => i);

/** @param {number} variant */
export function appSearchHitSkeletonPreset(variant) {
	const idx =
		((variant % APP_SEARCH_HIT_SKELETON_VARIANT_COUNT) + APP_SEARCH_HIT_SKELETON_VARIANT_COUNT) %
		APP_SEARCH_HIT_SKELETON_VARIANT_COUNT;
	return APP_SEARCH_HIT_SKELETON_PRESETS[idx];
}
