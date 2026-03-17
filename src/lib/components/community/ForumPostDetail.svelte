<script lang="js">
/**
 * ForumPostDetail - Chateau-style forum post detail view.
 * Simpler than chateau: enforcing relay, all comments allowed, no filtering.
 */
import { nip19 } from 'nostr-tools';
import {
	queryEvents,
	queryEvent,
	fetchFromRelays,
	fetchProfilesBatch,
	fetchZapsByEventIds,
	parseForumPost,
	parseProfile,
	parseComment,
	parseZapReceipt,
	publishComment
} from '$lib/nostr';
import { EVENT_KINDS } from '$lib/config';
import { getIsSignedIn, getCurrentPubkey, signEvent } from '$lib/stores/auth.svelte.js';
import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
import SocialTabs from '$lib/components/social/SocialTabs.svelte';
import BottomBar from '$lib/components/social/BottomBar.svelte';
import EmptyState from '$lib/components/common/EmptyState.svelte';

let {
	post: postProp = null,
	relays = [],
	onBack = () => {},
	getStartedModalOpen = $bindable(false)
} = $props();

let post = $state(postProp ? { ...postProp } : null);
let authorProfile = $state(null);
let comments = $state([]);
let commentsLoading = $state(false);
let commentsError = $state('');
let zaps = $state([]);
let zapsLoading = $state(false);
let profiles = $state({});
let profilesLoading = $state(false);
let zapperProfiles = $state(new Map());
let rawPostEvent = $state(postProp?._raw ?? null);

const npub = $derived(post?.pubkey ? (() => { try { return nip19.npubEncode(post.pubkey); } catch { return ''; } })() : '');
const postNevent = $derived(post?.id ? (() => { try { return nip19.neventEncode({ id: post.id }); } catch { return ''; } })() : '');
const zapTarget = $derived(post ? { name: post.title, pubkey: post.pubkey, id: post.id, pictureUrl: authorProfile?.picture } : null);
const publisherName = $derived(authorProfile?.displayName ?? authorProfile?.name ?? 'Author');
const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));
const catalogs = $derived([{ name: 'Zapstore', pictureUrl: undefined, pubkey: '' }]);

$effect(() => {
	const p = postProp;
	if (!p?.id || !relays.length) return;
	post = { ...p };
	rawPostEvent = p._raw ?? null;
	commentsLoading = true;
	let cancelled = false;

	(async () => {
		// Author profile
		const authorEv = await queryEvent({ kinds: [0], authors: [p.pubkey], limit: 1 });
		if (cancelled) return;
		authorProfile = authorEv ? parseProfile(authorEv) : null;
		if (!authorEv && p.pubkey) {
			const batch = await fetchProfilesBatch([p.pubkey], { timeout: 3000 });
			if (cancelled) return;
			const ev = batch.get(p.pubkey);
			authorProfile = ev ? parseProfile(ev) : null;
		}

		// Comments: Dexie first, then relay (all allowed on enforcing relay)
		const [dexieE, dexieEUpper] = await Promise.all([
			queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': [p.id], limit: 200 }),
			queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': [p.id], limit: 200 })
		]);
		if (cancelled) return;
		const byId = new Map();
		for (const e of [...dexieE, ...dexieEUpper]) {
			if (!byId.has(e.id)) byId.set(e.id, e);
		}
		let evs = Array.from(byId.values()).sort((a, b) => a.created_at - b.created_at);

		const [relayE, relayEUpper] = await Promise.all([
			fetchFromRelays(relays, { kinds: [EVENT_KINDS.COMMENT], '#e': [p.id], limit: 200 }, { timeout: 6000 }),
			fetchFromRelays(relays, { kinds: [EVENT_KINDS.COMMENT], '#E': [p.id], limit: 200 }, { timeout: 6000 })
		]);
		if (cancelled) return;
		for (const e of [...relayE, ...relayEUpper]) {
			if (!byId.has(e.id)) {
				byId.set(e.id, e);
				evs.push(e);
			}
		}
		evs = evs.sort((a, b) => a.created_at - b.created_at);
		comments = evs.map((e) => {
			const c = parseComment(e);
			c.npub = nip19.npubEncode(e.pubkey);
			return c;
		});
		commentsLoading = false;
		commentsError = '';

		const pks = [...new Set(evs.map((e) => e.pubkey))];
		if (pks.length) {
			const batch = await fetchProfilesBatch(pks, { timeout: 3000 });
			if (cancelled) return;
			const next = { ...profiles };
			for (const [pk, ev] of batch) {
				if (ev?.content) {
					try {
						const j = JSON.parse(ev.content);
						next[pk] = { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture };
					} catch {}
				}
			}
			profiles = next;
		}
		profilesLoading = false;
	})();

	return () => { cancelled = true; };
});

$effect(() => {
	const pid = post?.id;
	if (!pid || !relays.length) return;
	let cancelled = false;
	(async () => {
		zapsLoading = true;
		try {
			const events = await fetchZapsByEventIds([pid], { relays, timeout: 5000 });
			if (cancelled) return;
			zaps = events.map((e) => {
				const z = parseZapReceipt(e);
				z.id = e.id;
				return z;
			});
			const senders = [...new Set(zaps.map((z) => z.senderPubkey).filter(Boolean))];
			const batch = await fetchProfilesBatch(senders, { timeout: 3000 });
			if (cancelled) return;
			const next = new Map(zapperProfiles);
			for (const pk of senders) {
				const ev = batch.get(pk);
				if (ev?.content) {
					try {
						const j = JSON.parse(ev.content);
						next.set(pk, { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture });
					} catch {}
				}
			}
			zapperProfiles = next;
		} catch (err) {
			console.error('[ForumPostDetail] Zaps failed:', err);
		} finally {
			if (!cancelled) zapsLoading = false;
		}
	})();
	return () => { cancelled = true; };
});

async function handleCommentSubmit(e) {
	if (!post || !e?.text?.trim()) return;
	const target = { contentType: 'forum', pubkey: post.pubkey, id: post.id, kind: EVENT_KINDS.FORUM_POST };
	try {
		const signed = await publishComment(
			e.text,
			target,
			signEvent,
			e.emojiTags ?? [],
			e.parentId ?? null,
			e.replyToPubkey ?? post.pubkey,
			e.parentId ? 1111 : EVENT_KINDS.FORUM_POST,
			e.mentions ?? [],
			relays
		);
		const parsed = parseComment(signed);
		parsed.npub = nip19.npubEncode(signed.pubkey);
		if (e.parentId) parsed.parentId = e.parentId;
		comments = [...comments, parsed];
	} catch (err) {
		console.error('[ForumPostDetail] Comment failed:', err);
	}
}

function refetchZaps() {
	if (!post?.id) return;
	fetchZapsByEventIds([post.id], { relays }).then((events) => {
		zaps = events.map((e) => {
			const z = parseZapReceipt(e);
			z.id = e.id;
			return z;
		});
	});
}
</script>

<div class="forum-post-detail">
	{#if !post && postProp}
		<EmptyState message="Loading…" minHeight={200} />
	{:else if !post}
		<EmptyState message="Post not found" minHeight={200} />
	{:else}
		<div class="detail-header-wrap">
			<DetailHeader
				publisherPic={authorProfile?.picture}
				{publisherName}
				publisherPubkey={post.pubkey}
				publisherUrl={npub ? `/profile/${npub}` : '#'}
				timestamp={post.createdAt}
				{catalogs}
				catalogText="Community"
				showPublisher={true}
				showMenu={false}
				showBackButton={true}
				{onBack}
				scrollThreshold={undefined}
				compactPadding={true}
				bind:getStartedModalOpen
			/>
		</div>

		<div class="content-scroll">
			<div class="content-inner">
				<h1 class="post-title">{post.title}</h1>
				{#if post.labels?.length}
					<div class="detail-labels">
						{#each post.labels as label}
							<span class="detail-label">{label}</span>
						{/each}
					</div>
				{/if}
				<div class="post-content">{post.content}</div>

				<div class="social-tabs-wrap">
					<SocialTabs
						app={{}}
						mainEventIds={[post.id]}
						showDetailsTab={true}
						detailsShareableId={postNevent}
						detailsPublicationLabel="Post"
						detailsNpub={npub}
						detailsPubkey={post.pubkey ?? ''}
						detailsRawData={rawPostEvent ? (() => { const c = { ...rawPostEvent }; delete c._tags; return c; })() : null}
						{comments}
						{commentsLoading}
						{commentsError}
						zaps={zaps.map((z) => ({
							id: z.id,
							senderPubkey: z.senderPubkey || undefined,
							amountSats: z.amountSats,
							createdAt: z.createdAt,
							comment: z.comment,
							emojiTags: z.emojiTags ?? [],
							zappedEventId: z.zappedEventId ?? undefined
						}))}
						{zapsLoading}
						{zapperProfiles}
						{profiles}
						{profilesLoading}
						pubkeyToNpub={(pk) => (pk ? nip19.npubEncode(pk) : '')}
						{searchProfiles}
						{searchEmojis}
						onCommentSubmit={handleCommentSubmit}
						onZapReceived={refetchZaps}
						onGetStarted={() => (getStartedModalOpen = true)}
						labelEntries={post.labels?.map((l) => ({ label: l, pubkeys: [post.pubkey] })) ?? []}
						labelsLoading={false}
					/>
				</div>
			</div>
		</div>

		{#if post && zapTarget && getIsSignedIn()}
			<BottomBar
				publisherName={publisherName}
				contentType="forum"
				{zapTarget}
				otherZaps={[]}
				isSignedIn={getIsSignedIn()}
				isMember={true}
				onJoinRequired={() => {}}
				onGetStarted={() => {}}
				{searchProfiles}
				{searchEmojis}
				oncommentSubmit={handleCommentSubmit}
				onzapReceived={refetchZaps}
				onoptions={() => {}}
			/>
		{/if}
	{/if}
</div>

<style>
	.forum-post-detail {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}
	.detail-header-wrap {
		flex-shrink: 0;
	}
	.content-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-top: 16px;
		padding-bottom: 120px;
	}
	.content-inner {
		padding: 0 16px 16px;
		max-width: 100%;
	}
	.post-title {
		font-size: 1.5rem;
		font-weight: 700;
		padding-top: 0;
		margin: 0 0 6px;
		line-height: 1.3;
		color: hsl(var(--foreground));
	}
	.detail-labels {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.detail-label {
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 2px 10px;
		border-radius: 99px;
		background: hsl(var(--primary) / 0.12);
		color: hsl(var(--primary));
	}
	.post-content {
		font-size: 0.9375rem;
		line-height: 1.7;
		color: hsl(var(--foreground) / 0.9);
		white-space: pre-wrap;
		word-break: break-word;
		margin-bottom: 16px;
	}
	.social-tabs-wrap {
		margin-top: 16px;
	}
</style>
