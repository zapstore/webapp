<script lang="js">
/**
 * ForumPostDetail - Chateau-style forum post detail view.
 * Simpler than chateau: enforcing relay, all comments allowed, no filtering.
 */
import { browser } from '$app/environment';
import { nip19 } from 'nostr-tools';
import {
	queryEvents,
	queryEvent,
	liveQuery,
	fetchComments,
	fetchProfilesBatch,
	fetchZapsByEventIds,
	fetchZapReceiptsByPubkeys,
	fetchLabelEvents,
	parseForumPost,
	parseProfile,
	parseComment,
	parseZapReceipt,
	publishComment
} from '$lib/nostr';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import {
	EVENT_KINDS,
	ZAPSTORE_COMMUNITY_NPUB,
	DEFAULT_SOCIAL_RELAYS,
	COMMENT_PUBLISH_RELAYS,
	commentZapRelayReadSince
} from '$lib/config';
import { getIsSignedIn, getCurrentPubkey, signEvent } from '$lib/stores/auth.svelte.js';
import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
import SocialTabs from '$lib/components/social/SocialTabs.svelte';
import BottomBar from '$lib/components/social/BottomBar.svelte';
import EmptyState from '$lib/components/common/EmptyState.svelte';
import ShortTextContent from '$lib/components/common/ShortTextContent.svelte';
import MediaLightboxModal from '$lib/components/modals/MediaLightboxModal.svelte';

let {
	post: postProp = null,
	relays = [],
	onBack = () => {},
	getStartedModalOpen = $bindable(false),
	/** When set (e.g. from Activity ?comment=id), SocialTabs opens the thread modal that contains this comment */
	openCommentId = null
} = $props();

let post = $derived.by(() => postProp ? { ...postProp } : null);
let authorProfile = $state(null);
let comments = $state([]);
let commentsLoading = $state(false);
let commentsError = $state('');
let zaps = $state([]);
let zapsLoading = $state(false);
let profiles = $state({});
let profilesLoading = $state(false);
let zapperProfiles = $state(new Map());
let rawPostEvent = $derived(postProp?._raw ?? null);
let descriptionExpanded = $state(false);
let isTruncated = $state(false);
/** @type {Array<{ label: string, pubkeys: string[] }>} */
let labelEntries = $state([]);
let labelsLoading = $state(false);
/** Bumped when ActionsModal publishes/removes a label so the labels effect re-fetches */
let labelFetchNonce = $state(0);
let lightboxOpen = $state(false);
let lightboxUrls = $state([]);
let lightboxIndex = $state(0);

// ── Reactive comment list ──────────────────────────────────────────────────
// liveQuery re-fires whenever Dexie changes (e.g. new comment published from
// the Inbox or another tab), keeping the comment list current without a reload.
const commentQuery = $derived(
	browser && post?.id
		? liveQuery(async () => {
				const id = post.id;
				const [lo, hi] = await Promise.all([
					queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': [id], limit: 500 }),
					queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': [id], limit: 500 })
				]);
				const byId = new Map();
				for (const e of [...lo, ...hi]) if (e?.id) byId.set(e.id, e);
				return Array.from(byId.values()).sort((a, b) => a.created_at - b.created_at);
			})
		: null
);

$effect(() => {
	if (!commentQuery) return;
	const sub = commentQuery.subscribe({
		next: (evs) => {
			const all = evs ?? [];
			// Preserve in-flight optimistic comments (pending: true) until real events land.
			const realIds = new Set(all.map((e) => e.id));
			const optimistic = comments.filter((c) => c.pending && !realIds.has(c.id));
			const parsed = all.map((e) => {
				const c = parseComment(e);
				try { c.npub = nip19.npubEncode(e.pubkey); } catch { c.npub = ''; }
				return c;
			});
			comments = [...parsed, ...optimistic];
		}
	});
	return () => sub.unsubscribe();
});

const npub = $derived(post?.pubkey ? (() => { try { return nip19.npubEncode(post.pubkey); } catch { return ''; } })() : '');
const postNevent = $derived(post?.id ? (() => { try { return nip19.neventEncode({ id: post.id }); } catch { return ''; } })() : '');
const communityPubkey = $derived((() => {
	try {
		const d = nip19.decode(ZAPSTORE_COMMUNITY_NPUB);
		return d?.type === 'npub' ? d.data : '';
	} catch { return ''; }
})());
const zapTarget = $derived(
	post && communityPubkey
		? {
				name: post.title,
				pubkey: post.pubkey,
				id: post.id,
				pictureUrl: authorProfile?.picture,
				communityPubkey
			}
		: null
);
const publisherName = $derived(authorProfile?.displayName ?? authorProfile?.name ?? 'Author');
const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));
const catalogs = $derived(communityPubkey ? [{ name: 'Zapstore', pictureUrl: undefined, pubkey: communityPubkey }] : []);
const postEmojiTags = $derived(
	post?.emojiTags ?? (rawPostEvent?.tags ?? [])
		.filter((t) => t[0] === 'emoji' && t[1] && t[2])
		.map((t) => ({ shortcode: t[1], url: t[2] }))
);

function parseZapRows(events, postId) {
	const pid = String(postId ?? '').toLowerCase();
	const out = [];
	for (const ev of events ?? []) {
		if (!ev?.id) continue;
		try {
			const z = parseZapReceipt(ev);
			const topETag =
				ev.tags?.find((t) => (t[0] === 'e' || t[0] === 'E') && t[1])?.[1]?.toLowerCase() ?? '';
			const parsedTarget = String(z.zappedEventId ?? '').toLowerCase();
			// Accept either explicit receipt e/E tag or parsed description e tag.
			if (parsedTarget !== pid && topETag !== pid) continue;
			out.push({ ...z, id: ev.id });
		} catch {
			/* ignore malformed zap receipt */
		}
	}
	return out;
}

async function loadForumPostZaps(postId, postPubkey) {
	const pid = String(postId ?? '').toLowerCase();
	if (!pid) return [];
	const byId = new Map();
	const addEvents = (events) => {
		for (const z of parseZapRows(events, pid)) {
			if (!byId.has(z.id)) byId.set(z.id, z);
		}
	};

	// 1) Dexie local-first: strict e/E + recipient fallback filtered by parsed target.
	const [dexieByE, dexieByEUpper, dexieByP] = await Promise.all([
		queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#e': [pid], limit: 300 }),
		queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#E': [pid], limit: 300 }),
		postPubkey
			? queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#p': [postPubkey], limit: 500 })
			: Promise.resolve([])
	]);
	addEvents(dexieByE);
	addEvents(dexieByEUpper);
	addEvents(dexieByP);

	// 2) Relay by e/E reference (fast path).
	try {
		const byEventIds = await fetchZapsByEventIds([pid], { timeout: 5000 });
		addEvents(byEventIds);
	} catch {
		/* keep local results */
	}

	// 3) Relay by recipient pubkey fallback, then strict post-id filter via parser.
	if (postPubkey) {
		try {
			const byRecipient = await fetchZapReceiptsByPubkeys([postPubkey], { timeout: 6000, limit: 500 });
			addEvents(byRecipient);
		} catch {
			/* keep partial */
		}
	}

	return Array.from(byId.values()).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

$effect(() => {
	const p = postProp;
	if (!p?.id) return;
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

		// Comments: Dexie + relay in parallel — mirrors app page pattern.
		// fetchComments with eventId uses #K + #e / #E on Zapstore relay.
		const rs = commentZapRelayReadSince();
		const [relayEvs, dexieEvs] = await Promise.all([
			fetchComments(p.pubkey, null, { eventId: p.id, since: rs, timeout: 6000 }),
			queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': [p.id], limit: 500 })
		]);
		if (cancelled) return;
		const byId = new Map();
		for (const e of [...dexieEvs, ...relayEvs]) {
			if (e?.id) byId.set(e.id, e);
		}
		let evs = Array.from(byId.values()).sort((a, b) => a.created_at - b.created_at);
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
	const ppk = post?.pubkey;
	if (!pid) return;
	let cancelled = false;
	(async () => {
		zapsLoading = true;
		try {
			const parsedRows = await loadForumPostZaps(pid, ppk);
			if (cancelled) return;
			zaps = parsedRows;
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

// Labels: merge self-labels (t tags) with kind 1985 events from relay
$effect(() => {
	labelFetchNonce;
	const pid = post?.id;
	const postPubkey = post?.pubkey;
	const selfLabels = post?.labels ?? [];
	const cpk = communityPubkey;
	if (!pid || !cpk) {
		labelEntries = [];
		return;
	}
	labelsLoading = true;
	(async () => {
		try {
			/** @type {Map<string, Set<string>>} */
			const labelMap = new Map();
			for (const label of selfLabels) {
				if (!labelMap.has(label)) labelMap.set(label, new Set());
				if (postPubkey) labelMap.get(label)?.add(postPubkey);
			}
			const labelRelays = [...new Set([...(relays ?? []), ...DEFAULT_SOCIAL_RELAYS])];
			const labelEvents = await fetchLabelEvents(labelRelays, pid, cpk, { enforced: true });
			for (const ev of labelEvents) {
				const lTags = ev.tags.filter((t) => t[0] === 'l' && t[1]);
				for (const lt of lTags) {
					const lv = lt[1];
					if (!labelMap.has(lv)) labelMap.set(lv, new Set());
					labelMap.get(lv)?.add(ev.pubkey);
				}
			}
			const allLabelerPubkeys = [...new Set([...labelMap.values()].flatMap((s) => [...s]))];
			if (allLabelerPubkeys.length > 0) {
				const batch = await fetchProfilesBatch(allLabelerPubkeys, { timeout: 3000 });
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
			const entries = [...labelMap.entries()].map(([label, pubkeys]) => ({
				label,
				pubkeys: [...pubkeys]
			}));
			entries.sort((a, b) => {
				const aHasSelf = postPubkey ? a.pubkeys.includes(postPubkey) : false;
				const bHasSelf = postPubkey ? b.pubkeys.includes(postPubkey) : false;
				if (aHasSelf !== bHasSelf) return aHasSelf ? -1 : 1;
				return a.label.localeCompare(b.label);
			});
			labelEntries = entries;
		} catch (err) {
			console.error('[ForumPostDetail] Labels failed:', err);
		} finally {
			labelsLoading = false;
		}
	})();
});

async function handleCommentSubmit(e) {
	if (!post || !e?.text?.trim()) return;
	const target = { contentType: 'forum', pubkey: post.pubkey, id: post.id, kind: EVENT_KINDS.FORUM_POST };
	const userPubkey = getCurrentPubkey();
	const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	let optimisticAdded = false;
	if (userPubkey) {
		let npub = '';
		try {
			npub = nip19.npubEncode(userPubkey);
		} catch {
			npub = '';
		}
		comments = [
			...comments,
			{
				id: tempId,
				pubkey: userPubkey,
				content: e.text,
				contentHtml: '',
				emojiTags: e.emojiTags ?? [],
				mediaUrls: e.mediaUrls ?? [],
				createdAt: Math.floor(Date.now() / 1000),
				parentId: e.parentId ?? null,
				isReply: e.parentId != null,
				pending: true,
				npub
			}
		];
		optimisticAdded = true;
	}
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
			COMMENT_PUBLISH_RELAYS,
			e.mediaUrls ?? []
		);
		const parsed = parseComment(signed);
		parsed.npub = nip19.npubEncode(signed.pubkey);
		if (e.parentId) parsed.parentId = e.parentId;
		if (optimisticAdded) {
			comments = comments.filter((c) => c.id !== tempId);
		}
		comments = [...comments, parsed];
		// Ensure current user's profile is loaded so name/pic show on the new comment
		const myPk = signed.pubkey;
		if (myPk && !profiles[myPk]) {
			try {
				const existing = await queryEvent({ kinds: [0], authors: [myPk], limit: 1 });
				if (existing?.content) {
					const j = JSON.parse(existing.content);
					profiles = { ...profiles, [myPk]: { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture } };
				} else {
					const batch = await fetchProfilesBatch([myPk], { timeout: 3000 });
					const ev = batch.get(myPk);
					if (ev?.content) {
						const j = JSON.parse(ev.content);
						profiles = { ...profiles, [myPk]: { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture } };
					}
				}
			} catch (_) {}
		}
	} catch (err) {
		console.error('[ForumPostDetail] Comment failed:', err);
		if (optimisticAdded) {
			comments = comments.filter((c) => c.id !== tempId);
		}
		commentsError = err?.message ?? 'Failed to publish comment. Try again.';
	}
}

function refetchZaps() {
	if (!post?.id) return;
	loadForumPostZaps(post.id, post.pubkey).then((rows) => {
		zaps = rows;
	});
}
function handleForumZapPending(payload) {
	if (!payload?.tempId) return;
	const userPubkey = getCurrentPubkey();
	const optimistic = {
		id: payload.tempId,
		senderPubkey: userPubkey || undefined,
		amountSats: payload.amountSats,
		comment: payload.comment ?? '',
		emojiTags: payload.emojiTags ?? [],
		createdAt: Math.floor(Date.now() / 1000),
		zappedEventId: payload.zappedEventId,
		pending: true
	};
	zaps = [optimistic, ...zaps];
	if (userPubkey && profiles[userPubkey]) {
		const p = profiles[userPubkey];
		zapperProfiles.set(userPubkey, {
			displayName: p.displayName ?? p.name,
			name: p.name,
			picture: p.picture
		});
	}
}
function handleForumZapPendingClear(tempId) {
	if (!tempId) return;
	zaps = zaps.filter((z) => z.id !== tempId);
}
function handleForumBottomBarZap(event) {
	const { zapReceipt, pendingTempId } = event ?? {};
	if (pendingTempId) {
		zaps = zaps.filter((z) => z.id !== pendingTempId);
	}
	if (zapReceipt?.id) {
		const z = parseZapReceipt(zapReceipt);
		z.id = zapReceipt.id;
		const pid = String(z.id).toLowerCase();
		if (!zaps.some((x) => String(x.id).toLowerCase() === pid)) {
			zaps = [z, ...zaps];
		}
	}
	refetchZaps();
	setTimeout(refetchZaps, 2500);
}

/** @param {HTMLElement} node */
function checkTruncation(node) {
	const check = () => {
		isTruncated = node.scrollHeight > node.clientHeight;
	};
	setTimeout(check, 0);
	const ro = new ResizeObserver(() => {
		if (!descriptionExpanded) check();
	});
	ro.observe(node);
	return {
		destroy() {
			ro.disconnect();
		}
	};
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
				catalogText="Zapstore"
				showPublisher={true}
				showMenu={false}
				showBackButton={true}
				{onBack}
				scrollThreshold={undefined}
				compactPadding={true}
				catalogDisplayOnly={true}
				bind:getStartedModalOpen
			/>
		</div>

		<div class="content-scroll">
			<div class="content-inner">
				<h1 class="post-title">{post.title}</h1>
				<div class="description-container" class:expanded={descriptionExpanded}>
					<div class="post-description" use:checkTruncation>
						<ShortTextContent
							content={post.content ?? ''}
							emojiTags={postEmojiTags}
							mediaUrls={post.mediaUrls ?? []}
							onMediaClick={({ url: u, urls: list }) => {
								const urls = list?.length ? list : (post.mediaUrls ?? []);
								lightboxUrls = urls;
								lightboxIndex = Math.max(0, urls.indexOf(u));
								lightboxOpen = true;
							}}
							class="post-detail-body"
						/>
					</div>
					{#if isTruncated && !descriptionExpanded}
						<div class="description-fade" aria-hidden="true"></div>
						<button type="button" class="read-more-btn" onclick={() => (descriptionExpanded = true)}>
							Read more
						</button>
					{/if}
					{#if descriptionExpanded}
						<button type="button" class="show-less-btn" onclick={() => (descriptionExpanded = false)}>
							Show less
						</button>
					{/if}
				</div>

				<div class="social-tabs-wrap">
					<SocialTabs
						app={{}}
						mainEventIds={[post.id]}
						openCommentId={openCommentId}
						signEvent={signEvent}
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
							zappedEventId: z.zappedEventId ?? undefined,
							pending: z.pending === true
						}))}
						{zapsLoading}
						{zapperProfiles}
						{profiles}
						{profilesLoading}
						pubkeyToNpub={(pk) => (pk ? nip19.npubEncode(pk) : '')}
						{searchProfiles}
						{searchEmojis}
						onCommentSubmit={handleCommentSubmit}
						onZapPending={handleForumZapPending}
						onZapPendingClear={handleForumZapPendingClear}
						onZapReceived={handleForumBottomBarZap}
						onGetStarted={() => (getStartedModalOpen = true)}
						{labelEntries}
						{labelsLoading}
					/>
				</div>
			</div>
		</div>

	{#if post && zapTarget}
		<BottomBar
			publisherName={publisherName}
			contentType="forum"
			{zapTarget}
			otherZaps={[]}
			isSignedIn={getIsSignedIn()}
			isMember={true}
			onJoinRequired={() => {}}
			onGetStarted={() => { getStartedModalOpen = true; }}
			getCurrentPubkey={getCurrentPubkey}
			signEvent={signEvent}
			{searchProfiles}
			{searchEmojis}
			oncommentSubmit={handleCommentSubmit}
			onzapReceived={handleForumBottomBarZap}
			onZapPending={handleForumZapPending}
			onZapPendingClear={handleForumZapPendingClear}
			onoptions={() => {}}
			onLabelPublished={() => {
				labelFetchNonce += 1;
			}}
			onOwnContentDeleted={() => {
				goto(resolve('/community/forum'));
			}}
		/>
	{/if}
	{/if}
</div>

<MediaLightboxModal bind:isOpen={lightboxOpen} urls={lightboxUrls} initialIndex={lightboxIndex} />

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
		color: hsl(var(--white));
	}
	.description-container {
		position: relative;
		margin-bottom: 0.5rem;
	}
	.description-container:not(.expanded) .post-description {
		max-height: 420px;
		overflow: hidden;
	}
	.description-container.expanded .post-description {
		max-height: none;
	}
	.post-description {
		line-height: 1.6;
		color: hsl(var(--white));
		font-size: 0.9375rem;
	}
	.post-description :global(a) {
		color: hsl(var(--blurpleColor));
		text-decoration: underline;
	}
	.post-description :global(a:hover) {
		text-decoration-thickness: 2px;
	}
	.description-fade {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 100px;
		background: linear-gradient(to bottom, transparent, hsl(var(--black)));
		pointer-events: none;
	}
	.read-more-btn {
		position: absolute;
		bottom: 8px;
		left: 0;
		height: 32px;
		padding: 0 14px;
		background-color: hsl(var(--white8));
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: none;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		cursor: pointer;
		transition: transform 0.15s ease;
	}
	.read-more-btn:hover {
		transform: scale(1.025);
	}
	.read-more-btn:active {
		transform: scale(0.98);
	}
	.show-less-btn {
		display: inline-flex;
		margin-top: 8px;
		height: 32px;
		padding: 0 14px;
		background-color: hsl(var(--white8));
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: none;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		cursor: pointer;
		transition: transform 0.15s ease;
	}
	.show-less-btn:hover {
		color: hsl(var(--white));
		transform: scale(1.025);
	}
	.show-less-btn:active {
		transform: scale(0.98);
	}
	.social-tabs-wrap {
		margin-top: 16px;
	}
</style>
