/** @typedef {{ titleWidthPx: number, profileNameWidthPx: number, descriptionLineWidthsPx: [number, number] }} AppSearchHitSkeletonPreset */

/** Four fixed skeleton layouts shared by SearchModal + /apps?q search. */
export const APP_SEARCH_HIT_SKELETON_PRESETS = /** @type {const} */ ([
	{ titleWidthPx: 104, profileNameWidthPx: 40, descriptionLineWidthsPx: [200, 132] },
	{ titleWidthPx: 120, profileNameWidthPx: 56, descriptionLineWidthsPx: [220, 120] },
	{ titleWidthPx: 96, profileNameWidthPx: 72, descriptionLineWidthsPx: [176, 108] },
	{ titleWidthPx: 112, profileNameWidthPx: 80, descriptionLineWidthsPx: [240, 148] }
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
