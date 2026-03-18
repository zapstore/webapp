<script lang="js">
	// @ts-nocheck
	/**
	 * Forum post detail — /community/forum/[nevent] (apps-style: SSR seed, client Dexie/relay).
	 */
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { queryEvent, fetchFromRelays, parseForumPost, putEvents } from '$lib/nostr';
	import {
		EVENT_KINDS,
		ZAPSTORE_COMMUNITY_NPUB,
		ZAPSTORE_COMMUNITY_RELAY,
		FORUM_RELAY_OVERRIDE
	} from '$lib/config';
	import ForumPostDetail from '$lib/components/community/ForumPostDetail.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';

	let { data } = $props();

	const nevent = $derived($page.params.nevent ?? '');

	const eventId = $derived.by(() => {
		try {
			const d = nip19.decode(nevent);
			if (d.type === 'nevent') return d.data.id;
			if (d.type === 'note') return d.data;
		} catch {}
		return '';
	});

	const COMMUNITY_PUBKEY = (() => {
		try {
			const d = nip19.decode(ZAPSTORE_COMMUNITY_NPUB);
			return d.type === 'npub' ? d.data : '';
		} catch {
			return '';
		}
	})();

	const RELAYS = [FORUM_RELAY_OVERRIDE ?? ZAPSTORE_COMMUNITY_RELAY];

	/** When set (from Activity ?comment=id), open the thread modal that contains this comment */
	const openCommentId = $derived($page.url.searchParams.get('comment') ?? null);

	const ssrPost = $derived(data?.post ?? null);
	let clientPost = $state(null);
	const post = $derived(clientPost ?? ssrPost);
	const loading = $derived(!!eventId && !post);
	let notFound = $state(false);

	async function loadPost() {
		const id = eventId;
		if (!browser || !id || !COMMUNITY_PUBKEY) return;

		notFound = false;
		clientPost = null;

		let ev = await queryEvent({
			kinds: [EVENT_KINDS.FORUM_POST],
			ids: [id],
			'#h': [COMMUNITY_PUBKEY]
		});

		if (!ev) {
			const [relayE, relayEUpper] = await Promise.all([
				fetchFromRelays(RELAYS, { kinds: [EVENT_KINDS.FORUM_POST], ids: [id], '#h': [COMMUNITY_PUBKEY], limit: 1 }, { timeout: 5000 }),
				fetchFromRelays(RELAYS, { kinds: [EVENT_KINDS.FORUM_POST], ids: [id], '#h': [COMMUNITY_PUBKEY], limit: 1 }, { timeout: 5000 })
			]);
			ev = relayE[0] ?? relayEUpper[0] ?? null;
		}

		if (ev) {
			const parsed = parseForumPost(ev);
			if (parsed) clientPost = { ...parsed, _raw: ev };
		} else {
			notFound = true;
		}
	}

	$effect(() => {
		eventId;
		if (browser && !ssrPost) loadPost();
	});

	onMount(async () => {
		if (!browser) return;
		if (data?.seedEvents?.length) {
			await putEvents(data.seedEvents).catch(() => {});
		}
		if (!ssrPost && eventId) loadPost();
	});

	function onBack() {
		history.back();
	}
</script>

<svelte:head>
	<title>{post?.title ?? 'Post'} — Zapstore</title>
</svelte:head>

{#if loading}
	<div class="loading-wrap">
		<Spinner size={24} />
		<span>Loading post…</span>
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

	.loading-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 60px 24px;
		color: hsl(var(--white33));
		font-size: 0.9375rem;
	}

	.not-found-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 60px 24px;
		color: hsl(var(--white66));
	}

	.back-link {
		color: hsl(var(--blurpleLightColor));
		font-weight: 500;
		text-decoration: none;
	}

	.back-link:hover {
		text-decoration: underline;
	}
</style>
