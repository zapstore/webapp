import {
	COMMUNITY_STORAGE_ADDON_USD_PER_GB,
	COMMUNITY_STORAGE_INCLUDED_GB,
	PRO_STORAGE_INCLUDED_GB
} from './pricing-tiers.js';

/** @typedef {import('./pricing-tiers.js').PricingTierId} PricingTierId */

/** @typedef {boolean | string} PricingCompareCell */

/**
 * @typedef {{
 *   label: string,
 *   values: Record<PricingTierId, PricingCompareCell>
 * }} PricingCompareRow
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   rows: PricingCompareRow[]
 * }} PricingCompareSection
 */

const communityStorageLabel = `${COMMUNITY_STORAGE_INCLUDED_GB} GB included`;
const communityStorageAddonLabel = `$${COMMUNITY_STORAGE_ADDON_USD_PER_GB.toFixed(2)} / GB add-on`;
const proStorageLabel = `${PRO_STORAGE_INCLUDED_GB} GB included`;

/** @type {PricingCompareSection[]} */
export const PRICING_COMPARISON_SECTIONS = [
	{
		id: 'catalog',
		title: 'Catalog & discovery',
		rows: [
			{
				label: 'Browse the app catalog',
				values: { free: true, community: true, pro: true, enterprise: true }
			},
			{
				label: 'Paid indexer catalog (reliable app updates)',
				values: { free: false, community: false, pro: true, enterprise: true }
			},
			{
				label: 'Create profile and follow stacks',
				values: { free: true, community: true, pro: true, enterprise: true }
			},
			{
				label: 'Relay search',
				values: { free: true, community: true, pro: true, enterprise: true }
			}
		]
	},
	{
		id: 'community-server',
		title: 'Community server',
		rows: [
			{
				label: 'Hosted community server',
				values: { free: false, community: true, pro: true, enterprise: true }
			},
			{
				label: 'Forums and discussions',
				values: { free: false, community: true, pro: true, enterprise: true }
			},
			{
				label: 'Project management (tasks)',
				values: { free: false, community: true, pro: true, enterprise: true }
			},
			{
				label: 'Public stack curation',
				values: { free: false, community: true, pro: true, enterprise: true }
			},
			{
				label: 'Interoperable with other communities',
				values: { free: false, community: true, pro: true, enterprise: true }
			},
			{
				label: 'Storage included',
				values: {
					free: 'No',
					community: communityStorageLabel,
					pro: proStorageLabel,
					enterprise: 'Custom'
				}
			},
			{
				label: 'Additional storage',
				values: {
					free: 'No',
					community: communityStorageAddonLabel,
					pro: communityStorageAddonLabel,
					enterprise: 'Custom'
				}
			}
		]
	},
	{
		id: 'publishing',
		title: 'Publishing & analytics',
		rows: [
			{
				label: 'Publish apps to the catalog',
				values: { free: false, community: false, pro: true, enterprise: true }
			},
			{
				label: 'Release and version management',
				values: { free: false, community: false, pro: true, enterprise: true }
			},
			{
				label: 'Download and reach analytics',
				values: { free: false, community: false, pro: true, enterprise: true }
			},
			{
				label: 'Verified developer badge',
				values: { free: false, community: false, pro: true, enterprise: true }
			}
		]
	},
	{
		id: 'support',
		title: 'Support',
		rows: [
			{
				label: 'Human developer and user support',
				values: { free: false, community: false, pro: true, enterprise: true }
			},
			{
				label: 'Private catalog deployment',
				values: { free: false, community: false, pro: false, enterprise: true }
			},
			{
				label: 'Organization admin and SSO',
				values: { free: false, community: false, pro: false, enterprise: true }
			},
			{
				label: 'SLA and dedicated support',
				values: { free: false, community: false, pro: false, enterprise: true }
			},
			{
				label: 'Custom branding and deployment',
				values: { free: false, community: false, pro: false, enterprise: true }
			}
		]
	}
];
