<script lang="js">
	// @ts-nocheck
	/**
	 * Forum feed — /community/forum
	 */
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import {
		fetchFromRelays,
		fetchProfilesBatch,
		putEvents,
		publishToRelays,
		queryEvents,
		liveQuery,
		parseForumPost
	} from '$lib/nostr';
	import { parseProfile } from '$lib/nostr/models';
	import {
		EVENT_KINDS,
		ZAPSTORE_COMMUNITY_RELAY,
		ZAPSTORE_COMMUNITY_NPUB,
		FORUM_RELAY_OVERRIDE
	} from '$lib/config';
	import { getIsSignedIn, getCurrentPubkey, signEvent } from '$lib/stores/auth.svelte.js';
	import { getCached, setCached } from '$lib/stores/query-cache.js';
	import { goto } from '$app/navigation';
	import ForumPostCard from '$lib/components/ForumPostCard.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import CommunityBottomBar from '$lib/components/community/CommunityBottomBar.svelte';
	import ForumPostModal from '$lib/components/modals/ForumPostModal.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Label from '$lib/components/common/Label.svelte';
	import { ChevronDown } from '$lib/components/icons';
	import { wheelScroll } from '$lib/actions/wheelScroll.js';

	let { data = {} } = $props();

	const COMMUNITY_PUBKEY = (() => {
		try {
			const d = nip19.decode(ZAPSTORE_COMMUNITY_NPUB);
			return d.type === 'npub' ? d.data : '';
		} catch {
			return '';
		}
	})();

	const RELAYS = [FORUM_RELAY_OVERRIDE ?? ZAPSTORE_COMMUNITY_RELAY];

	const FORUM_CATEGORIES = [
		'General',
		'Dev Support',
		'User Support',
		'Feature Request',
		'Ideas',
		'Bugs',
		'Announcements',
		'News',
		'Showcase',
		'Off-Topic'
	];

	let selectedCategory = $state(/** @type {string | null} */ (null));
	// Initialize from cache so back navigation from post detail shows list immediately (apps pattern)
	let posts = $state(/** @type {any[]} */ (getCached('forum_posts') ?? []));
	let postsLoading = $state(false);
	let postsError = $state('');
	let feedProfiles = $state(/** @type {Map<string,any>} */ (new Map()));
	/** @type {Map<string, { profiles: any[], count: number }>} */
	let commentersByPostId = $state(new Map());
	let addPostModalOpen = $state(false);
	// Defer Dexie/liveQuery until after mount so first paint isn't blocked by DB
	let forumReady = $state(false);

	const isSignedIn = $derived(getIsSignedIn());

	const FORUM_FILTER = { kinds: [EVENT_KINDS.FORUM_POST], '#h': [COMMUNITY_PUBKEY], limit: 50 };

	const forumQuery = $derived(
		browser && COMMUNITY_PUBKEY && forumReady
			? liveQuery(async () => {
					const evs = await queryEvents(FORUM_FILTER);
					return evs
						.map((e) => {
							const p = parseForumPost(e);
							return p ? { ...p, _raw: e } : null;
						})
						.filter(Boolean)
						.sort((a, b) => b.createdAt - a.createdAt);
				})
			: null
	);

	/** Posts filtered by selected category — only posts with that label in their event */
	const filteredPosts = $derived(
		selectedCategory
			? posts.filter((p) => p.labels?.includes(selectedCategory))
			: posts
	);

	$effect(() => {
		if (!forumQuery) return;
		const sub = forumQuery.subscribe({
			next: (v) => {
				const list = v ?? [];
				posts = list;
				setCached('forum_posts', list);
			},
			error: (err) => {
				console.error('[Community] liveQuery error:', err);
				postsError = 'Failed to load posts.';
			}
		});
		return () => sub.unsubscribe();
	});

	async function syncForumFromRelay() {
		if (!COMMUNITY_PUBKEY || !browser) return;
		postsLoading = true;
		postsError = '';
		try {
			await fetchFromRelays(RELAYS, FORUM_FILTER, { timeout: 7000 });
		} catch (err) {
			console.error('[Community/Forum] relay sync failed', err);
			postsError = 'Failed to sync. Check your connection.';
		} finally {
			postsLoading = false;
		}
	}

	$effect(() => {
		if (!browser || posts.length === 0) return;
		const pks = [...new Set(posts.map((p) => p.pubkey))];
		const postIds = posts.map((p) => p.id);
		let cancelled = false;

		(async () => {
			const pEvs = await fetchProfilesBatch(pks, { timeout: 4000 });
			if (cancelled) return;
			const m = new Map();
			// fetchProfilesBatch returns Map<pubkey, event>
			for (const [pk, event] of pEvs) {
				try {
					m.set(pk, { ...parseProfile(event), content: event.content });
				} catch {
					/* skip */
				}
			}
			// Fetch missing profiles from forum relay (authors may only be there)
			const missing = pks.filter((pk) => !m.has(pk));
			if (missing.length > 0) {
				try {
					const fromForum = await fetchFromRelays(
						RELAYS,
						{ kinds: [0], authors: missing, limit: missing.length * 2 },
						{ timeout: 3000 }
					);
					for (const event of fromForum) {
						const pk = event.pubkey?.toLowerCase();
						if (pk && !m.has(pk)) {
							try {
								m.set(pk, { ...parseProfile(event), content: event.content });
							} catch {
								/* skip */
							}
						}
					}
				} catch {
					/* keep partial */
				}
			}
			feedProfiles = m;

			const [evsE, evsEUpper] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': postIds, limit: 500 }),
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': postIds, limit: 500 })
			]);
			if (cancelled) return;
			const byId = new Map();
			for (const e of [...evsE, ...evsEUpper]) {
				if (!byId.has(e.id)) byId.set(e.id, e);
			}
			const commentEvs = Array.from(byId.values());

			const byPost = new Map();
			for (const c of commentEvs) {
				const rootE = c.tags?.find((t) => t[0] === 'E')?.[1] ?? c.tags?.find((t) => t[0] === 'e')?.[1];
				if (!rootE) continue;
				if (!byPost.has(rootE)) byPost.set(rootE, { profiles: [], count: 0 });
				const entry = byPost.get(rootE);
				entry.count += 1;
				const pk = c.pubkey;
				if (!entry.profiles.some((p) => p.pubkey === pk)) {
					entry.profiles.push({ pubkey: pk, displayName: '', avatarUrl: '' });
				}
			}

			const allCommenterPks = [...new Set(commentEvs.map((e) => e.pubkey))];
			const commenterProfiles =
				allCommenterPks.length > 0 ? await fetchProfilesBatch(allCommenterPks, { timeout: 3000 }) : [];
			if (cancelled) return;
			const profileMap = new Map();
			for (const [pk, event] of commenterProfiles) {
				try {
					profileMap.set(pk, parseProfile(event));
				} catch {
					/* skip */
				}
			}
			for (const entry of byPost.values()) {
				entry.profiles = entry.profiles.map((r) => {
					const p = profileMap.get(r.pubkey);
					return {
						pubkey: r.pubkey,
						displayName: p?.displayName ?? p?.name ?? '',
						avatarUrl: p?.picture ?? ''
					};
				});
			}
			commentersByPostId = byPost;

			const [relayE, relayEUpper] = await Promise.all([
				fetchFromRelays(RELAYS, { kinds: [EVENT_KINDS.COMMENT], '#e': postIds, limit: 500 }, { timeout: 6000 }),
				fetchFromRelays(RELAYS, { kinds: [EVENT_KINDS.COMMENT], '#E': postIds, limit: 500 }, { timeout: 6000 })
			]);
			if (cancelled) return;
			const allRelay = [...relayE, ...relayEUpper];
			const newEvs = allRelay.filter((e) => !byId.has(e.id));
			if (newEvs.length > 0) {
				for (const c of newEvs) {
					const rootE = c.tags?.find((t) => t[0] === 'E')?.[1] ?? c.tags?.find((t) => t[0] === 'e')?.[1];
					if (!rootE) continue;
					if (!byPost.has(rootE)) byPost.set(rootE, { profiles: [], count: 0 });
					const entry = byPost.get(rootE);
					entry.count += 1;
					const pk = c.pubkey;
					if (!entry.profiles.some((p) => p.pubkey === pk)) {
						entry.profiles.push({ pubkey: pk, displayName: '', avatarUrl: '' });
					}
				}
				const extraPks = [...new Set(newEvs.map((e) => e.pubkey))].filter((pk) => !profileMap.has(pk));
				const extraProfiles = extraPks.length > 0 ? await fetchProfilesBatch(extraPks, { timeout: 3000 }) : [];
				for (const [pk, event] of extraProfiles) {
					try {
						profileMap.set(pk, parseProfile(event));
					} catch {
						/* skip */
					}
				}
				// Fetch any still-missing from forum relay
				const stillMissing = extraPks.filter((pk) => !profileMap.has(pk));
				if (stillMissing.length > 0) {
					try {
						const fromForum = await fetchFromRelays(
							RELAYS,
							{ kinds: [0], authors: stillMissing, limit: stillMissing.length * 2 },
							{ timeout: 2000 }
						);
						for (const event of fromForum) {
							const pk = event.pubkey?.toLowerCase();
							if (pk && !profileMap.has(pk)) {
								try {
									profileMap.set(pk, parseProfile(event));
								} catch {
									/* skip */
								}
							}
						}
					} catch {
						/* keep partial */
					}
				}
				for (const entry of byPost.values()) {
					entry.profiles = entry.profiles.map((r) => {
						const p = profileMap.get(r.pubkey);
						return {
							pubkey: r.pubkey,
							displayName: p?.displayName ?? p?.name ?? '',
							avatarUrl: p?.picture ?? ''
						};
					});
				}
				commentersByPostId = byPost;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	function openPost(post) {
		const nevent = post?.id ? (() => { try { return nip19.neventEncode({ id: post.id }); } catch { return ''; } })() : '';
		if (nevent) goto(`/community/forum/${nevent}`);
	}

	async function handleForumPostSubmit({ title, text, labels = [], emojiTags = [] }) {
		if (!isSignedIn) throw new Error('Sign in to post');
		const emojiTagEntries = (Array.isArray(emojiTags) ? emojiTags : [])
			.filter((e) => e?.shortcode && e?.url)
			.map((e) => ['emoji', e.shortcode, e.url]);
		const ev = await signEvent({
			kind: EVENT_KINDS.FORUM_POST,
			content: text,
			tags: [
				['h', COMMUNITY_PUBKEY],
				['title', title],
				...labels.map((l) => ['t', l]),
				...emojiTagEntries
			],
			created_at: Math.floor(Date.now() / 1000)
		});
		await putEvents([ev]);
		const parsed = parseForumPost(ev);
		if (parsed) {
			posts = [{ ...parsed, _raw: ev }, ...posts];
		}
		// Publish to forum relay (override or community relay) so others see the post
		publishToRelays(RELAYS, ev).catch((err) => console.error('[Community] Publish failed:', err));
		setTimeout(() => syncForumFromRelay(), 1200);
	}

	onMount(async () => {
		if (!browser) return;
		try {
			// Seed Dexie from load so liveQuery emits immediately (apps pattern)
			const seed = data?.seedEvents;
			if (Array.isArray(seed) && seed.length > 0) {
				await putEvents(seed).catch((err) => console.error('[Forum] seed putEvents failed:', err));
			}
			// Allow liveQuery to run (deferred so first paint isn't blocked)
			forumReady = true;
			// Background refresh from relay
			if (COMMUNITY_PUBKEY) syncForumFromRelay();
		} catch (err) {
			console.error('[Forum] onMount error:', err);
			postsError = err?.message ?? 'Failed to load forum';
		}
	});
</script>

<svelte:head>
	<title>Forum — Zapstore</title>
</svelte:head>

<div class="forum-page-wrap">
<div class="panel-content" class:has-bottom-bar={true}>
	<div class="forum-categories-wrap">
		<div class="forum-categories-scroll" use:wheelScroll>
			<div class="forum-categories-inner">
				{#each FORUM_CATEGORIES as category}
					<Label
						text={category}
						isSelected={selectedCategory === category}
						isEmphasized={false}
						onTap={() => {
							selectedCategory = selectedCategory === category ? null : category;
						}}
					/>
				{/each}
			</div>
		</div>
		<button
			type="button"
			class="forum-all-btn"
			class:selected={selectedCategory === null}
			onclick={() => {
				selectedCategory = null;
			}}
			aria-label="All categories"
		>
			<span>All</span>
			<span class="forum-all-btn-icon">
				<ChevronDown variant="outline" size={14} strokeWidth={1.4} color="hsl(var(--white33))" />
			</span>
		</button>
	</div>
	<div class="forum-list">
		{#if (!forumReady || postsLoading) && posts.length === 0}
			<div class="loading-wrap">
				<Spinner size={24} />
				<span>Loading posts…</span>
			</div>
		{:else if postsError}
			<div class="empty-state-wrap">
				<EmptyState message={postsError} minHeight={400} />
				<button type="button" class="btn-secondary-large" onclick={syncForumFromRelay}>Retry</button>
			</div>
		{:else if filteredPosts.length === 0}
			<div class="empty-state-wrap">
				<EmptyState
					message={selectedCategory ? `No posts in ${selectedCategory}` : 'No Forum Posts yet'}
					minHeight={280}
				/>
			</div>
		{:else}
			{#each filteredPosts as post (post.id)}
				{@const authorProfile = feedProfiles.get(post.pubkey)}
				{@const postCommenters = commentersByPostId.get(post.id)}
				{@const rawEv = post._raw}
				{@const emojiMap = rawEv?.tags
					? Object.fromEntries(
							rawEv.tags
								.filter((t) => t[0] === 'emoji' && t[1] && t[2])
								.map((t) => [t[1], t[2]])
						)
					: {}}
				<ForumPostCard
					author={{
						name: authorProfile?.displayName ?? authorProfile?.name,
						picture: authorProfile?.picture,
						npub: (() => {
							try {
								return nip19.npubEncode(post.pubkey);
							} catch {
								return '';
							}
						})()
					}}
					title={post.title}
					content={post.content}
					timestamp={post.createdAt}
					labels={post.labels ?? []}
					{emojiMap}
					commenters={postCommenters?.profiles ?? []}
					commentCount={postCommenters?.count ?? 0}
					onClick={() => openPost(post)}
				/>
			{/each}
		{/if}
	</div>
</div>

<CommunityBottomBar
	showFeedBar={true}
	selectedSection="forum"
	modalOpen={addPostModalOpen}
	onAdd={() => {
		addPostModalOpen = true;
	}}
	onSearch={() => {
		/* TODO */
	}}
/>

<ForumPostModal
	bind:isOpen={addPostModalOpen}
	communityName="Zapstore"
	{getCurrentPubkey}
	onsubmit={handleForumPostSubmit}
	onclose={() => {
		addPostModalOpen = false;
	}}
/>
</div>

<style>
	.forum-page-wrap {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		background: hsl(var(--background));
	}

	.panel-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-content.has-bottom-bar {
		overflow-y: auto;
		padding: 0 0 100px;
	}

	.forum-categories-wrap {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0;
		border-bottom: 1px solid hsl(var(--border));
	}

	.forum-categories-scroll {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-ms-overflow-style: none;
		-webkit-overflow-scrolling: touch;
		mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
		-webkit-mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
	}

	.forum-categories-scroll::-webkit-scrollbar {
		display: none;
	}

	.forum-categories-inner {
		display: flex;
		flex-wrap: nowrap;
		gap: 8px;
		padding: 12px 0 12px 16px;
		align-items: center;
	}

	.forum-all-btn {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 32px;
		padding: 0 12px 0 16px;
		margin-right: 16px;
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--white66));
		background: hsl(var(--white16));
		border: none;
		border-radius: 12px;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.forum-all-btn .forum-all-btn-icon {
		display: flex;
		align-items: center;
		padding-top: 2px;
	}

	.forum-all-btn:hover:not(.selected) {
		background: hsl(var(--white33));
		color: hsl(var(--white66));
	}

	.forum-all-btn.selected {
		background: hsl(var(--gray66));
		color: hsl(var(--white));
	}

	.forum-list {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: 0;
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

	.empty-state-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 40px 24px;
		flex: 1;
		min-height: 0;
	}

	.btn-secondary-large {
		padding: 10px 20px;
		font-size: 0.9375rem;
		font-weight: 500;
		border-radius: 12px;
		border: 1px solid hsl(var(--white33));
		background: transparent;
		color: hsl(var(--foreground));
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.btn-secondary-large:hover {
		background: hsl(var(--white8));
		border-color: hsl(var(--white66));
	}
</style>
