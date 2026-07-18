<script lang="js">
	/**
	 * Community forum search — full page with apps-style search field and card results.
	 */
	import { onMount } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { browser } from '$app/environment';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import { Search } from 'lucide-svelte';
	import { ChevronDown } from '$lib/components/icons';
	import { nip19 } from 'nostr-tools';
	import {
		EVENT_KINDS,
		ZAPSTORE_COMMUNITY_NPUB,
		ZAPSTORE_COMMUNITY_PUBKEY,
		COMMENT_PUBLISH_RELAYS,
		FORUM_RELAY,
		ZAPSTORE_RELAY,
		PROFILE_FETCH_RELAYS
	} from '$lib/config';
	import { isOnline } from '$lib/stores/online.svelte.js';
	import {
		parseForumPost,
		parseProfile,
		parseApp,
		parseAppStack,
		getEventOneliner
	} from '$lib/nostr/models';
	import {
		queryEvents,
		queryEvent,
		fetchProfilesBatch,
		parseZapReceipt,
		parseComment,
		publishComment,
		putEvents,
		queryProfilesForPubkeys,
		hydrateFilters,
		liveQuery
	} from '$lib/purpleweb';
	import { profileDisplayLabel, profileNameForPic } from '$lib/utils/npub-display.js';
	import { signEvent, getCurrentPubkey } from '$lib/stores/auth.svelte.js';
	import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
	import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
	import DropdownMenu from '$lib/components/common/DropdownMenu.svelte';
	import RootComment from '$lib/components/social/RootComment.svelte';
	import {
		resolveForumDiscussionRootCommentId,
		resolveAppDiscussionRootCommentId,
		collectCommentSubtree,
		walkAppDiscussionRootInMap
	} from '$lib/nostr/thread-discussion.js';
	import {
		runForumSearchLocal,
		runForumSearchRelay,
		safeForumNevent
	} from '$lib/community/forum-search.js';
	import ForumPostCard from '$lib/components/ForumPostCard.svelte';
	import CommentCard from '$lib/components/community/CommentCard.svelte';
	import ForumFeedSkeleton from '$lib/components/community/ForumFeedSkeleton.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	const COMMUNITY_PUBKEY = (() => {
		try {
			const d = nip19.decode(ZAPSTORE_COMMUNITY_NPUB);
			return d.type === 'npub' ? d.data : '';
		} catch {
			return '';
		}
	})();

	const SEARCH_DEBOUNCE_MS = 280;
	const SEARCH_URL_SYNC_DEBOUNCE_MS = 400;
	const SEARCH_PROFILE_RELAYS = [FORUM_RELAY, ZAPSTORE_RELAY];

	const searchQ = $derived($page.url.searchParams.get('q')?.trim() ?? '');

	let searchBarValue = $state('');
	let searchInputEl = $state(/** @type {HTMLInputElement | null} */ (null));
	let searchLoading = $state(false);
	let relaySearchLoading = $state(false);
	/** @type {import('$lib/community/forum-search.js').ForumSearchResult[]} */
	let searchResults = $state([]);
	/** @type {Map<string, { displayName?: string, name?: string, picture?: string, pubkey?: string }>} */
	let profilesByPubkey = new SvelteMap();
	let parentByCommentId = new SvelteMap();
	let parentAuthorByCommentId = new SvelteMap();
	let parentZapParsedByCommentId = new SvelteMap();
	let parentZapperAuthorByCommentId = new SvelteMap();
	let urlSyncGen = 0;
	let filterDropdownOpen = $state(false);
	let filterDropdownWrap = $state(/** @type {HTMLDivElement | null} */ (null));
	/** @type {'all' | 'posts' | 'comments'} */
	let resultFilter = $state('all');
	let threadOpenNonce = $state(0);
	let threadModalComments = $state(/** @type {any[]} */ ([]));
	let threadModalRootEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let threadModalContext = $state(/** @type {Record<string, unknown> | null} */ (null));
	/** Forum post id/pubkey for thread replies; null for app/stack (use threadModalAddrATag). */
	let threadModalForumPost = $state(/** @type {{ id: string, pubkey: string } | null} */ (null));
	let threadModalAddrATag = $state(/** @type {string | null} */ (null));
	let threadModalExpandCommentId = $state(/** @type {string | null} */ (null));
	let initialReplyTargetForModal = $state(/** @type {any} */ (null));
	/** @type {Map<string, { displayName?: string, name?: string, picture?: string | null }>} */
	let threadProfiles = new SvelteMap();
	let threadOpenReply = $state(false);
	let threadOpenActions = $state(false);
	let threadLoadGen = 0;

	function replaceMap(target, source) {
		target.clear();
		for (const [key, value] of source) target.set(key, value);
	}

	const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
	const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));

	const activeSearchQuery = $derived(searchBarValue.trim());
	const hasQuery = $derived(activeSearchQuery.length > 0);
	const showSearchSkeleton = $derived(hasQuery && searchLoading && searchResults.length === 0);
	const filteredSearchResults = $derived.by(() => {
		if (resultFilter === 'all') return searchResults;
		const want = resultFilter === 'posts' ? 'post' : 'comment';
		return searchResults.filter((r) => r.type === want);
	});
	const filterLabel = $derived(
		resultFilter === 'all' ? 'All results' : resultFilter === 'posts' ? 'Posts' : 'Comments'
	);

	const searchProfilesQuery = $derived(
		browser && hasQuery && filteredSearchResults.length > 0
			? liveQuery(async () => {
					const pubkeys = [
						...new Set(
							filteredSearchResults.map((r) => r.event.pubkey).filter(Boolean)
						)
					];
					return queryProfilesForPubkeys(pubkeys);
				})
			: null
	);

	$effect(() => {
		if (!browser) return;
		const typed = searchBarValue.trim();
		if (typed === searchQ) return;

		const gen = ++urlSyncGen;
		const timer = window.setTimeout(() => {
			if (gen !== urlSyncGen) return;
			const current = searchBarValue.trim();
			if (current !== typed) return;

			const url = new URL($page.url);
			if (typed) url.searchParams.set('q', typed);
			else url.searchParams.delete('q');
			const next = url.pathname + url.search;
			if (next === $page.url.pathname + $page.url.search) return;
			replaceState(next, {});
		}, SEARCH_URL_SYNC_DEBOUNCE_MS);

		return () => clearTimeout(timer);
	});

	$effect(() => {
		const q = activeSearchQuery;
		if (!browser || !COMMUNITY_PUBKEY) {
			searchResults = [];
			searchLoading = false;
			relaySearchLoading = false;
			return;
		}
		if (!q) {
			searchResults = [];
			searchLoading = false;
			relaySearchLoading = false;
			profilesByPubkey.clear();
			return;
		}

		// Start loading immediately to avoid a "No results found" flash during debounce.
		searchLoading = true;
		relaySearchLoading = true;
		searchResults = [];

		const controller = new AbortController();
		const debounceTimer = setTimeout(() => {
			(async () => {
				try {
					const { results } = await runForumSearchLocal(
						q,
						COMMUNITY_PUBKEY,
						controller.signal,
						{ postLimit: 200, commentLimit: 200 }
					);
					if (!controller.signal.aborted) {
						searchResults = results;
					}
				} catch {
					if (!controller.signal.aborted) searchResults = [];
				} finally {
					if (!controller.signal.aborted) searchLoading = false;
				}
			})();

			(async () => {
				try {
					await runForumSearchRelay(q, COMMUNITY_PUBKEY, controller.signal);
					if (!controller.signal.aborted) {
						const { results } = await runForumSearchLocal(
							q,
							COMMUNITY_PUBKEY,
							controller.signal,
							{ postLimit: 400, commentLimit: 400 }
						);
						searchResults = results;
					}
				} catch {
					/* relay failure — keep local results */
				} finally {
					if (!controller.signal.aborted) relaySearchLoading = false;
				}
			})();
		}, SEARCH_DEBOUNCE_MS);

		return () => {
			clearTimeout(debounceTimer);
			controller.abort();
		};
	});

	$effect(() => {
		if (!browser || !hasQuery) {
			parentByCommentId.clear();
			parentAuthorByCommentId.clear();
			parentZapParsedByCommentId.clear();
			parentZapperAuthorByCommentId.clear();
			return;
		}

		const commentRows = filteredSearchResults.filter((r) => r.type === 'comment');
		if (commentRows.length === 0) {
			parentByCommentId.clear();
			parentAuthorByCommentId.clear();
			parentZapParsedByCommentId.clear();
			parentZapperAuthorByCommentId.clear();
			return;
		}

		let cancelled = false;
		(async () => {
			const parentIds = [];
			for (const row of commentRows) {
				const rootId = row.event.tags?.find((t) => t[0] === 'E' && t[1])?.[1]?.toLowerCase();
				const parentId = row.event.tags?.find((t) => t[0] === 'e' && t[1])?.[1]?.toLowerCase();
				if (parentId && parentId !== rootId) parentIds.push(parentId);
			}
			const uniqParentIds = [...new Set(parentIds)];
			if (uniqParentIds.length === 0) return;

			const parentEvents = await queryEvents({ ids: uniqParentIds, limit: uniqParentIds.length });
			if (cancelled) return;
			const parentEventById = new SvelteMap(
				parentEvents.map((ev) => [String(ev.id ?? '').toLowerCase(), ev]).filter((x) => x[0])
			);

			const nextParentByCommentId = new SvelteMap();
			const nextParentAuthorByCommentId = new SvelteMap();
			const nextParentZapParsedByCommentId = new SvelteMap();
			const nextParentZapperAuthorByCommentId = new SvelteMap();
			const authorPubkeys = new SvelteSet();
			const zapperPubkeys = new SvelteSet();

			for (const row of commentRows) {
				const commentId = String(row.event.id ?? '').toLowerCase();
				const rootId = row.event.tags?.find((t) => t[0] === 'E' && t[1])?.[1]?.toLowerCase();
				const parentId = row.event.tags?.find((t) => t[0] === 'e' && t[1])?.[1]?.toLowerCase();
				if (!commentId || !parentId || parentId === rootId) continue;
				const parentEv = parentEventById.get(parentId);
				if (!parentEv) continue;
				if (parentEv.kind === 1111) {
					nextParentByCommentId.set(commentId, parentEv);
					if (parentEv.pubkey) authorPubkeys.add(parentEv.pubkey);
					continue;
				}
				try {
					const parsed = parseZapReceipt(parentEv);
					if (parsed?.senderPubkey) {
						nextParentZapParsedByCommentId.set(commentId, parsed);
						zapperPubkeys.add(parsed.senderPubkey);
					}
				} catch {
					/* ignore non-zap parent */
				}
			}

			const profileKeys = [...new Set([...authorPubkeys, ...zapperPubkeys])];
			if (profileKeys.length > 0) {
				const batch = await fetchProfilesBatch(profileKeys);
				if (cancelled) return;
				const byPk = new SvelteMap();
				for (const [pk, ev] of batch) {
					const p = ev ? parseProfile(ev) : null;
					const pkNorm = normalizePubkey(pk);
					byPk.set(pkNorm, {
						name: p?.displayName ?? p?.name ?? null,
						picture: p?.picture ?? null,
						pubkey: pkNorm
					});
				}
				for (const [commentId, parentEv] of nextParentByCommentId) {
					const prof = byPk.get(normalizePubkey(parentEv.pubkey));
					if (!prof) continue;
					nextParentAuthorByCommentId.set(commentId, {
						name: prof.name ?? '',
						picture: prof.picture ?? '',
						pubkey: parentEv.pubkey
					});
				}
				for (const [commentId, parsed] of nextParentZapParsedByCommentId) {
					const prof = byPk.get(normalizePubkey(parsed.senderPubkey));
					if (!prof) continue;
					nextParentZapperAuthorByCommentId.set(commentId, {
						name: prof.name ?? '',
						picture: prof.picture ?? '',
						pubkey: parsed.senderPubkey
					});
				}
			}

			replaceMap(parentByCommentId, nextParentByCommentId);
			replaceMap(parentAuthorByCommentId, nextParentAuthorByCommentId);
			replaceMap(parentZapParsedByCommentId, nextParentZapParsedByCommentId);
			replaceMap(parentZapperAuthorByCommentId, nextParentZapperAuthorByCommentId);
		})();

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!searchProfilesQuery) return;
		const hydrated = Object.create(null);
		const sub = searchProfilesQuery.subscribe({
			next: ({ profiles, missingProfilePubkeys }) => {
				const next = new SvelteMap();
				for (const [pk, p] of Object.entries(profiles ?? {})) {
					if (p) next.set(String(pk).toLowerCase(), p);
				}
				replaceMap(profilesByPubkey, next);

				if (!isOnline()) return;
				const missing = (missingProfilePubkeys ?? []).filter((pk) => !hydrated[pk]);
				if (missing.length === 0) return;
				for (const pk of missing) hydrated[pk] = true;
				hydrateFilters(
					SEARCH_PROFILE_RELAYS,
					{ kinds: [EVENT_KINDS.PROFILE], authors: missing, limit: missing.length * 2 },
					{ timeout: 3000, feature: 'search-profiles' }
				).catch(() => {});
				hydrateFilters(
					PROFILE_FETCH_RELAYS,
					{ kinds: [EVENT_KINDS.PROFILE], authors: missing, limit: missing.length * 2 },
					{ timeout: 4000, feature: 'search-profiles-catalog' }
				).catch(() => {});
			}
		});
		return () => sub.unsubscribe();
	});

	$effect(() => {
		if (!browser || !filterDropdownOpen || !filterDropdownWrap) return;
		function handleClick(/** @type {MouseEvent} */ e) {
			if (filterDropdownWrap && !filterDropdownWrap.contains(/** @type {Node} */ (e.target))) {
				filterDropdownOpen = false;
			}
		}
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	});

	function focusSearchInput() {
		searchInputEl?.focus({ preventScroll: true });
	}

	function submitSearch(/** @type {SubmitEvent} */ e) {
		e.preventDefault();
		const q = searchBarValue.trim();
		const url = new URL($page.url);
		if (q) url.searchParams.set('q', q);
		else url.searchParams.delete('q');
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}

	/** @param {import('$lib/community/forum-search.js').ForumSearchResult} result */
	function openResult(result) {
		if (result.type === 'post') {
			const post = parseForumPost(result.event);
			const nevent = post?.id ? safeForumNevent(post.id) : '';
			if (nevent) goto(`/community/forum/${nevent}`);
		} else {
			const root = result.rootEvent;
			if (root?.kind === EVENT_KINDS.FORUM_POST && result.rootPostNevent) {
				goto(`/community/forum/${result.rootPostNevent}?comment=${result.event.id}`);
				return;
			}
			if ((root?.kind === EVENT_KINDS.APP || root?.kind === EVENT_KINDS.APP_STACK) && result.rootATag) {
				const parsed = result.rootATag.match(/^(\d+):([0-9a-fA-F]{64}):(.*)$/);
				if (!parsed) return;
				try {
					const naddr = nip19.naddrEncode({
						kind: Number(parsed[1]),
						pubkey: parsed[2],
						identifier: parsed[3]
					});
					goto(root.kind === EVENT_KINDS.APP ? `/apps/${naddr}` : `/stacks/${naddr}`);
				} catch {
					/* ignore invalid root tag */
				}
			}
		}
	}

	function parseNip33ATag(a) {
		if (!a || typeof a !== 'string') return null;
		const m = a.match(/^(\d+):([0-9a-fA-F]{64}):(.*)$/);
		if (!m) return null;
		return { kind: Number(m[1]), pubkey: m[2], identifier: m[3] };
	}

	function appBadgeFromAddrRoot(/** @type {import('nostr-tools').NostrEvent | null} */ ev) {
		if (!ev) return null;
		if (ev.kind === EVENT_KINDS.APP) {
			const p = parseApp(ev);
			return { iconUrl: p.icon ?? null, name: p.name, identifier: p.dTag };
		}
		if (ev.kind === EVENT_KINDS.APP_STACK) {
			const p = parseAppStack(ev);
			return { iconUrl: p.image ?? null, name: p.title, identifier: p.dTag };
		}
		return null;
	}

	function hrefForRootEvent(rootEvent, rootPostNevent, rootATag) {
		if (rootEvent?.kind === EVENT_KINDS.FORUM_POST && rootPostNevent) {
			return `/community/forum/${rootPostNevent}`;
		}
		if (!rootEvent?.pubkey) return null;
		const parsed = rootATag ? parseNip33ATag(rootATag) : null;
		if (!parsed) return null;
		try {
			const naddr = nip19.naddrEncode(parsed);
			return parsed.kind === EVENT_KINDS.APP ? `/apps/${naddr}` : `/stacks/${naddr}`;
		} catch {
			return null;
		}
	}

	function buildThreadRootContext(rootEvent, rootPostNevent, rootATag) {
		if (!rootEvent) return null;
		const href = hrefForRootEvent(rootEvent, rootPostNevent, rootATag);
		const oneliner = getEventOneliner(rootEvent);
		if (rootEvent.kind === EVENT_KINDS.FORUM_POST) {
			const post = parseForumPost(rootEvent);
			return {
				label: post?.title ?? oneliner.label ?? 'Publication',
				iconUrl: oneliner.emoji ?? null,
				href,
				isStack: false,
				isApp: false
			};
		}
		if (rootEvent.kind === EVENT_KINDS.APP || rootEvent.kind === EVENT_KINDS.APP_STACK) {
			const badge = appBadgeFromAddrRoot(rootEvent);
			const isStack = rootEvent.kind === EVENT_KINDS.APP_STACK;
			return {
				label: badge?.name ?? oneliner.label ?? (isStack ? 'Stack' : 'App'),
				iconUrl: isStack ? null : (badge?.iconUrl ?? oneliner.emoji ?? null),
				href,
				isStack,
				isApp: !isStack,
				identifier: badge?.identifier ?? null
			};
		}
		return null;
	}

	function normalizePubkey(pubkey) {
		return String(pubkey ?? '').trim().toLowerCase();
	}

	function profileEntryFromMap(profileMap, pubkey) {
		const pk = normalizePubkey(pubkey);
		const p = profileMap.get(pk) ?? profileMap.get(pubkey) ?? profilesByPubkey.get(pk);
		return p ?? null;
	}

	function enrichCommentEvent(commentEv, profileMap) {
		const c = parseComment(commentEv);
		const p = profileEntryFromMap(profileMap, commentEv.pubkey);
		let npub = '';
		try {
			npub = nip19.npubEncode(commentEv.pubkey);
		} catch {
			/* ignore */
		}
		return {
			...c,
			displayName:
				p?.displayName ??
				p?.name ??
				(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : commentEv.pubkey.slice(0, 8)),
			avatarUrl: p?.picture ?? null,
			profileUrl: npub ? `/profile/${npub}` : '',
			profileLoading: false
		};
	}

	function enrichReplyTargetForModal(commentEv, profileMap) {
		const c = parseComment(commentEv);
		const p = profileEntryFromMap(profileMap, commentEv.pubkey);
		let npub = '';
		try {
			npub = nip19.npubEncode(commentEv.pubkey);
		} catch {
			/* ignore */
		}
		return {
			id: commentEv.id,
			pubkey: commentEv.pubkey,
			displayName:
				p?.displayName ??
				p?.name ??
				(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : commentEv.pubkey.slice(0, 8)),
			avatarUrl: p?.picture ?? null,
			content: commentEv.content ?? '',
			createdAt: commentEv.created_at,
			emojiTags: c.emojiTags ?? [],
			mediaUrls: c.mediaUrls ?? []
		};
	}

	async function handleSearchThreadReply(rootPostId, rootPostPubkey, e) {
		if (!e?.text?.trim()) return;
		if (threadModalAddrATag) {
			const parts = threadModalAddrATag.split(':');
			const kindNum = parseInt(parts[0] ?? '', 10);
			const pubkey = parts[1];
			const identifier = parts.slice(2).join(':');
			if (
				!pubkey ||
				!identifier ||
				(kindNum !== EVENT_KINDS.APP && kindNum !== EVENT_KINDS.APP_STACK)
			)
				return;
			const contentType = kindNum === EVENT_KINDS.APP ? 'app' : 'stack';
			const signed = await publishComment(
				e.text,
				{ contentType, pubkey, identifier },
				signEvent,
				e.emojiTags ?? [],
				e.parentId ?? null,
				e.replyToPubkey ?? null,
				e.parentKind ?? EVENT_KINDS.COMMENT,
				e.mentions ?? [],
				COMMENT_PUBLISH_RELAYS,
				e.mediaUrls ?? []
			);
			await putEvents([signed]).catch(() => {});
			const parsed = parseComment(signed);
			const profile = threadProfiles.get(signed.pubkey) ?? profilesByPubkey.get(signed.pubkey);
			let npub = '';
			try {
				npub = nip19.npubEncode(signed.pubkey);
			} catch {
				/* ignore */
			}
			threadModalComments = [
				...threadModalComments,
				{
					...parsed,
					displayName:
						profile?.displayName ??
						profile?.name ??
						(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : signed.pubkey.slice(0, 8)),
					avatarUrl: profile?.picture ?? null,
					profileUrl: npub ? `/profile/${npub}` : '',
					profileLoading: false
				}
			];
			return;
		}
		if (!rootPostId) return;
		const signed = await publishComment(
			e.text,
			{
				contentType: 'forum',
				pubkey: rootPostPubkey,
				id: rootPostId,
				kind: EVENT_KINDS.FORUM_POST
			},
			signEvent,
			e.emojiTags ?? [],
			e.parentId ?? null,
			e.replyToPubkey ?? null,
			e.parentKind ?? EVENT_KINDS.COMMENT,
			e.mentions ?? [],
			COMMENT_PUBLISH_RELAYS,
			e.mediaUrls ?? []
		);
		await putEvents([signed]).catch(() => {});
		const parsed = parseComment(signed);
		const profile = threadProfiles.get(signed.pubkey) ?? profilesByPubkey.get(signed.pubkey);
		let npub = '';
		try {
			npub = nip19.npubEncode(signed.pubkey);
		} catch {
			/* ignore */
		}
		threadModalComments = [
			...threadModalComments,
			{
				...parsed,
				displayName:
					profile?.displayName ??
					profile?.name ??
					(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : signed.pubkey.slice(0, 8)),
				avatarUrl: profile?.picture ?? null,
				profileUrl: npub ? `/profile/${npub}` : '',
				profileLoading: false
			}
		];
	}

	async function openThreadInPlace(result, mode = 'view') {
		if (result.type !== 'comment') return;
		const gen = ++threadLoadGen;
		const commentEv = result.event;
		const root = result.rootEvent;
		const rootId = commentEv.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
		const rootATag = result.rootATag ?? null;
		threadModalExpandCommentId = null;
		initialReplyTargetForModal = null;
		threadOpenReply = false;
		threadOpenActions = false;
		let pool = [];
		if (root?.kind === EVENT_KINDS.FORUM_POST && rootId) {
			const [lower, upper] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': [rootId], limit: 400 }),
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': [rootId], limit: 400 })
			]);
			const seen = new SvelteSet();
			for (const ev of [...lower, ...upper]) {
				if (!seen.has(ev.id)) {
					seen.add(ev.id);
					pool.push(ev);
				}
			}
		} else if (
			(root?.kind === EVENT_KINDS.APP || root?.kind === EVENT_KINDS.APP_STACK) &&
			rootATag
		) {
			const [lower, upper] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#A': [rootATag], limit: 500 }),
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#a': [rootATag], limit: 500 })
			]);
			const seen = new SvelteSet();
			for (const ev of [...lower, ...upper]) {
				if (!seen.has(ev.id)) {
					seen.add(ev.id);
					pool.push(ev);
				}
			}
		}
		if (pool.length === 0 || gen !== threadLoadGen) return;
		const cmap = new SvelteMap(pool.map((e) => [e.id.toLowerCase(), e]));
		let rootCommentId = null;
		if (root?.kind === EVENT_KINDS.FORUM_POST && rootId) {
			rootCommentId = await resolveForumDiscussionRootCommentId(commentEv, rootId, cmap, (id) =>
				queryEvent({ ids: [id] }).catch(() => null)
			);
		} else if (
			(root?.kind === EVENT_KINDS.APP || root?.kind === EVENT_KINDS.APP_STACK) &&
			rootATag
		) {
			rootCommentId = walkAppDiscussionRootInMap(commentEv, cmap);
			if (!rootCommentId) {
				rootCommentId = await resolveAppDiscussionRootCommentId(commentEv, cmap, (id) =>
					queryEvent({ ids: [id] }).catch(() => null)
				);
			}
		}
		if (!rootCommentId || gen !== threadLoadGen) return;
		let rootCommentEv = cmap.get(rootCommentId.toLowerCase());
		if (!rootCommentEv) {
			rootCommentEv = await queryEvent({ ids: [rootCommentId] }).catch(() => null);
			if (!rootCommentEv || gen !== threadLoadGen) return;
			pool.push(rootCommentEv);
		}
		const subtree = collectCommentSubtree(rootCommentId, pool);
		const pubkeys = [...new Set(subtree.map((c) => c.pubkey).filter(Boolean))];
		const profileMap = new SvelteMap();
		if (pubkeys.length > 0) {
			const profs = await fetchProfilesBatch(pubkeys).catch(() => new Map());
			for (const [pk, ev] of profs) {
				const p = ev ? parseProfile(ev) : null;
				const pkNorm = normalizePubkey(pk);
				profileMap.set(pkNorm, {
					displayName: p?.displayName ?? p?.name ?? null,
					name: p?.name ?? p?.displayName ?? null,
					picture: p?.picture ?? null,
					pubkey: pkNorm
				});
			}
		}
		if (gen !== threadLoadGen) return;
		replaceMap(threadProfiles, profileMap);
		const enriched = subtree
			.map((ev) => enrichCommentEvent(ev, profileMap))
			.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
		if (!enriched.some((c) => c.id?.toLowerCase() === rootCommentId.toLowerCase())) return;

		threadModalContext = buildThreadRootContext(root, result.rootPostNevent, rootATag);
		threadModalForumPost =
			root?.kind === EVENT_KINDS.FORUM_POST && root.id
				? { id: root.id, pubkey: root.pubkey }
				: null;
		threadModalAddrATag =
			root?.kind === EVENT_KINDS.APP || root?.kind === EVENT_KINDS.APP_STACK ? rootATag : null;
		threadModalExpandCommentId =
			commentEv.id.toLowerCase() !== rootCommentId.toLowerCase() ? commentEv.id : null;
		initialReplyTargetForModal =
			mode === 'reply' && commentEv.id.toLowerCase() !== rootCommentId.toLowerCase()
				? enrichReplyTargetForModal(commentEv, profileMap)
				: null;
		threadModalRootEvent = rootCommentEv;
		threadModalComments = enriched;
		threadOpenReply = mode === 'reply';
		threadOpenActions = mode === 'options';
		threadOpenNonce += 1;
	}

	function handleCommentResultClick(e, result, mode = 'view') {
		e?.preventDefault?.();
		e?.stopPropagation?.();
		void openThreadInPlace(result, mode);
	}

	/** @param {string} pubkey */
	function profileFor(pubkey) {
		const pk = normalizePubkey(pubkey);
		const p = profilesByPubkey.get(pk);
		return p
			? {
					displayName: p.displayName ?? p.name ?? undefined,
					name: p.name ?? p.displayName ?? undefined,
					picture: p.picture ?? undefined,
					pubkey: p.pubkey ?? pubkey
				}
			: { pubkey };
	}

	function deletedRootKindFor(/** @type {import('nostr-tools').NostrEvent | null} */ rootEvent) {
		return rootEvent ? null : 'forum';
	}

	onMount(() => {
		if (!browser) return;
		searchBarValue = searchQ;
		window.setTimeout(focusSearchInput, 50);
	});
</script>

<div class="community-search-root">
	<header class="community-search-toolbar">
		<div class="community-search-toolbar-query">
				<form class="community-search-field-wrap" onsubmit={submitSearch}>
					<div class="community-search-input-row">
						<Search
							class="community-search-input-icon flex-shrink-0"
							style="color: var(--white33);"
							strokeWidth={2.5}
							aria-hidden="true"
						/>
						<input
							type="search"
							bind:this={searchInputEl}
							bind:value={searchBarValue}
							placeholder="Search the community"
							class="community-search-input semibold18"
							aria-label="Search community forum"
							autocomplete="off"
							spellcheck="false"
						/>
						{#if relaySearchLoading && !searchLoading && hasQuery}
							<Spinner color="var(--white33)" size={16} strokeWidth={2.5} />
						{/if}
					</div>
				</form>
		</div>
		<div class="community-search-toolbar-divider" aria-hidden="true"></div>
		<div
			class="community-search-toolbar-filters apps-search-controls"
			class:apps-search-controls--disabled={showSearchSkeleton}
		>
			<div class="community-search-sort-wrap" bind:this={filterDropdownWrap}>
				<button
					type="button"
					class="forum-all-btn forum-latest-btn apps-sort-trigger"
					onclick={() => {
						filterDropdownOpen = !filterDropdownOpen;
					}}
					aria-label="Filter results"
					aria-expanded={filterDropdownOpen}
					disabled={showSearchSkeleton}
				>
					<span>{filterLabel}</span>
					<span class="forum-all-btn-icon">
						<ChevronDown variant="outline" size={14} strokeWidth={1.4} color="var(--white66)" />
					</span>
				</button>
				{#if filterDropdownOpen}
					<DropdownMenu class="apps-search-sort-dropdown">
						<button
							type="button"
							class="dropdown-item"
							class:dropdown-item--active={resultFilter === 'all'}
							role="menuitem"
							onclick={() => {
								resultFilter = 'all';
								filterDropdownOpen = false;
							}}
						>
							All results
						</button>
						<button
							type="button"
							class="dropdown-item"
							class:dropdown-item--active={resultFilter === 'posts'}
							role="menuitem"
							onclick={() => {
								resultFilter = 'posts';
								filterDropdownOpen = false;
							}}
						>
							Posts
						</button>
						<button
							type="button"
							class="dropdown-item"
							class:dropdown-item--active={resultFilter === 'comments'}
							role="menuitem"
							onclick={() => {
								resultFilter = 'comments';
								filterDropdownOpen = false;
							}}
						>
							Comments
						</button>
					</DropdownMenu>
				{/if}
			</div>
		</div>
	</header>

	<div class="community-search-results-scroll" data-main-scroll>
				{#if hasQuery && showSearchSkeleton}
					<ForumFeedSkeleton rows={4} />
				{:else if hasQuery && filteredSearchResults.length === 0 && !searchLoading}
					<div class="community-search-empty-state" role="status">
						<p class="community-search-empty-text">No results found</p>
					</div>
				{:else if hasQuery}
					<div class="community-search-results-list">
						{#each filteredSearchResults as result (result.event.id)}
							{#if result.type === 'post'}
								{@const post = parseForumPost(result.event)}
								{@const authorProfile = profilesByPubkey.get(
									normalizePubkey(result.event.pubkey)
								)}
								{#if post}
									<ForumPostCard
										author={{
											name: profileNameForPic(authorProfile),
											displayName: authorProfile?.displayName,
											picture: authorProfile?.picture,
											pubkey: result.event.pubkey,
											npub: (() => {
												try {
													return nip19.npubEncode(result.event.pubkey);
												} catch {
													return '';
												}
											})()
										}}
										title={post.title}
										content={post.content}
										timestamp={post.createdAt}
										labels={post.labels ?? []}
										mediaUrls={post.mediaUrls ?? []}
										emojiTags={post.emojiTags ?? []}
										commenters={[]}
										commentCount={0}
										totalZapAmount={0}
										commentersLoading={false}
										onClick={() => openResult(result)}
									/>
								{/if}
							{:else}
								{@const author = profileFor(result.event.pubkey)}
								{@const feedAddrBadge = appBadgeFromAddrRoot(result.rootEvent)}
								<div
									class="community-search-comment-hit activity-item"
									role="button"
									tabindex="0"
									onclick={(e) => handleCommentResultClick(e, result)}
									onkeydown={(e) => {
										if (e.key !== 'Enter') return;
										handleCommentResultClick(e, result);
									}}
								>
									<CommentCard
										event={result.event}
										authorProfile={{
											name: profileNameForPic(author),
											picture: author.picture,
											pubkey: result.event.pubkey
										}}
										rootEvent={result.rootEvent}
										appBadge={feedAddrBadge}
										rootBadgeSkeleton={false}
										deletedRootKind={deletedRootKindFor(result.rootEvent)}
										profileUrl=""
										resolveMentionLabel={(pk) =>
											profilesByPubkey.get(normalizePubkey(pk))?.displayName ??
											profilesByPubkey.get(normalizePubkey(pk))?.name ??
											profileDisplayLabel(null, pk)}
										onRootClick={() => handleCommentResultClick(null, result)}
										parentComment={parentByCommentId.get(String(result.event.id ?? '').toLowerCase()) ?? null}
										parentCommentAuthor={parentAuthorByCommentId.get(String(result.event.id ?? '').toLowerCase()) ?? null}
										parentZapParsed={parentZapParsedByCommentId.get(String(result.event.id ?? '').toLowerCase()) ?? null}
										parentZapperAuthor={parentZapperAuthorByCommentId.get(String(result.event.id ?? '').toLowerCase()) ?? null}
										feedActions={{
											onReply: () => handleCommentResultClick(null, result, 'reply'),
											onZap: () => handleCommentResultClick(null, result),
											onOptions: () => handleCommentResultClick(null, result, 'options')
										}}
									/>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
	</div>

	{#if threadModalRootEvent}
		{@const _rootEv = threadModalRootEvent}
		{#key _rootEv.id}
			{@const _authorRaw =
				threadProfiles.get(normalizePubkey(_rootEv.pubkey)) ??
				profilesByPubkey.get(normalizePubkey(_rootEv.pubkey))}
			{@const _authorNpub = (() => {
				try {
					return nip19.npubEncode(_rootEv.pubkey);
				} catch {
					return '';
				}
			})()}
			{@const _evVersion = _rootEv.tags?.find((t) => t[0] === 'v' && t[1])?.[1] ?? ''}
			<RootComment
				hideRoot={true}
				openThreadOnMount={threadOpenNonce > 0}
				expandCommentId={threadModalExpandCommentId}
				openReplyOnMount={threadOpenReply}
				openActionsOnMount={threadOpenActions}
				initialReplyTarget={initialReplyTargetForModal}
				standaloneActionsOpenKey={threadOpenNonce}
				id={_rootEv.id}
				content={_rootEv.content ?? ''}
				version={_evVersion}
				emojiTags={(_rootEv.tags ?? [])
					.filter((t) => t[0] === 'emoji' && t[1] && t[2])
					.map((t) => ({ shortcode: t[1], url: t[2] }))}
				mediaUrls={(_rootEv.tags ?? []).filter((t) => t[0] === 'media' && t[1]).map((t) => t[1])}
				pictureUrl={_authorRaw?.picture ?? null}
				name={_authorRaw?.displayName ??
					_authorRaw?.name ??
					(_authorNpub
						? `npub1${_authorNpub.slice(5, 8)}…${_authorNpub.slice(-6)}`
						: _rootEv.pubkey.slice(0, 8))}
				pubkey={_rootEv.pubkey}
				timestamp={_rootEv.created_at}
				profileUrl={_authorNpub ? `/profile/${_authorNpub}` : ''}
				threadComments={threadModalComments}
				threadZaps={[]}
				rootContext={threadModalContext}
				labelCommunityPubkey={threadModalForumPost ? ZAPSTORE_COMMUNITY_PUBKEY : null}
				{signEvent}
				{searchProfiles}
				{searchEmojis}
				onReplySubmit={threadModalAddrATag
					? (e) => handleSearchThreadReply(null, null, e)
					: threadModalForumPost
						? (e) =>
								handleSearchThreadReply(
									threadModalForumPost.id,
									threadModalForumPost.pubkey,
									e
								)
						: undefined}
				onZapReceived={() => {}}
				onGetStarted={() => {}}
				resolveMentionLabel={(pk) =>
					threadProfiles.get(normalizePubkey(pk))?.displayName ??
					threadProfiles.get(normalizePubkey(pk))?.name ??
					profilesByPubkey.get(normalizePubkey(pk))?.displayName ??
					profilesByPubkey.get(normalizePubkey(pk))?.name ??
					null}
				onModalClose={() => {
					threadLoadGen++;
					threadModalRootEvent = null;
					threadModalComments = [];
					threadModalContext = null;
					threadModalForumPost = null;
					threadModalAddrATag = null;
					threadModalExpandCommentId = null;
					initialReplyTargetForModal = null;
					threadProfiles = new Map();
					threadOpenReply = false;
					threadOpenActions = false;
				}}
			/>
		{/key}
	{/if}
</div>

<style>
	.community-search-root {
		--apps-pad-x: 14px;
		display: flex;
		flex-direction: column;
		flex: 1;
		background: transparent;
	}

	@media (min-width: 768px) {
		.community-search-root {
			--apps-pad-x: 20px;
		}
	}

	.community-search-toolbar {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		flex-shrink: 0;
		padding: 0;
		border-bottom: 1px solid var(--shell-border);
		background-color: var(--background);
		position: sticky;
		top: 64px;
		z-index: 2;
	}

	.community-search-toolbar-query,
	.community-search-toolbar-filters {
		display: flex;
		align-items: center;
		padding: var(--apps-pad-x);
	}

	.community-search-toolbar-query {
		flex: 1;
		min-width: 0;
	}

	.community-search-toolbar-divider {
		flex-shrink: 0;
		width: 1px;
		align-self: stretch;
		background-color: var(--shell-border);
	}

	.community-search-toolbar-filters {
		flex-shrink: 0;
		justify-content: flex-end;
	}

	.community-search-field-wrap {
		width: 100%;
		min-width: 0;
	}

	.community-search-input-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-width: 0;
	}

	.community-search-input-icon {
		width: 1.5rem;
		height: 1.5rem;
	}

	@media (min-width: 768px) {
		.community-search-input-icon {
			width: 1.625rem;
			height: 1.625rem;
		}
	}

	.community-search-input {
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		outline: none;
		line-height: 1.3;
		letter-spacing: -0.02em;
		color: var(--white);
		font-size: 18px;
		font-weight: 600;
	}

	@media (min-width: 768px) {
		.community-search-input {
			font-size: 20px;
		}
	}

	.community-search-input::placeholder {
		color: var(--white33);
	}

	.community-search-results-scroll {
		flex: 1;
		overflow-x: hidden;
	}

	.community-search-results-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0 0 24px;
	}

	.community-search-empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		padding: 24px 16px;
		background: transparent;
	}

	.community-search-empty-text {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--white16);
		text-align: center;
	}

	.apps-search-controls {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.apps-search-controls--disabled {
		opacity: 0.45;
		pointer-events: none;
	}

	.community-search-sort-wrap {
		position: relative;
		z-index: 2;
	}

	.forum-all-btn {
		position: relative;
		z-index: 1;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 32px;
		padding: 0 12px 0 16px;
		font-size: 14px;
		font-weight: 500;
		color: var(--white66);
		background: var(--white16);
		border: none;
		border-radius: 12px;
	}

	.forum-all-btn.forum-latest-btn {
		background: var(--gray66);
		color: var(--white);
	}

	.forum-all-btn.forum-latest-btn:hover:not(:disabled) {
		filter: brightness(1.08);
	}

	.forum-all-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.forum-all-btn .forum-all-btn-icon {
		display: flex;
		align-items: center;
		padding-top: 2px;
	}

	:global(.apps-search-sort-dropdown) {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		min-width: 160px;
		z-index: 50;
	}

	.activity-item {
		padding: 12px 16px;
		border-bottom: 1px solid var(--shell-border);
		cursor: pointer;
	}

	.activity-item:last-child {
		border-bottom: none;
	}
</style>
