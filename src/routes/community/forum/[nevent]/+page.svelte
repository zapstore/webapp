<script lang="js">
	// @ts-nocheck
	/**
	 * Forum post detail — /community/forum/[nevent] (apps-style: SSR seed, client Dexie/relay).
	 */
	import { page } from '$app/stores';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { nip19 } from 'nostr-tools';
	import { FORUM_RELAY } from '$lib/config';
	import { createForumPostQuery } from '$lib/purpleweb';
	import ForumPostDetail from '$lib/components/community/ForumPostDetail.svelte';
	import ForumPostDetailSkeleton from '$lib/components/community/ForumPostDetailSkeleton.svelte';

	let { data } = $props();

	const nevent = $derived($page.params.nevent ?? '');

	const eventId = $derived.by(() => {
		try {
			const d = nip19.decode(nevent);
			if (d.type === 'nevent') return d.data.id;
			if (d.type === 'note') return d.data;
		} catch {
			return '';
		}
		return '';
	});

	const RELAYS = [FORUM_RELAY];

	/** When set (from Activity ?comment=id), open the thread modal that contains this comment */
	const openCommentId = $derived($page.url.searchParams.get('comment') ?? null);

	// Local-first forum post via purpleweb. Owns Dexie liveQuery, SSR seed
	// persistence, and one-shot relay hydration from FORUM_RELAY.
	const detail = createForumPostQuery(() => ({
		eventId,
		seedPost: data?.post ?? null,
		seedEvents: data?.seedEvents ?? []
	}));
	const post = $derived(detail.post);
	const loading = $derived(!!eventId && !post && !detail.error);
	const notFound = $derived(!!detail.error);

	function onBack() {
		history.back();
	}
</script>

<SeoHead title="{post?.title ?? 'Post'} — Zapstore" />

{#if loading}
	<div class="panel-content panel-content-detail">
		<ForumPostDetailSkeleton />
	</div>
{:else if notFound}
	<div class="not-found-wrap">
		<p>Post not found.</p>
		<a href="/community/forum" class="back-link">← Back to Forum</a>
	</div>
{:else if post}
	<div class="panel-content panel-content-detail">
		<ForumPostDetail
			post={post}
			relays={RELAYS}
			{onBack}
			{openCommentId}
		/>
	</div>
{/if}

<style>
	.panel-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-content-detail {
		position: relative;
	}

	.not-found-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 60px 24px;
		color: var(--white66);
	}

	.back-link {
		color: var(--blurpleLightColor);
		font-weight: 500;
		text-decoration: none;
	}

	.back-link:hover {
		text-decoration: underline;
	}
</style>
