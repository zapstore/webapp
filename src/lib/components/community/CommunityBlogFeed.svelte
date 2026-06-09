<script lang="js">
	import { goto } from '$app/navigation';
	import { nip19 } from 'nostr-tools';
	import BlogPostCard from '$lib/components/community/BlogPostCard.svelte';
	import { createProfileQuery } from '$lib/purpleweb';
	import { ZAPSTORE_NPUB } from '$lib/config.js';
	import { profileNameForPic } from '$lib/utils/npub-display.js';

	/** @type {{ posts: { slug: string, title: string, summary: string, date: string | null, href: string, cardImage: string | null }[] }} */
	let { posts } = $props();

	const zapstorePubkey = /** @type {string} */ (nip19.decode(ZAPSTORE_NPUB).data);
	const profileQuery = createProfileQuery(() => zapstorePubkey);
	const authorProfile = $derived(profileQuery.profile);

	/** @param {string | null} date */
	function dateToTimestamp(date) {
		if (!date) return '';
		const parsed = new Date(date);
		if (Number.isNaN(parsed.getTime())) return '';
		return Math.floor(parsed.getTime() / 1000);
	}
</script>

<div class="forum-list-viewport" data-main-scroll>
	<div class="forum-list">
		{#if posts.length === 0}
			<p class="blog-feed-empty">No posts yet.</p>
		{:else}
			{#each posts as post (post.slug)}
				<BlogPostCard
					author={{
						name: profileNameForPic(authorProfile),
						displayName: authorProfile?.displayName,
						picture: authorProfile?.picture,
						pubkey: zapstorePubkey,
						npub: ZAPSTORE_NPUB
					}}
					title={post.title}
					summary={post.summary}
					cardImage={post.cardImage}
					timestamp={dateToTimestamp(post.date)}
					onClick={() => goto(post.href)}
				/>
			{/each}
		{/if}
	</div>
</div>

<style>
	.forum-list-viewport {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
	}

	.forum-list {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: 0;
	}

	.blog-feed-empty {
		padding: 2rem 16px;
		margin: 0;
		font-size: 0.9375rem;
		color: var(--white33);
		text-align: center;
	}
</style>
