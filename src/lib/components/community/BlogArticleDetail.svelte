<script lang="js">
	import { page } from '$app/stores';
	import { nip19 } from 'nostr-tools';
	import { createProfileQuery } from '$lib/purpleweb';
	import { SITE_URL, ZAPSTORE_NPUB } from '$lib/config.js';
	import { profileDisplayLabel, profileNameForPic } from '$lib/utils/npub-display.js';
	import CommunityArticleShell from '$lib/components/community/CommunityArticleShell.svelte';
	import CommunityMarkdownBody from '$lib/components/community/CommunityMarkdownBody.svelte';
	import BlogDetailActions from '$lib/components/community/BlogDetailActions.svelte';

	let {
		title = '',
		body = '',
		publishedAt = null,
		cardImage = null
	} = $props();

	const zapstorePubkey = /** @type {string} */ (nip19.decode(ZAPSTORE_NPUB).data);
	const profileQuery = createProfileQuery(() => zapstorePubkey);
	const authorProfile = $derived(profileQuery.profile);
	const publisherName = $derived(
		profileDisplayLabel(
			{
				displayName: authorProfile?.displayName,
				name: authorProfile?.name
			},
			zapstorePubkey
		)
	);

	const articleTimestamp = $derived.by(() => {
		if (!publishedAt) return null;
		const parsed = new Date(String(publishedAt));
		if (Number.isNaN(parsed.getTime())) return null;
		return Math.floor(parsed.getTime() / 1000);
	});

	const shareUrl = $derived(`${SITE_URL}${$page.url.pathname}`);
</script>

<div class="blog-article-detail">
	<CommunityArticleShell
		publisherPic={authorProfile?.picture}
		{publisherName}
		publisherNameForPic={profileNameForPic(authorProfile)}
		publisherPubkey={zapstorePubkey}
		publisherUrl="/profile/{ZAPSTORE_NPUB}"
		timestamp={articleTimestamp}
	>
		{#snippet actions()}
			<BlogDetailActions shareUrl={shareUrl} {title} />
		{/snippet}

		{#snippet leading()}
			{#if cardImage}
				<div class="article-hero-wrap">
					<img class="article-hero-image" src={cardImage} alt="" loading="eager" />
				</div>
			{/if}
		{/snippet}

		{#snippet content()}
			<div class="title-block">
				<h1 class="post-title">{title}</h1>
				<div class="post-title-divider" aria-hidden="true"></div>
			</div>
			<div class="description-container">
				<CommunityMarkdownBody {body} />
			</div>
		{/snippet}
	</CommunityArticleShell>
</div>

<style>
	.blog-article-detail {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}

	.article-hero-wrap {
		width: 100%;
		aspect-ratio: 1.618 / 1;
		border-radius: 12px;
		border: 0.33px solid var(--white16);
		overflow: hidden;
		background: var(--gray33);
	}

	.article-hero-image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.title-block {
		margin-bottom: 4px;
	}

	.post-title {
		font-size: 1.5rem;
		font-weight: 700;
		padding: 0 var(--page-content-pad-x, 12px) 10px;
		margin: 0;
		line-height: 1.3;
		color: var(--white);
	}

	.post-title-divider {
		width: 100%;
		height: 1px;
		background: var(--shell-border);
		margin: 0 0 12px;
	}

	.description-container {
		margin-bottom: 0.5rem;
	}
</style>
