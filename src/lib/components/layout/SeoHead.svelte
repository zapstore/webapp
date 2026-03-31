<script lang="js">
import { page } from '$app/stores';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_ICON, SITE_TWITTER } from '$lib/config';

/**
 * @typedef {Object} Props
 * @property {string} [title]
 * @property {string} [description]
 * @property {string | null} [image]
 * @property {string} [url]         - canonical URL; defaults to current page URL
 * @property {string} [type]        - og:type
 * @property {object | null} [jsonld]
 * @property {string} [author]      - for blog/article pages
 * @property {string} [publishedTime] - ISO date for article:published_time
 */

/** @type {Props} */
let {
	title = SITE_NAME,
	description = SITE_DESCRIPTION,
	image = SITE_ICON,
	url = undefined,
	type = 'website',
	jsonld = null,
	author = undefined,
	publishedTime = undefined
} = $props();

const canonicalUrl = $derived(url ?? (SITE_URL + $page.url.pathname));
const twitterCard = $derived(image ? 'summary_large_image' : 'summary');
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonicalUrl} />

	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:type" content={type} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	{#if image}
		<meta property="og:image" content={image} />
	{/if}

	<meta name="twitter:card" content={twitterCard} />
	<meta name="twitter:site" content={SITE_TWITTER} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	{#if image}
		<meta name="twitter:image" content={image} />
	{/if}

	{#if author}
		<meta name="author" content={author} />
	{/if}
	{#if publishedTime}
		<meta name="article:published_time" content={publishedTime} />
	{/if}

	{#if jsonld}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html `<script type="application/ld+json">${JSON.stringify(jsonld)}</` + `script>`}
	{/if}
</svelte:head>
