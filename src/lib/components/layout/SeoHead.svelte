<script lang="js">
import { page } from '$app/stores';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_ICON, SITE_TWITTER } from '$lib/config';

/**
 * @typedef {Object} Props
 * @property {string} [title]
 * @property {string} [description]
 * @property {string | null} [image]
 * @property {string} [imageAlt]    - alt text for og:image
 * @property {number} [imageWidth]  - og:image:width (omit if unknown)
 * @property {number} [imageHeight] - og:image:height (omit if unknown)
 * @property {string} [url]         - canonical URL; defaults to current page URL
 * @property {string} [type]        - og:type
 * @property {object | null} [jsonld]
 * @property {string} [author]      - author name for blog/article pages or app developer
 * @property {string} [authorUrl]   - link to author's profile page
 * @property {string} [publishedTime] - ISO date for article:published_time
 */

/** @type {Props} */
let {
	title = SITE_NAME,
	description = SITE_DESCRIPTION,
	image = SITE_ICON,
	imageAlt = undefined,
	imageWidth = undefined,
	imageHeight = undefined,
	url = undefined,
	type = 'website',
	jsonld = null,
	author = undefined,
	authorUrl = undefined,
	publishedTime = undefined
} = $props();

const canonicalUrl = $derived(url ?? (SITE_URL + $page.url.pathname));
const twitterCard = $derived(image ? 'summary_large_image' : 'summary');
// Escape `<` so serialized JSON cannot close the JSON-LD script block early (breaks DOM + hydration).
const jsonldText = $derived(
	jsonld ? JSON.stringify(jsonld).replace(/</g, '\\u003c') : ''
);
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
		{#if imageAlt}
			<meta property="og:image:alt" content={imageAlt} />
		{/if}
		{#if imageWidth}
			<meta property="og:image:width" content={String(imageWidth)} />
		{/if}
		{#if imageHeight}
			<meta property="og:image:height" content={String(imageHeight)} />
		{/if}
	{/if}

	<meta name="twitter:card" content={twitterCard} />
	<meta name="twitter:site" content={SITE_TWITTER} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	{#if image}
		<meta name="twitter:image" content={image} />
		{#if imageAlt}
			<meta name="twitter:image:alt" content={imageAlt} />
		{/if}
	{/if}

	{#if author}
		<meta name="author" content={author} />
		{#if authorUrl}
			<link rel="author" href={authorUrl} />
		{/if}
	{/if}
	{#if publishedTime}
		<meta name="article:published_time" content={publishedTime} />
	{/if}

	{#if jsonld}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html '<script type="application/ld+json">' + jsonldText + '</' + 'script>'}
	{/if}
</svelte:head>
