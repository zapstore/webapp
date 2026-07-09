/** @typedef {'free' | 'community' | 'pro' | 'enterprise'} PricingTierId */

/** @type {number} */
export const COMMUNITY_STORAGE_INCLUDED_GB = 10;

/** @type {number} */
export const COMMUNITY_STORAGE_ADDON_USD_PER_GB = 0.75;

/** @type {number} */
export const PRO_STORAGE_INCLUDED_GB = 50;

/**
 * @typedef {{
 *   id: PricingTierId,
 *   name: string,
 *   nameAccent?: 'pro',
 *   priceLabel: string,
 *   priceSuffix?: string,
 *   priceMuted?: boolean,
 *   description: string,
 *   features: string[],
 *   ctaLabel: string,
 *   ctaHref?: string,
 *   ctaAction?: 'download' | 'link',
 *   ctaVariant?: 'primary' | 'secondary'
 * }} PricingTier
 */

/** @type {PricingTier[]} */
export const PRICING_TIERS = [
	{
		id: 'free',
		name: 'Free',
		priceLabel: '$0',
		priceSuffix: '/ month',
		description: 'Browse and use the open app catalog.',
		features: [
			'Browse the full app catalog',
			'Create your profile and follow stacks',
			'Join community discussions',
			'Search apps across relays'
		],
		ctaLabel: 'Download Zapstore',
		ctaAction: 'download',
		ctaVariant: 'secondary'
	},
	{
		id: 'community',
		name: 'Community',
		priceLabel: '$4.99',
		priceSuffix: '/ month',
		description: 'Community hosting with apps, forum, chat, and tasks.',
		features: [
			'Everything in Free',
			'Apps, forum, chat, and project management for your community',
			'Curated app stacks for your members',
			'Open standard, usable from other apps beyond Zapstore',
			`${COMMUNITY_STORAGE_INCLUDED_GB} GB storage included`,
			`Additional storage from $${COMMUNITY_STORAGE_ADDON_USD_PER_GB.toFixed(2)} / GB`
		],
		ctaLabel: 'Sign Up',
		ctaHref: '/community',
		ctaAction: 'link',
		ctaVariant: 'primary'
	},
	{
		id: 'pro',
		name: 'Pro',
		nameAccent: 'pro',
		priceLabel: '$49.90',
		priceSuffix: '/ month',
		description: 'Maximum apps via paid indexer, analytics, and support.',
		features: [
			'Paid indexer catalog with maximum apps, beyond builder-published releases',
			'Community server hosting included',
			'Publish and manage your apps',
			'Download and reach analytics',
			'Human developer and user support'
		],
		ctaLabel: 'Sign Up',
		ctaHref: '/developers',
		ctaAction: 'link',
		ctaVariant: 'primary'
	},
	{
		id: 'enterprise',
		name: 'Enterprise',
		priceLabel: 'Custom',
		priceMuted: true,
		description: 'Private catalogs and deployments for organizations.',
		features: [
			'Everything in Pro',
			'Private catalog under your brand',
			'Organization admin and SSO',
			'SLA and dedicated support',
			'Custom deployment options'
		],
		ctaLabel: 'Contact sales',
		ctaHref: '/enterprise',
		ctaAction: 'link',
		ctaVariant: 'secondary'
	}
];
