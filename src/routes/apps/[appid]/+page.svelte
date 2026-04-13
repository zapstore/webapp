<script lang="js">
	import { onMount } from 'svelte';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { Package, X } from 'lucide-svelte';
	import {
		queryEvents,
		queryEvent,
		queryCommentsFromStore,
		parseApp,
		parseRelease,
		fetchProfile,
		fetchProfilesBatch,
		fetchComments,
		fetchCommentRepliesByE,
		fetchZaps,
		fetchLabelsForAddressable,
		groupLabelEventsToEntries,
		parseComment,
		parseZapReceipt,
		encodeAppNaddr,
		publishComment,
		decodeNaddr,
		putEvents
	} from '$lib/nostr';
	import { fetchFromRelays } from '$lib/nostr/service';
	import { db } from '$lib/nostr/dexie';
	import { ZAPSTORE_RELAY } from '$lib/config';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import { nip19 } from 'nostr-tools';
	import { EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';
	import { wheelScroll } from '$lib/actions/wheelScroll.js';
	import AppPic from '$lib/components/common/AppPic.svelte';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';
	import { SocialTabs, BottomBar } from '$lib/components/social';
	import Modal from '$lib/components/common/Modal.svelte';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	import GetStartedModal from '$lib/components/modals/GetStartedModal.svelte';
	import SpinKeyModal from '$lib/components/modals/SpinKeyModal.svelte';
	import OnboardingBuildingModal from '$lib/components/modals/OnboardingBuildingModal.svelte';
	import {
		createSearchProfilesFunction,
		ZAPSTORE_PUBKEY,
		zapstoreProfileStore
	} from '$lib/services/profile-search';
	import { createSearchEmojisFunction } from '$lib/services/emoji-search';
	import { getCurrentPubkey, getIsSignedIn, signEvent } from '$lib/stores/auth.svelte.js';
	import { isOnline } from '$lib/stores/online.svelte.js';
	import { markdownToPlainTextLine, renderMarkdown } from '$lib/utils/markdown';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { SITE_URL, SITE_ICON } from '$lib/config';
	import Timestamp from '$lib/components/common/Timestamp.svelte';
	import { stripUrlForDisplay } from '$lib/utils/url.js';
	import { Copy, Check, Index } from '$lib/components/icons';
	let { data } = $props();
	const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
	const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));
	// Error is mutable: server may set it, but client can clear it when Dexie has data
	let error = $state(null);
	// Local state - start with prerendered data
	let app = $state(null);
	const appJsonLd = $derived(
		app
			? {
					'@context': 'https://schema.org',
					'@type': 'SoftwareApplication',
					name: app.name,
					description: markdownToPlainTextLine(app.description).slice(0, 160),
					image: app.icon,
					url: `${SITE_URL}/apps/${app.naddr || app.dTag}`,
					operatingSystem: 'Android',
					applicationCategory: 'MobileApplication',
					publisher: { '@type': 'Organization', '@id': `${SITE_URL}/#organization` }
				}
			: null
	);
	let latestRelease = $state(null);
	let _refreshing = $state(false);
	// Publisher profile
	let publisherProfile = $state(null);
	// Description expand state
	let descriptionExpanded = $state(false);
	let isTruncated = $state(false);
	// Screenshot carousel state
	let carouselOpen = $state(false);
	let currentImageIndex = $state(0);
	let carouselImageLoaded = $state(false);
	// Track which thumbnail screenshots have loaded
	let thumbsLoaded = new SvelteSet();
	// Comments and zaps state (comments may have pending + npub for display)
	let comments = $state([]);
	let commentsLoading = $state(false);
	let commentsError = $state('');
	let profiles = $state({});
	let profilesLoading = $state(false);
	let zaps = $state([]);
	let zapsLoading = $state(false);
	let zapperProfiles = new SvelteMap();
	/** @type {Array<{ label: string, pubkeys: string[] }>} */
	let labelEntries = $state([]);
	let labelsLoading = $state(false);
	let releases = $state([]);
	let releasesLoading = $state(false);
	let releasesModalOpen = $state(false);
	/** Single expanded release id (null = none). Toggling this one value is reliable in Svelte 5. */
	let expandedReleaseId = $state(null);
	let downloadModalOpen = $state(false);
	let getStartedModalOpen = $state(false);
	let spinKeyModalOpen = $state(false);
	let onboardingBuildingModalOpen = $state(false);
	let onboardingProfileName = $state('');
	let securityModalOpen = $state(false);
	function _handleGetStartedStart(_event) {
		onboardingProfileName = _event.profileName;
		spinKeyModalOpen = true;
		setTimeout(() => {
			getStartedModalOpen = false;
		}, 80);
	}
	function handleGetStartedConnected() {
		getStartedModalOpen = false;
	}
	function handleSpinComplete() {
		spinKeyModalOpen = false;
		setTimeout(() => {
			onboardingBuildingModalOpen = true;
		}, 150);
	}
	function handleUseExistingKey() {
		spinKeyModalOpen = false;
		getStartedModalOpen = true;
	}
	const appid = $derived($page.params.appid ?? '');
	// appid may be a plain d-tag or a legacy naddr — the onMount logic handles both
	const otherZaps = $derived(
		zaps.map((z) => {
			const prof = z.senderPubkey ? zapperProfiles.get(z.senderPubkey) : undefined;
			return {
				amount: z.amountSats,
				profile: z.senderPubkey
					? {
							pictureUrl: prof?.picture,
							name: prof?.displayName ?? prof?.name,
							pubkey: z.senderPubkey
						}
					: undefined
			};
		})
	);
	// Catalog for this app (used in header and Security modal) — same source as DetailHeader so catalog image matches
	const catalogs = [
		{
			name: 'Zapstore',
			pictureUrl: SITE_ICON,
			pubkey: '78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55f2fe2202182'
		}
	];
	let zapstoreProfile = $state(null);
	$effect(() => {
		const unsub = zapstoreProfileStore.subscribe((v) => (zapstoreProfile = v));
		return unsub;
	});
	const isZapstoreCatalog = $derived(
		catalogs.length > 0 &&
			catalogs[0]?.pubkey &&
			ZAPSTORE_PUBKEY &&
			(catalogs[0].pubkey.toLowerCase() === ZAPSTORE_PUBKEY.toLowerCase() ||
				(catalogs[0].name ?? '').toLowerCase() === 'zapstore')
	);
	const effectiveCatalogs = $derived(
		isZapstoreCatalog && zapstoreProfile
			? [{ ...catalogs[0], pictureUrl: zapstoreProfile.picture, name: zapstoreProfile.name }]
			: [...catalogs]
	);
	const catalogProfiles = $derived(
		effectiveCatalogs.map((c) => ({
			picture: c.pictureUrl,
			displayName: c.name,
			name: c.name,
			pubkey: c.pubkey
		}))
	);
	// Derived values
	function middleTrimNpub(npubStr) {
		if (!npubStr || npubStr.length < 14) return npubStr ?? '';
		const afterPrefix = npubStr.startsWith('npub1') ? npubStr.slice(5, 8) : npubStr.slice(0, 3);
		return `npub1${afterPrefix}......${npubStr.slice(-6)}`;
	}
	function middleTrimNaddr(naddrStr) {
		if (!naddrStr || naddrStr.length < 20) return naddrStr ?? '';
		if (!naddrStr.startsWith('naddr1'))
			return naddrStr.slice(0, 10) + '......' + naddrStr.slice(-6);
		return 'naddr1' + naddrStr.slice(7, 11) + '......' + naddrStr.slice(-6);
	}
	let naddrCopied = $state(false);
	async function copyNaddr() {
		if (!app?.naddr) return;
		try {
			await navigator.clipboard.writeText(app.naddr);
			naddrCopied = true;
			setTimeout(() => (naddrCopied = false), 1500);
		} catch {
			// ignore
		}
	}
	const truncatedNpub = $derived(app?.npub ? middleTrimNpub(app.npub) : '');
	const publisherName = $derived(
		publisherProfile?.displayName || publisherProfile?.name || truncatedNpub
	);
	const publisherNameForPic = $derived(
		publisherProfile?.displayName || publisherProfile?.name || null
	);
	const publisherPictureUrl = $derived(publisherProfile?.picture || '');
	const publisherUrl = $derived(app?.npub ? `/profile/${app.npub}` : '#');
	const platforms = $derived(app?.platform ? [app.platform] : ['Android']);
	const hasRepository = $derived(!!app?.repository);
	const isZapstorePublisher = $derived(
		!!app?.pubkey && !!ZAPSTORE_PUBKEY && app.pubkey.toLowerCase() === ZAPSTORE_PUBKEY.toLowerCase()
	);
	const isZapstoreOfficialAppId = $derived(!!app?.dTag && app.dTag.startsWith('dev.zapstore.'));
	const publishedByDeveloper = $derived(!isZapstorePublisher || isZapstoreOfficialAppId);
	// Check if description is truncated
	function checkTruncation(node) {
		setTimeout(() => {
			if (node) {
				isTruncated = node.scrollHeight > node.clientHeight;
			}
		}, 0);
		const resizeObserver = new ResizeObserver(() => {
			if (node && !descriptionExpanded) {
				isTruncated = node.scrollHeight > node.clientHeight;
			}
		});
		resizeObserver.observe(node);
		return {
			destroy() {
				resizeObserver.disconnect();
			}
		};
	}
	// Screenshot carousel functions
	function openCarousel(index) {
		currentImageIndex = index;
		carouselOpen = true;
		document.body.style.overflow = 'hidden';
	}
	function closeCarousel() {
		carouselOpen = false;
		document.body.style.overflow = '';
	}
	function nextImage() {
		if (app?.images) {
			currentImageIndex = (currentImageIndex + 1) % app.images.length;
			carouselImageLoaded = false;
		}
	}
	function prevImage() {
		if (app?.images) {
			currentImageIndex = (currentImageIndex - 1 + app.images.length) % app.images.length;
			carouselImageLoaded = false;
		}
	}
	function handleKeydown(event) {
		if (!carouselOpen) return;
		if (event.key === 'Escape') {
			closeCarousel();
		} else if (event.key === 'ArrowRight') {
			nextImage();
		} else if (event.key === 'ArrowLeft') {
			prevImage();
		}
	}
	// Release notes preview: strip markdown first, then take first sentence or first 50 chars
	const VERSION_MAX_LEN = 12;
	function trimVersion(version) {
		if (version == null || typeof version !== 'string') return version ?? '';
		return version.length > VERSION_MAX_LEN ? version.slice(0, VERSION_MAX_LEN) + '...' : version;
	}
	function releaseNotesPreview(notes) {
		if (!notes) return '';
		const stripped = markdownToPlainTextLine(notes);
		if (!stripped) return '';
		const firstSentence = stripped.split(/[.!?](?:\s|$)/)[0]?.trim() ?? stripped;
		return (firstSentence.length > 50 ? firstSentence.slice(0, 50) : firstSentence) || '';
	}
	// Load publisher profile
	async function loadPublisherProfile(pubkey) {
		if (!pubkey) return;
		try {
			const event = await fetchProfile(pubkey);
			if (event) {
				const content = JSON.parse(event.content);
				publisherProfile = {
					displayName: content.display_name || content.displayName,
					name: content.name,
					picture: content.picture
				};
			}
		} catch (err) {
			console.error('Error fetching publisher profile:', err);
		}
	}
	// Load comments (cached comments from store show immediately; only show loading when no cache)
	async function loadComments() {
		if (!app?.pubkey || !app?.dTag) return;
		const hadCached = comments.length > 0;
		if (!hadCached) commentsLoading = true;
		commentsError = '';
		try {
			const [relayEvents, storeEvents] = await Promise.all([
				fetchComments(app.pubkey, app.dTag),
				queryCommentsFromStore(app.pubkey, app.dTag)
			]);
			const byId = new Map();
			for (const e of storeEvents) {
				if (e?.id) byId.set(e.id.toLowerCase(), e);
			}
			for (const e of relayEvents) {
				if (e?.id) byId.set(e.id.toLowerCase(), e);
			}
			const merged = Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
			comments = merged.map(parseComment);
			// Load profiles for comment authors aggressively in one batched request.
			const uniquePubkeys = [...new Set(comments.map((c) => c.pubkey).filter(Boolean))];
			profilesLoading = true;
			const fetchedProfiles = await fetchProfilesBatch(uniquePubkeys);
			const nextProfiles = { ...profiles };
			for (const pubkey of uniquePubkeys) {
				const event = fetchedProfiles.get(pubkey);
				if (!event?.content) {
					nextProfiles[pubkey] = nextProfiles[pubkey] ?? null;
					continue;
				}
				try {
					const content = JSON.parse(event.content);
					nextProfiles[pubkey] = {
						displayName: content.display_name || content.displayName,
						name: content.name,
						picture: content.picture
					};
				} catch {
					nextProfiles[pubkey] = nextProfiles[pubkey] ?? null;
				}
			}
			profiles = nextProfiles;
			profilesLoading = false;
		} catch (err) {
			commentsError = 'Failed to load comments';
			console.error(err);
		} finally {
			commentsLoading = false;
		}
	}
	/**
	 * Load replies that reference comments/zaps via #e (fallback for clients that don't include #A).
	 * Iterates until no new replies are found so all nesting depths are covered.
	 * Returns all comment ids after merging (used by caller to fetch zaps on them).
	 */
	async function loadCommentReplies() {
		if (!app?.pubkey || !app?.dTag) return comments.map((c) => c.id);
		// Start with all current comment + zap ids as the initial frontier.
		let frontier = [...new Set([...comments.map((c) => c.id), ...zaps.map((z) => z.id)])];
		if (frontier.length === 0) return comments.map((c) => c.id);
		try {
			const events = await fetchCommentRepliesByE(frontier);
			const existingIds = new Set(comments.map((c) => c.id.toLowerCase()));
			const newEvents = events.filter((ev) => !existingIds.has(ev.id.toLowerCase()));
			const newParsed = newEvents.map((ev) => {
				const p = parseComment(ev);
				p.npub = nip19.npubEncode(ev.pubkey);
				return p;
			});
			comments = [...comments, ...newParsed];
		} catch (err) {
			console.error('Failed to load comment replies by #e:', err);
		}
		return comments.map((c) => c.id);
	}
	/** 1) Fetch zaps that tag the main app/stack (#a) → main feed zaps. 2) Then fetch zaps that tag any comment or zap in that main feed (#e) and merge. One level only; deeper zaps later. */
	async function loadZaps() {
		if (!app?.pubkey || !app?.dTag) return;
		zapsLoading = true;
		try {
			// Step 1: zaps on the main event (app) — merge relay one-shot + Dexie (live sub + prior visits)
			const aTagValue = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
			const [initialEvents, zLo, zUp] = await Promise.all([
				fetchZaps(app.pubkey, app.dTag),
				queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#a': [aTagValue], limit: 200 }),
				queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#A': [aTagValue], limit: 200 })
			]);
			const byId = new Map();
			for (const e of [...zLo, ...zUp]) {
				if (e?.id) byId.set(e.id, e);
			}
			for (const e of initialEvents) {
				if (e?.id) byId.set(e.id, e);
			}
			const parseOne = (e) => {
				const parsed = { ...parseZapReceipt(e), id: e.id };
				if (!parsed.zappedEventId && e.tags?.length) {
					const eTag = e.tags.find((t) => t[0]?.toLowerCase() === 'e' && t[1]);
					if (eTag?.[1]) parsed.zappedEventId = eTag[1];
				}
				return parsed;
			};
			zaps = Array.from(byId.values()).map(parseOne);
			await hydrateZapperProfiles();
		} catch (err) {
			console.error('Failed to load zaps:', err);
		} finally {
			zapsLoading = false;
		}
	}
	async function loadLabels() {
		if (!app?.pubkey || !app?.dTag) return;
		const pk = app.pubkey.toLowerCase();
		const d = app.dTag;
		const aVal = `${EVENT_KINDS.APP}:${pk}:${d}`;
		labelsLoading = true;
		try {
			const [lo, up] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.LABEL], '#a': [aVal], limit: 300 }),
				queryEvents({ kinds: [EVENT_KINDS.LABEL], '#A': [aVal], limit: 300 })
			]);
			const byId = new Map();
			for (const e of [...lo, ...up]) {
				if (e?.id && !byId.has(e.id)) byId.set(e.id, e);
			}
			labelEntries = groupLabelEventsToEntries(Array.from(byId.values()));
			const remote = await fetchLabelsForAddressable(pk, d, { aTagKind: EVENT_KINDS.APP });
			for (const e of remote) {
				if (e?.id && !byId.has(e.id)) byId.set(e.id, e);
			}
			labelEntries = groupLabelEventsToEntries(Array.from(byId.values()));
			const allLabelers = [...new Set(labelEntries.flatMap((en) => en.pubkeys))];
			if (allLabelers.length > 0) {
				const batch = await fetchProfilesBatch(allLabelers, { timeout: 3000 });
				const next = { ...profiles };
				for (const [pkey, ev] of batch) {
					if (ev?.content) {
						try {
							const j = JSON.parse(ev.content);
							next[pkey] = {
								displayName: j.display_name ?? j.displayName,
								name: j.name,
								picture: j.picture
							};
						} catch {
							/* ignore */
						}
					}
				}
				profiles = next;
			}
		} catch (err) {
			console.error('[AppDetail] Labels failed:', err);
		} finally {
			labelsLoading = false;
		}
	}
	/** Fetch zaps that tag any of the given event ids (#e) and merge into zaps. Used for zaps on main-feed comments and zaps. */
	async function loadZapsByMainFeedIds(mainFeedEventIds) {
		if (!app?.pubkey || !app?.dTag || mainFeedEventIds.length === 0) return;
		try {
			const events = await fetchZaps(app.pubkey, app.dTag, { eventIds: mainFeedEventIds });
			const existingIds = new Set(zaps.map((z) => z.id.toLowerCase()));
			const newEvents = events.filter((e) => !existingIds.has(e.id.toLowerCase()));
			if (newEvents.length === 0) return;
			const parseOne = (e) => {
				const parsed = { ...parseZapReceipt(e), id: e.id };
				if (!parsed.zappedEventId && e.tags?.length) {
					const eTag = e.tags.find((t) => t[0]?.toLowerCase() === 'e' && t[1]);
					if (eTag?.[1]) parsed.zappedEventId = eTag[1].toLowerCase();
				}
				return parsed;
			};
			const newZaps = newEvents.map(parseOne);
			const merged = [...zaps];
			const mergedIds = new SvelteSet(merged.map((z) => z.id.toLowerCase()));
			for (const z of newZaps) {
				if (!mergedIds.has(z.id.toLowerCase())) {
					merged.push(z);
					mergedIds.add(z.id.toLowerCase());
				}
			}
			zaps = merged;
			await hydrateZapperProfiles();
		} catch (err) {
			console.error('Failed to load zaps by main feed ids:', err);
		}
	}
	async function hydrateZapperProfiles() {
		const uniqueSenders = [...new SvelteSet(zaps.map((z) => z.senderPubkey).filter(Boolean))];
		for (const pk of uniqueSenders) {
			const ev = await queryEvent({ kinds: [0], authors: [pk] });
			if (ev?.content) {
				try {
					const c = JSON.parse(ev.content);
					zapperProfiles.set(pk, {
						displayName: c.display_name ?? c.name,
						name: c.name,
						picture: c.picture
					});
				} catch {
					/* ignore */
				}
			}
		}
		const missing = uniqueSenders.filter((pk) => !zapperProfiles.has(pk)).slice(0, 40);
		const fetched = await fetchProfilesBatch(missing);
		for (const pubkey of missing) {
			const event = fetched.get(pubkey);
			if (!event?.content) continue;
			try {
				const content = JSON.parse(event.content);
				zapperProfiles.set(pubkey, {
					displayName: content.display_name ?? content.name,
					name: content.name,
					picture: content.picture
				});
			} catch {
				/* ignore malformed profile */
			}
		}
	}
	function parseZapFromReceiptEvent(e) {
		const parsed = { ...parseZapReceipt(e), id: e.id };
		if (!parsed.zappedEventId && e.tags?.length) {
			const eTag = e.tags.find((t) => t[0]?.toLowerCase() === 'e' && t[1]);
			if (eTag?.[1]) parsed.zappedEventId = eTag[1];
		}
		return parsed;
	}
	function handleZapPending(payload) {
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
	function handleZapPendingClear(tempId) {
		if (!tempId) return;
		zaps = zaps.filter((z) => z.id !== tempId);
	}
	async function handleBottomBarZapUpdate(event) {
		const { zapReceipt, pendingTempId } = event ?? {};
		if (pendingTempId) {
			zaps = zaps.filter((z) => z.id !== pendingTempId);
		}
		if (zapReceipt?.id) {
			const parsed = parseZapFromReceiptEvent(zapReceipt);
			const pid = String(parsed.id).toLowerCase();
			if (!zaps.some((z) => String(z.id).toLowerCase() === pid)) {
				zaps = [parsed, ...zaps];
			}
			await hydrateZapperProfiles();
		}
		function refetchZapsAndThreads() {
			loadZaps().then(async () => {
				const mainFeedZapIds = zaps.filter((z) => !z.pending && !z.zappedEventId).map((z) => z.id);
				const allCommentIds = await loadCommentReplies();
				loadZapsByMainFeedIds([...allCommentIds, ...mainFeedZapIds]);
			});
		}
		refetchZapsAndThreads();
		setTimeout(refetchZapsAndThreads, 2500);
	}
	async function handleCommentSubmit(event) {
		const userPubkey = getCurrentPubkey();
		if (!userPubkey || !app) return;
		const {
			text,
			emojiTags: submitEmojiTags,
			parentId,
			replyToPubkey,
			rootPubkey,
			parentKind,
			mediaUrls: submitMediaUrls
		} = event;
		const tempId = `pending-${Date.now()}`;
		const optimistic = {
			id: tempId,
			pubkey: userPubkey,
			content: text,
			contentHtml: '',
			emojiTags: submitEmojiTags ?? [],
			mediaUrls: submitMediaUrls ?? [],
			createdAt: Math.floor(Date.now() / 1000),
			parentId: parentId ?? null,
			isReply: parentId != null,
			pending: true,
			npub: nip19.npubEncode(userPubkey)
		};
		comments = [...comments, optimistic];
		try {
			const signed = await publishComment(
				text,
				{ contentType: 'app', pubkey: app.pubkey, identifier: app.dTag },
				signEvent,
				submitEmojiTags,
				parentId,
				replyToPubkey ?? rootPubkey,
				parentKind,
				event.mentions,
				undefined,
				submitMediaUrls,
				parentId ? null : (latestRelease?.version ?? null)
			);
			const parsed = parseComment(signed);
			parsed.npub = nip19.npubEncode(signed.pubkey);
			comments = comments.filter((c) => c.id !== tempId);
			comments = [...comments, parsed];
			// So the new comment shows our name/avatar: ensure current user's profile is in profiles (cache first, then fetch)
			const existing = await queryEvent({ kinds: [0], authors: [userPubkey] });
			if (existing?.content) {
				try {
					const c = JSON.parse(existing.content);
					profiles = {
						...profiles,
						[userPubkey]: {
							displayName: c.display_name ?? c.displayName,
							name: c.name,
							picture: c.picture
						}
					};
				} catch {
					/* ignore */
				}
			} else {
				try {
					const event = (await fetchProfilesBatch([userPubkey])).get(userPubkey);
					if (event?.content) {
						const content = JSON.parse(event.content);
						profiles = {
							...profiles,
							[userPubkey]: {
								displayName: content.display_name ?? content.displayName,
								name: content.name,
								picture: content.picture
							}
						};
					}
				} catch {
					/* ignore */
				}
			}
		} catch (err) {
			console.error('Failed to publish comment:', err);
			comments = comments.filter((c) => c.id !== tempId);
			commentsError =
				err instanceof Error ? err.message : 'Comment could not be published to any relay.';
		}
	}
	async function loadReleases() {
		if (!app?.pubkey || !app?.dTag) return;
		releasesLoading = true;
		try {
			// Fetch releases from relays (server doesn't cache releases).
			// Query both #a (older releases) and #i (newer releases that omit #a).
			const aTagValue = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
			await Promise.all([
				fetchFromRelays(
					[ZAPSTORE_RELAY],
					{
						kinds: [EVENT_KINDS.RELEASE],
						'#a': [aTagValue],
						limit: 50
					},
					{ feature: 'app-detail' }
				),
				fetchFromRelays(
					[ZAPSTORE_RELAY],
					{
						kinds: [EVENT_KINDS.RELEASE],
						'#i': [app.dTag],
						limit: 50
					},
					{ feature: 'app-detail' }
				)
			]);
			// Read from Dexie (fetchFromRelays wrote them there); merge and deduplicate.
			const [byATag, byITag] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue], limit: 50 }),
				queryEvents({ kinds: [EVENT_KINDS.RELEASE], '#i': [app.dTag], limit: 50 })
			]);
			const seen = new SvelteSet();
			const merged = [];
			for (const e of [...byATag, ...byITag]) {
				if (!seen.has(e.id)) {
					seen.add(e.id);
					merged.push(e);
				}
			}
			merged.sort((a, b) => b.created_at - a.created_at);
			const releaseEvents = merged.slice(0, 50);
			releases = releaseEvents.map(parseRelease);
			if (releases.length > 0 && !latestRelease) {
				latestRelease = releases[0];
			}
			// Re-fetch zaps with release/metadata ids
			const latest = releases[0];
			if (latest && app?.pubkey && app?.dTag) {
				const ids = [latest.id, ...(latest.artifacts ?? [])];
				loadZapsByMainFeedIds(ids);
			}
		} catch (err) {
			console.error('Failed to load releases:', err);
			releases = [];
		} finally {
			releasesLoading = false;
		}
	}
	onMount(async () => {
		if (!browser) return;
		
		// Resolve pubkey + identifier: appid may be a plain d-tag or a legacy naddr
		const pointer = decodeNaddr(appid);
		let _pubkey = data.app?.pubkey ?? pointer?.pubkey;
		let _identifier = data.app?.dTag ?? pointer?.identifier ?? (pointer ? undefined : appid);

		// 1. Try Dexie first (local-first: IndexedDB is the single client-side source of truth)
		// When navigating client-side to /apps/:dtag we may only have the identifier (no pubkey yet).
		let cachedApp = null;
		if (_pubkey && _identifier) {
			cachedApp = await queryEvent({
				kinds: [EVENT_KINDS.APP],
				authors: [_pubkey],
				'#d': [_identifier],
				...PLATFORM_FILTER
			});
		} else if (_identifier) {
			// d-tag only — query by tag, pick first result
			cachedApp = await queryEvent({
				kinds: [EVENT_KINDS.APP],
				'#d': [_identifier],
				...PLATFORM_FILTER
			});
		}
		if (cachedApp) {
			app = parseApp(cachedApp);
			_pubkey = app.pubkey;
			_identifier = app.dTag;
			error = null;

			// Background relay verification: confirm the app still exists on the relay.
			// If the relay returns nothing (event was removed without a NIP-09 deletion),
			// evict the stale Dexie entry and show "App not found".
			if (isOnline()) {
				fetchFromRelays(
					[ZAPSTORE_RELAY],
					{
						kinds: [EVENT_KINDS.APP],
						authors: [_pubkey],
						'#d': [_identifier],
						...PLATFORM_FILTER,
						limit: 1
					},
					{ feature: 'app-detail-verify' }
				).then((events) => {
					if (events.length === 0) {
						// App no longer on relay — evict from Dexie and surface the error
						db.events.delete(cachedApp.id).catch(() => {});
						app = null;
						error = 'App not found';
					}
				});
			}
		}

		if (!_identifier) {
			error = data.error ?? 'Invalid app URL';
			return;
		}

		// 2. Supplement with server data (may be fresher)
		if (data.app && !app) {
			app = data.app;
			_pubkey = app.pubkey;
			_identifier = app.dTag;
			error = null;
		}

		// 3. Not in cache or Dexie: try relays once before showing 404 (online only)
		//    Works with d-tag only — no pubkey required.
		if (!app && isOnline()) {
			const events = await fetchFromRelays(
				[ZAPSTORE_RELAY],
				{
					kinds: [EVENT_KINDS.APP],
					...(_pubkey ? { authors: [_pubkey] } : {}),
					'#d': [_identifier],
					...PLATFORM_FILTER,
					limit: 1
				},
				{ feature: 'app-detail' }
			);
			if (events.length > 0) {
				app = parseApp(events[0]);
				_pubkey = app.pubkey;
				_identifier = app.dTag;
				error = null;
			}
		}

		if (!app) {
			error = data.error ?? 'App not found';
			return;
		}

		if (!_pubkey || !_identifier) {
			error = 'Invalid app URL';
			return;
		}

		const aTagValue = `${EVENT_KINDS.APP}:${_pubkey}:${_identifier}`;
		// Old format: #a + platform filter. New format: #i only (no #f on release events).
		const [cachedByA, cachedByI] = await Promise.all([
			queryEvent({ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue], ...PLATFORM_FILTER }),
			queryEvent({ kinds: [EVENT_KINDS.RELEASE], '#i': [_identifier] })
		]);
		const cachedRelease =
			[cachedByA, cachedByI].filter(Boolean).sort((a, b) => b.created_at - a.created_at)[0] ?? null;
		if (cachedRelease) {
			latestRelease = parseRelease(cachedRelease);
		}
		// Seed server events (app + publisher profile) into Dexie so subsequent
		// queries (e.g. loadPublisherProfile) find them locally without relay fetch.
		if (data.seedEvents?.length > 0) {
			await putEvents(data.seedEvents).catch((err) =>
				console.error('[AppDetail] Seed persist failed:', err)
			);
		}
		// Hydrate social data from Dexie (local-first)
		const cachedCommentEvents = await queryCommentsFromStore(_pubkey, _identifier);
		if (cachedCommentEvents.length > 0) {
			comments = cachedCommentEvents.map(parseComment);
			const nextProfiles = { ...profiles };
			const commentPubkeys = [...new Set(comments.map((c) => c.pubkey))];
			for (const pk of commentPubkeys) {
				const ev = await queryEvent({ kinds: [0], authors: [pk] });
				if (ev?.content) {
					try {
						const c = JSON.parse(ev.content);
						nextProfiles[pk] = {
							displayName: c.display_name ?? c.displayName,
							name: c.name,
							picture: c.picture
						};
					} catch {
						/* ignore */
					}
				}
			}
			profiles = nextProfiles;
		}
		// Load publisher profile
		loadPublisherProfile(_pubkey);
		// Background cascade: comments, zaps, then replies by #e
		Promise.all([loadComments(), loadZaps(), loadLabels()]).then(async () => {
			const mainFeedZapIds = zaps.filter((z) => !z.zappedEventId).map((z) => z.id);
			const allCommentIds = await loadCommentReplies();
			loadZapsByMainFeedIds([...allCommentIds, ...mainFeedZapIds]);
		});
		// Load releases from server data
		const schedule =
			'requestIdleCallback' in window ? window.requestIdleCallback : (cb) => setTimeout(cb, 1);
		schedule(async () => {
			loadReleases();
		});
	});
	function retryLoad() {
		window.location.reload();
	}
	function _formatReleaseDate(ts) {
		return new Date(ts * 1000).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
	function toggleReleaseNotesExpanded(releaseId) {
		expandedReleaseId = expandedReleaseId === releaseId ? null : releaseId;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if app}
	<SeoHead
		title="{app.name} — Zapstore"
		description={markdownToPlainTextLine(app.description).slice(0, 160)}
		image={app.icon || null}
		url="{SITE_URL}/apps/{app.naddr || app.dTag}"
		jsonld={appJsonLd}
	/>
{:else}
	<SeoHead title="App Details — Zapstore" />
{/if}

{#if error}
	<div class="container mx-auto py-16 px-3 sm:px-6 lg:px-8">
		<div class="flex items-center justify-center py-24">
			<div class="text-center">
				<div class="rounded-lg bg-destructive/10 border border-destructive/20 p-6 max-w-md">
					<Package class="h-16 w-16 text-destructive mx-auto mb-4" />
					<h3 class="text-lg font-semibold text-destructive mb-2">App Not Found</h3>
					<p class="text-muted-foreground mb-4">{error}</p>
					<button
						onclick={retryLoad}
						class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 w-full"
					>
						Try Again
					</button>
				</div>
			</div>
		</div>
	</div>
{:else if app}
	<div class="container mx-auto px-3 sm:px-6 lg:px-8 pt-4 md:pt-[18px] pb-24">
		<!-- App Header: icon + title row (name + platform pills on right) + author/timestamp row -->
		<div class="app-header flex items-start gap-4 sm:gap-6 mb-6">
			<AppPic
				iconUrl={app.icon}
				name={app.name}
				identifier={app.dTag}
				size="2xl"
				className="app-icon-responsive flex-shrink-0"
			/>

			<div class="app-info flex-1 min-w-0">
				<!-- Title row: app name + platform pills (desktop: next to each other; mobile: pills to the right) -->
				<div class="app-name-row flex items-start gap-3 mb-2 sm:mb-3">
					<h1
						class="app-name text-[1.5rem] sm:text-4xl font-black min-w-0"
						style="color: hsl(var(--white));"
					>
						{app.name}
					</h1>
					<div
						class="platforms-row platforms-scroll flex items-start gap-2 flex-shrink-0 overflow-x-auto scrollbar-hide min-w-0"
						use:wheelScroll
					>
						{#each platforms as platform}
							<div class="platform-pill flex items-center gap-2 flex-shrink-0 self-start">
								<svg class="platform-icon" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.463 11.463 0 00-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 003 18h18a10.78 10.78 0 00-3.4-8.52zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
									/>
								</svg>
								<span
									class="platform-text text-sm whitespace-nowrap"
									style="color: hsl(var(--white66));"
								>
									{platform.charAt(0).toUpperCase() + platform.slice(1)}
								</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Author + timestamp row -->
				<div class="detail-publisher-row detail-publisher-row-in-app">
					{#if !isZapstorePublisher || isZapstoreOfficialAppId}
						<a href={publisherUrl} class="detail-publisher-link">
							<ProfilePic
								pictureUrl={publisherPictureUrl}
								name={publisherNameForPic}
								pubkey={app.pubkey}
								size="sm"
							/>
							<span class="detail-publisher-name">By {publisherName}</span>
						</a>
					{/if}
					{#if !publishedByDeveloper}
						<div class="detail-indexed-by">
							<Index size={24} className="detail-indexed-icon flex-shrink-0" />
							<span class="detail-publisher-name">Indexed</span>
						</div>
					{/if}
					{#if app.createdAt}
						<Timestamp timestamp={app.createdAt} size="xs" className="detail-publisher-timestamp" />
					{/if}
				</div>

			</div>
		</div>

		<!-- Screenshots -->
		{#if app.images && app.images.length > 0}
			<div class="screenshots-scroll mb-4" use:wheelScroll>
				<div class="screenshots-content">
					{#each app.images as image, index (index)}
						<button
							type="button"
							onclick={() => openCarousel(index)}
							class="screenshot-thumb relative flex-shrink-0 overflow-hidden cursor-pointer group focus:outline-none"
						>
							{#if !thumbsLoaded.has(index)}
								<div class="screenshot-skeleton">
									<SkeletonLoader />
								</div>
							{/if}
							<img
								src={image}
								alt="Screenshot {index + 1}"
								class="screenshot-img"
								class:loaded={thumbsLoaded.has(index)}
								loading="lazy"
								onload={() => {
									thumbsLoaded.add(index);
								}}
							/>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Description -->
		<div class="description-container" class:expanded={descriptionExpanded}>
			<div class="app-description prose prose-invert max-w-none" use:checkTruncation>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html renderMarkdown(app.description)}
			</div>
			{#if isTruncated && !descriptionExpanded}
				<div class="description-fade"></div>
				<button type="button" class="read-more-btn" onclick={() => (descriptionExpanded = true)}>
					Read More
				</button>
			{/if}
		</div>

		<!-- Info Panels -->
		<div class="info-panels-container mb-4">
			<div class="info-panels-main">
				<!-- Security Panel (opens Security modal on click) -->
				<button
					type="button"
					class="info-panel panel-security text-left w-full"
					onclick={() => (securityModalOpen = true)}
				>
					<div class="panel-header">
						<span class="text-base font-semibold" style="color: hsl(var(--foreground));"
							>Security</span
						>
					</div>
					<div class="panel-list flex flex-col">
						<!-- 1. Published by Developer (check) or Published by Indexer (line) -->
						<div
							class="panel-list-item flex items-center gap-2"
							style="color: hsl(var(--white66)); opacity: 1; transform: scale(1); transform-origin: left;"
						>
							{#if publishedByDeveloper}
								<svg
									class="security-check flex-shrink-0"
									width="20"
									height="14"
									viewBox="-1.5 -1.5 20 14"
									fill="none"
									style="overflow: visible;"
								>
									<path
										d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z"
										stroke="hsl(var(--blurpleColor))"
										stroke-width="2.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span class="text-sm">Published by Developer</span>
							{:else}
								<span class="security-line flex-shrink-0" aria-hidden="true"></span>
								<span class="text-sm">Published by Indexer</span>
							{/if}
						</div>
						<!-- 2. Open source (check) or Closed-source (line) — step down -->
						<div
							class="panel-list-item flex items-center gap-2"
							style="color: hsl(var(--white66)); opacity: 0.78; transform: scale(0.96); transform-origin: left;"
						>
							{#if hasRepository}
								<svg
									class="security-check flex-shrink-0"
									width="20"
									height="14"
									viewBox="-1.5 -1.5 20 14"
									fill="none"
									style="overflow: visible;"
								>
									<path
										d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z"
										stroke="hsl(var(--blurpleColor))"
										stroke-width="2.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span class="text-sm">Open source</span>
							{:else}
								<span class="security-line flex-shrink-0" aria-hidden="true"></span>
								<span class="text-sm">Closed-source</span>
							{/if}
						</div>
						<!-- 3. Trusted Catalog — step down again -->
						<div
							class="panel-list-item panel-list-item-last flex items-center gap-2"
							style="color: hsl(var(--white66)); opacity: 0.56; transform: scale(0.92); transform-origin: left;"
						>
							<svg
								class="security-check flex-shrink-0"
								width="20"
								height="14"
								viewBox="-1.5 -1.5 20 14"
								fill="none"
								style="overflow: visible;"
							>
								<path
									d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z"
									stroke="hsl(var(--blurpleColor))"
									stroke-width="2.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							<span class="text-sm">Trusted Catalog</span>
						</div>
					</div>
				</button>

				<!-- Releases Panel (entire panel opens modal) -->
				<button
					type="button"
					class="info-panel panel-releases text-left w-full"
					onclick={() => (releasesModalOpen = true)}
				>
					<div class="panel-header">
						<span class="text-base font-semibold" style="color: hsl(var(--foreground));"
							>Releases</span
						>
					</div>
					<div class="panel-list flex flex-col">
						{#if releasesLoading}
							<p class="text-sm" style="color: hsl(var(--white33));">Loading releases...</p>
						{:else if releases.length === 0}
							<p class="text-sm" style="color: hsl(var(--white33));">No releases found.</p>
						{:else}
							{#each releases.slice(0, 3) as release, i (release.id ?? `release-${i}`)}
								{@const preview = releaseNotesPreview(release.notes)}
								<div
									class="panel-list-item flex items-center gap-2 min-w-0 w-full text-left"
									class:panel-list-item-last={i === Math.min(3, releases.length) - 1}
									style="opacity: {1 - i * 0.22}; transform: scale({1 -
										i * 0.04}); transform-origin: left;"
								>
									<span
										class="text-sm font-medium flex-shrink-0"
										style="color: hsl(var(--white33));"
									>
										{trimVersion(release.version)}
									</span>
									<span
										class="text-sm truncate"
										style="color: hsl(var(--white66)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
									>
										{preview || 'No notes'}
									</span>
								</div>
							{/each}
						{/if}
					</div>
				</button>
			</div>
		</div>

		<!-- Social tabs -->
		<div class="mb-8">
			<SocialTabs
				{app}
				version={latestRelease?.version}
				mainEventIds={[app?.id, ...(releases ?? []).map((r) => r.id)].filter(Boolean)}
				{publisherProfile}
				{signEvent}
				getAppSlug={(p, d) => app?.naddr ?? encodeAppNaddr(p, d)}
				pubkeyToNpub={(pk) => nip19.npubEncode(pk)}
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
				{zapperProfiles}
				{comments}
				{commentsLoading}
				{commentsError}
				{zapsLoading}
				{profiles}
				{profilesLoading}
				{labelEntries}
				{labelsLoading}
				{searchProfiles}
				{searchEmojis}
				onCommentSubmit={handleCommentSubmit}
				onZapPending={handleZapPending}
				onZapPendingClear={handleZapPendingClear}
				onZapReceived={handleBottomBarZapUpdate}
				onGetStarted={() => (getStartedModalOpen = true)}
				detailsShareLink={app?.dTag
					? `${SITE_URL}/apps/${app.dTag}`
					: app?.naddr
						? `${SITE_URL}/apps/${app.naddr}`
						: ''}
			/>
		</div>

		<!-- Screenshot Carousel Modal -->
		{#if carouselOpen && app.images && app.images.length > 0}
			<div
				class="carousel-modal bg-overlay"
				onclick={closeCarousel}
				role="dialog"
				aria-modal="true"
				aria-label="Screenshot carousel"
				tabindex="-1"
			>
				<button
					type="button"
					onclick={closeCarousel}
					class="carousel-close-btn"
					aria-label="Close carousel"
				>
					<X class="h-5 w-5" />
				</button>

				{#if app.images.length > 1}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							prevImage();
						}}
						class="carousel-nav-btn carousel-nav-prev"
						aria-label="Previous image"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M15 18l-6-6 6-6" />
						</svg>
					</button>

					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							nextImage();
						}}
						class="carousel-nav-btn carousel-nav-next"
						aria-label="Next image"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M9 18l6-6-6-6" />
						</svg>
					</button>
				{/if}

				<div class="carousel-content" onclick={(e) => e.stopPropagation()}>
					<div class="carousel-image-wrapper">
						{#if !carouselImageLoaded}
							<div class="carousel-skeleton">
								<div class="animate-pulse bg-gray-700 w-full h-full"></div>
							</div>
						{/if}
						<img
							src={app.images[currentImageIndex]}
							alt="Screenshot {currentImageIndex + 1}"
							class="carousel-image"
							class:loaded={carouselImageLoaded}
							onload={() => (carouselImageLoaded = true)}
						/>
					</div>

					{#if app.images.length > 1}
						<div class="carousel-dots">
							{#each app.images as _, index (index)}
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										currentImageIndex = index;
										carouselImageLoaded = false;
									}}
									class="carousel-dot {index === currentImageIndex ? 'active' : ''}"
									aria-label="Go to screenshot {index + 1}"
								></button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Releases Modal -->
		{#if app}
			<Modal
				bind:open={releasesModalOpen}
				ariaLabel="Releases"
				maxHeight={80}
				fillHeight={true}
				title="Releases"
				description="Application details & Release Notes"
				class="releases-modal"
			>
				<div class="releases-modal-inner">
					<div class="releases-modal-divider"></div>

					<h3 class="releases-section-heading">DETAILS</h3>
					<div class="releases-details-rows">
						<div class="releases-detail-row">
							<span class="releases-detail-label">Repository</span>
							<span class="releases-detail-value">
								{#if app.repository}
									<a
										href={app.repository}
										target="_blank"
										rel="noopener noreferrer"
										class="meta-link">{stripUrlForDisplay(app.repository)}</a
									>
								{:else}
									<span class="meta-muted">—</span>
								{/if}
							</span>
						</div>
						<div class="releases-detail-row">
							<span class="releases-detail-label">Website</span>
							<span class="releases-detail-value">
								{#if app.url}
									<a href={app.url} target="_blank" rel="noopener noreferrer" class="meta-link"
										>{stripUrlForDisplay(app.url)}</a
									>
								{:else}
									<span class="meta-muted">—</span>
								{/if}
							</span>
						</div>
						<div class="releases-detail-row">
							<span class="releases-detail-label">App identifier</span>
							<span class="releases-detail-value">{app.dTag ?? '—'}</span>
						</div>
						<div class="releases-detail-row">
							<span class="releases-detail-label">Naddr</span>
							<span class="releases-detail-value releases-naddr-row">
								<span class="releases-naddr-text"
									>{app.naddr ? middleTrimNaddr(app.naddr) : '—'}</span
								>
								{#if app.naddr}
									<button
										type="button"
										class="releases-naddr-copy"
										onclick={copyNaddr}
										aria-label="Copy naddr"
									>
										{#if naddrCopied}
											<span class="releases-naddr-copy-check"
												><Check
													variant="outline"
													size={14}
													strokeWidth={2.8}
													color="hsl(var(--blurpleLightColor))"
												/></span
											>
										{:else}
											<Copy variant="outline" size={16} color="hsl(var(--white66))" />
										{/if}
									</button>
								{/if}
							</span>
						</div>
					</div>

					<div class="releases-modal-divider"></div>

					<h3 class="releases-section-heading">RELEASE NOTES</h3>
					<div class="releases-modal-list">
						{#each releases as release, i (release.id ?? `release-${i}`)}
							{@const releaseId = release.id ?? `release-${i}`}
							{@const notesExpanded = expandedReleaseId === releaseId}
							<div class="release-panel">
								<div class="release-panel-row release-panel-head">
									<span class="release-panel-version" style="color: hsl(var(--foreground));"
										>{trimVersion(release.version)}</span
									>
									<Timestamp
										timestamp={release.createdAt}
										size="sm"
										className="release-timestamp"
									/>
								</div>
								<div class="release-panel-divider"></div>
								<div class="release-panel-row release-panel-notes">
									{#if release.notes}
										<div class="release-notes-block">
											<div class="release-notes-text" class:collapsed={!notesExpanded}>
												<div class="release-notes prose prose-invert max-w-none">
													<!-- eslint-disable-next-line svelte/no-at-html-tags -->
													{@html renderMarkdown(release.notes)}
												</div>
											</div>
											<button
												type="button"
												class="release-notes-toggle"
												onclick={(e) => {
													e.stopPropagation();
													toggleReleaseNotesExpanded(releaseId);
												}}
											>
												{notesExpanded ? 'Show less' : 'Read more'}
											</button>
										</div>
									{:else}
										<p class="text-sm meta-muted">No release notes.</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</Modal>
		{/if}

		<!-- Security Modal (publisher, repository, catalog; bigger icons; no footer text) -->
		{#if app}
			<Modal
				bind:open={securityModalOpen}
				ariaLabel="Security"
				maxHeight={72}
				title="Security"
				description="More security metrics coming soon."
				class="security-modal"
			>
				<div class="security-modal-inner">
					<div class="security-modal-divider"></div>

					<!-- Published by Developer/Indexer -->
					<div class="security-item-content security-item-row">
						<div class="security-icon-box">
							{#if publishedByDeveloper}
								<svg
									class="security-check-icon"
									width="20"
									height="20"
									viewBox="-1 1 26 22"
									fill="none"
									style="overflow: visible;"
								>
									<path
										d="M8 17L2 11L8 16.5L22 3L8 17Z"
										stroke="hsl(var(--blurpleColor))"
										stroke-width="2.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else}
								<span class="security-line" aria-hidden="true"></span>
							{/if}
						</div>
						<div class="security-item-body">
							<h3 class="security-item-title">
								{publishedByDeveloper ? 'Published by Developer' : 'Published by Indexer'}
							</h3>
							<p class="security-item-description">
								{#if publishedByDeveloper}
									This app is published directly by its developer, ensuring authenticity and direct
									updates from the source.
								{:else}
									This app is published by a Zapstore indexer. While vetted, it's not directly from
									the developer.
								{/if}
							</p>
							<div class="security-profile-row">
								<span class="security-inline-label">Profile</span>
								<div class="security-profile">
									<ProfilePic
										pictureUrl={publisherPictureUrl}
										name={publisherNameForPic}
										pubkey={app.pubkey}
										size="xs"
									/>
									<span class="security-profile-name">{publisherName}</span>
								</div>
							</div>
						</div>
					</div>
					<div class="security-modal-divider"></div>

					<!-- Open source/Closed-source -->
					<div class="security-item-content security-item-row">
						<div class="security-icon-box">
							{#if hasRepository}
								<svg
									class="security-check-icon"
									width="20"
									height="20"
									viewBox="-1 1 26 22"
									fill="none"
									style="overflow: visible;"
								>
									<path
										d="M8 17L2 11L8 16.5L22 3L8 17Z"
										stroke="hsl(var(--blurpleColor))"
										stroke-width="2.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else}
								<span class="security-line" aria-hidden="true"></span>
							{/if}
						</div>
						<div class="security-item-body">
							<h3 class="security-item-title">{hasRepository ? 'Open Source' : 'Closed Source'}</h3>
							<p class="security-item-description">
								{#if hasRepository}
									The source code is publicly available for review, allowing community audits and
									transparency.
								{:else}
									The source code is not publicly available. Exercise caution and verify the
									publisher's reputation.
								{/if}
							</p>
							<div class="security-profile-row">
								<span class="security-inline-label">Repository</span>
								{#if hasRepository && app.repository}
									<a
										href={app.repository}
										target="_blank"
										rel="noopener noreferrer"
										class="security-profile-link">{stripUrlForDisplay(app.repository)}</a
									>
								{:else}
									<span class="security-profile-muted">—</span>
								{/if}
							</div>
						</div>
					</div>
					<div class="security-modal-divider"></div>

					<!-- Trusted Catalog -->
					<div class="security-item-content security-item-row">
						<div class="security-icon-box">
							<svg
								class="security-check-icon"
								width="20"
								height="20"
								viewBox="-1 1 26 22"
								fill="none"
								style="overflow: visible;"
							>
								<path
									d="M8 17L2 11L8 16.5L22 3L8 17Z"
									stroke="hsl(var(--blurpleColor))"
									stroke-width="2.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</div>
						<div class="security-item-body">
							<h3 class="security-item-title">Trusted Catalog</h3>
							<p class="security-item-description">
								This app is listed in the official Zapstore catalog, which is curated and maintained
								by the Zapstore team.
							</p>
							{#each catalogProfiles as catalogProfile (catalogProfile.pubkey)}
								<div class="security-profile-row">
									<span class="security-inline-label">Catalog</span>
									<div class="security-profile">
										<ProfilePic
											pictureUrl={catalogProfile.picture}
											name={catalogProfile?.displayName ?? catalogProfile?.name}
											pubkey={catalogProfile.pubkey}
											size="xs"
										/>
										<span class="security-profile-name"
											>{catalogProfile?.displayName ?? catalogProfile?.name ?? ''}</span
										>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</Modal>
		{/if}

		<!-- Download Modal -->
		{#if app}
			<DownloadModal
				bind:open={downloadModalOpen}
				{app}
				isZapstore={app.pubkey ===
					'78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55f2fe2202182'}
			/>
		{/if}
	</div>

	<!-- Bottom Bar: shown for everyone; guests see "Get started to comment" and can zap with anon keypair. -->
	{#if app}
		{@const zapTarget = app
			? {
					name: app.name,
					pubkey: app.pubkey,
					dTag: app.dTag,
					id: latestRelease?.id ?? app.id,
					ownContentEventId: app.id,
					pictureUrl: publisherPictureUrl
				}
			: null}
		<BottomBar
			appName={app.name || ''}
			{publisherName}
			contentType="app"
			{zapTarget}
			{otherZaps}
			isSignedIn={getIsSignedIn()}
			onGetStarted={() => (getStartedModalOpen = true)}
			{getCurrentPubkey}
			{searchProfiles}
			{searchEmojis}
			{signEvent}
			oncommentSubmit={(e) =>
				handleCommentSubmit({
					text: e.text,
					emojiTags: e.emojiTags,
					mentions: e.mentions,
					mediaUrls: e.mediaUrls,
					parentId: undefined
				})}
			onzapReceived={handleBottomBarZapUpdate}
			onZapPending={handleZapPending}
			onZapPendingClear={handleZapPendingClear}
			onLabelPublished={() => {
				loadLabels();
			}}
			onOwnContentDeleted={() => {
				goto(resolve('/apps'));
			}}
		/>
	{/if}

	<!-- Onboarding modals (for Get Started flow from BottomBar) -->
	<GetStartedModal bind:open={getStartedModalOpen} onconnected={handleGetStartedConnected} />
	<SpinKeyModal
		bind:open={spinKeyModalOpen}
		profileName={onboardingProfileName}
		zIndex={55}
		onspinComplete={handleSpinComplete}
		onuseExistingKey={handleUseExistingKey}
	/>
	<OnboardingBuildingModal bind:open={onboardingBuildingModalOpen} zIndex={56} />
{/if}

<style>
	/* ── Publisher info row (replaces DetailHeader) ── */
	.detail-publisher-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 1.25rem;
	}

	.detail-publisher-row-in-app {
		padding-bottom: 0;
	}

	/* Desktop: author + timestamp next to each other with gap (author link must not grow) */
	@media (min-width: 768px) {
		.detail-publisher-row-in-app {
			justify-content: flex-start;
			gap: 1rem;
		}
		.detail-publisher-row-in-app .detail-publisher-link {
			flex: 0 0 auto;
		}
	}

	/* Title row: mobile = pills to the right; desktop = pills next to name with gap */
	.app-name-row {
		justify-content: space-between;
	}
	@media (min-width: 768px) {
		.app-name-row {
			justify-content: flex-start;
			gap: 1.375rem;
			/* Nudge title + pills down vs app icon on desktop */
			padding-top: 6px;
		}
	}

	/* Slight offset above the pill strip (outside the pill), not inside .platform-pill */
	.platforms-row {
		padding-top: 0px;
	}
	@media (min-width: 640px) {
		.platforms-row {
			padding-top: 2px;
		}
	}
	@media (min-width: 768px) {
		.platforms-row {
			padding-top: 4px;
		}
	}

	.detail-publisher-link {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		min-width: 0;
		overflow: hidden;
		transition: opacity 0.15s ease;
	}

	.detail-publisher-link:hover {
		opacity: 0.8;
	}

	.detail-publisher-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.detail-publisher-timestamp) {
		color: hsl(var(--white33)) !important;
		flex-shrink: 0;
	}

	/* Info panels container */
	.info-panels-container {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.info-panels-main {
		display: flex;
		gap: 12px;
		align-items: stretch;
	}

	.panel-list-item {
		padding: 1px 0;
	}

	.panel-list-item-last {
		padding-top: 0;
		padding-bottom: 0;
	}

	.panel-header {
		margin-bottom: 4px;
	}

	.panel-security {
		flex: 1.618;
		min-width: 0;
	}

	.security-modal-inner {
		padding: 0;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
	}

	.security-modal-divider {
		width: 100%;
		height: 1px;
		background-color: hsl(var(--white16));
		flex-shrink: 0;
	}

	.security-item-content {
		flex-shrink: 0;
	}

	.security-item-row {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 16px;
	}

	@media (min-width: 768px) {
		.security-item-row {
			padding: 20px;
		}
	}

	.security-icon-box {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--white8));
		border-radius: 12px;
		overflow: visible;
	}

	.security-check,
	.security-check-icon {
		overflow: visible;
	}

	.security-check-icon {
		width: 20px;
		height: 20px;
	}

	.security-line {
		display: inline-block;
		width: 20px;
		height: 2.8px;
		min-height: 2.8px;
		background-color: hsl(var(--white33));
		border-radius: 1.4px;
	}

	.security-item-body {
		flex: 1;
		min-width: 0;
	}

	.security-item-title {
		font-size: 1.125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem 0;
	}

	.security-item-description {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--white66));
	}

	.security-profile-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.security-inline-label {
		flex-shrink: 0;
		padding-right: 0.5rem;
		color: hsl(var(--white33));
	}

	.security-profile :global(button),
	.security-profile :global(.profile-pic) {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		min-width: 20px;
		min-height: 20px;
	}

	.security-profile {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.security-profile-name {
		font-size: 0.875rem;
		color: hsl(var(--white));
		font-weight: 500;
	}

	.security-profile-muted {
		font-size: 0.875rem;
		color: hsl(var(--white33));
	}

	.security-profile-link {
		font-size: 0.875rem;
		color: hsl(var(--blurpleLightColor));
		text-decoration: none;
		font-weight: 500;
		word-break: break-all;
	}

	.security-profile-link:hover {
		text-decoration: underline;
	}

	.panel-releases {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	@media (min-width: 768px) {
		.panel-security {
			flex: 1;
		}

		.panel-releases {
			flex: 1;
		}
	}

	.info-panel {
		background-color: hsl(var(--white8));
		border-radius: 16px;
		padding: 8px 16px 10px;
		cursor: pointer;
	}

	/*
  Responsive install buttons (commented out with Download buttons)
  .install-btn-mobile {
    display: inline-flex;
  }

  .install-btn-desktop {
    display: none;
  }

  @media (min-width: 768px) {
    .install-btn-mobile {
      display: none;
    }

    .install-btn-desktop {
      display: inline-flex;
    }
  }
  */

	/* Responsive app icon */
	:global(.app-icon-responsive) {
		width: 80px !important;
		height: 80px !important;
		min-width: 80px !important;
		min-height: 80px !important;
	}

	@media (min-width: 640px) {
		:global(.app-icon-responsive) {
			width: 96px !important;
			height: 96px !important;
			min-width: 96px !important;
			min-height: 96px !important;
		}
	}

	/* Screenshots */
	.screenshots-scroll {
		margin-left: -1rem;
		margin-right: -1rem;
		padding-left: 1rem;
		padding-right: 1rem;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-ms-overflow-style: none;
		mask-image: linear-gradient(
			to right,
			transparent 0%,
			black 1rem,
			black calc(100% - 1rem),
			transparent 100%
		);
		-webkit-mask-image: linear-gradient(
			to right,
			transparent 0%,
			black 1rem,
			black calc(100% - 1rem),
			transparent 100%
		);
	}

	.screenshots-scroll::-webkit-scrollbar {
		display: none;
	}

	@media (min-width: 640px) {
		.screenshots-scroll {
			margin-left: -1.5rem;
			margin-right: -1.5rem;
			padding-left: 1.5rem;
			padding-right: 1.5rem;
			mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 1.5rem,
				black calc(100% - 1.5rem),
				transparent 100%
			);
			-webkit-mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 1.5rem,
				black calc(100% - 1.5rem),
				transparent 100%
			);
		}
	}

	@media (min-width: 1024px) {
		.screenshots-scroll {
			margin-left: -2rem;
			margin-right: -2rem;
			padding-left: 2rem;
			padding-right: 2rem;
			mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 2rem,
				black calc(100% - 2rem),
				transparent 100%
			);
			-webkit-mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 2rem,
				black calc(100% - 2rem),
				transparent 100%
			);
		}
	}

	.screenshots-content {
		display: flex;
		gap: 12px;
		padding-bottom: 8px;
	}

	.screenshot-thumb {
		width: 80px;
		aspect-ratio: 9 / 19.5;
		border-radius: 12px;
		background-color: hsl(var(--gray33));
		border: 0.33px solid hsl(var(--white16));
	}

	@media (min-width: 640px) {
		.screenshot-thumb {
			width: 96px;
			border-radius: 16px;
		}
	}

	.screenshot-skeleton {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.screenshot-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.screenshot-img.loaded {
		opacity: 1;
	}

	/* Description */
	.description-container {
		position: relative;
		margin-bottom: 1rem;
		margin-top: -0.25rem;
	}

	.description-container:not(.expanded) .app-description {
		max-height: 120px;
		overflow: hidden;
	}

	.description-container.expanded .app-description {
		max-height: none;
	}

	.app-description {
		line-height: 1.5;
		color: hsl(var(--foreground) / 0.85);
	}

	.app-description :global(p) {
		font-size: 0.9375rem;
		margin-top: 0.5em;
		margin-bottom: 0.5em;
	}

	.app-description :global(p:first-child) {
		margin-top: 0;
	}

	.app-description :global(p:last-child) {
		margin-bottom: 0;
	}

	@media (min-width: 768px) {
		.description-container {
			margin-top: -0.4375rem;
			margin-bottom: 1.0625rem;
		}

		.app-description :global(p) {
			font-size: 1.0625rem;
		}

		.description-container:not(.expanded) .app-description {
			max-height: 150px;
		}
	}

	.description-fade {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 120px;
		background: linear-gradient(to bottom, transparent, hsl(var(--background)));
		pointer-events: none;
	}

	/* Description Read More: left-aligned so no jump on hover (same as release notes) */
	.description-container .read-more-btn {
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

	.description-container .read-more-btn:hover {
		transform: scale(1.025);
	}

	.description-container .read-more-btn:active {
		transform: scale(0.98);
	}

	/* Releases modal: single scroll (no nested scroll); content flows in modal-content */
	.releases-modal-inner {
		display: block;
		padding: 0;
	}

	.releases-section-heading {
		font-size: 12px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: hsl(var(--white33));
		margin: 0;
		padding: 12px 16px 12px;
	}

	@media (min-width: 768px) {
		.releases-section-heading {
			padding: 16px 20px 12px;
		}
	}

	.releases-details-rows {
		padding: 0 16px 12px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	@media (min-width: 768px) {
		.releases-details-rows {
			padding: 0 20px 16px;
		}
	}

	.releases-detail-row {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		font-size: 0.875rem;
		min-width: 0;
	}

	.releases-detail-label {
		flex-shrink: 0;
		width: 6.5rem;
		color: hsl(var(--white66));
	}

	.releases-naddr-row .releases-naddr-text {
		color: hsl(var(--white66));
	}

	.releases-detail-value {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.releases-naddr-row {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.releases-naddr-text {
		font-size: 0.875rem;
		word-break: break-all;
	}

	.releases-naddr-copy {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		margin: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: hsl(var(--white66));
		transition: color 0.15s ease;
	}

	.releases-naddr-copy:hover {
		color: hsl(var(--white));
	}

	.releases-naddr-copy-check {
		display: flex;
		color: hsl(var(--blurpleLightColor));
		animation: releasesPopIn 0.3s ease-out;
	}

	@keyframes releasesPopIn {
		0% {
			transform: scale(0);
		}
		50% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	.meta-muted {
		color: hsl(var(--white33));
	}

	.releases-modal-divider {
		flex-shrink: 0;
		width: 100%;
		height: 1px;
		background-color: hsl(var(--white16));
	}

	.releases-modal-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0 16px 16px;
	}

	@media (min-width: 768px) {
		.releases-modal-list {
			padding: 0 20px 16px;
		}
	}

	.release-panel {
		background: hsl(var(--white4));
		border-radius: 12px;
		padding: 0 0 12px 0;
		overflow: visible;
		flex-shrink: 0;
	}

	.release-panel-row {
		font-size: 0.875rem;
	}

	.release-panel-row.release-panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0 16px;
		min-height: 48px;
	}

	@media (min-width: 768px) {
		.release-panel-row.release-panel-head {
			padding: 0 20px;
		}
	}

	.release-panel-row.release-panel-notes {
		display: block;
		padding: 12px 16px 6px;
		overflow: visible;
	}

	@media (min-width: 768px) {
		.release-panel-row.release-panel-notes {
			padding: 12px 20px 6px;
		}
	}

	.release-panel-divider {
		height: 1px;
		background-color: hsl(var(--white16));
		width: 100%;
	}

	.release-panel-version {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
	}

	.meta-link {
		color: hsl(var(--blurpleLightColor));
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta-link:hover {
		text-decoration: underline;
	}

	.release-notes-block {
		display: block;
		isolation: isolate;
	}

	.release-notes-text {
		overflow: hidden;
		display: block;
	}

	.release-notes-text.collapsed {
		max-height: 120px;
		overflow: hidden;
		contain: layout style;
		padding-bottom: 42px;
		margin-bottom: -42px;
		pointer-events: none;
		-webkit-mask-image: linear-gradient(to bottom, black 0, black 58%, transparent 100%);
		mask-image: linear-gradient(to bottom, black 0, black 58%, transparent 100%);
	}

	.release-notes {
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--foreground) / 0.9);
		margin: 0;
		padding-top: 8px;
	}

	.release-notes :global(p:first-child) {
		margin-top: 0;
	}

	.release-notes :global(p:last-child) {
		margin-bottom: 0;
	}

	.release-notes :global(ul),
	.release-notes :global(ol) {
		padding-left: 1.25em;
	}

	.release-notes :global(h1),
	.release-notes :global(h2),
	.release-notes :global(h3),
	.release-notes :global(h4),
	.release-notes :global(h5),
	.release-notes :global(h6) {
		font-size: 0.9375rem;
		font-weight: 600;
		margin-top: 0.75em;
		margin-bottom: 0.25em;
	}

	.release-notes :global(h1:first-child),
	.release-notes :global(h2:first-child),
	.release-notes :global(h3:first-child) {
		margin-top: 0;
	}

	.release-notes :global(code) {
		font-size: 0.8125rem;
		padding: 0.125em 0.3em;
		border-radius: 4px;
		background-color: hsl(var(--white8));
	}

	.release-notes :global(pre) {
		font-size: 0.8125rem;
		padding: 0.75em 1em;
		border-radius: 8px;
		background-color: hsl(var(--white8));
		overflow-x: auto;
	}

	.release-notes :global(pre code) {
		padding: 0;
		background: none;
	}

	.release-notes-text:not(.collapsed) {
		padding-bottom: 2px;
	}

	.release-notes-toggle {
		position: relative;
		z-index: 1;
		display: inline-block;
		margin-top: 10px;
		padding: 0 14px;
		min-height: 32px;
		line-height: 32px;
		background-color: hsl(0 0% 26%); /* lighter gray, 100% opacity */
		border: none;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.release-notes-toggle:hover {
		transform: scale(1.02);
	}

	.release-notes-toggle:active {
		transform: scale(0.98);
	}

	/* Same gap/alignment as .detail-publisher-link; icon slightly under ProfilePic sm (28px) */
	.detail-indexed-by {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
		min-width: 0;
	}

	.detail-indexed-icon {
		display: block;
	}

	.platform-pill {
		height: 32px;
		padding: 0 0.875rem 0 0.5rem;
		border-radius: 9999px;
		background-color: hsl(var(--white8));
		box-sizing: border-box;
	}

	.platform-icon {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		color: hsl(var(--white33));
	}

	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}

	/* Carousel Modal */
	.carousel-modal {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.carousel-close-btn {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 10;
		padding: 8px;
		border-radius: 50%;
		background-color: hsl(var(--white16));
		color: white;
		border: none;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.carousel-close-btn:hover {
		background-color: hsl(var(--white33));
	}

	.carousel-nav-btn {
		position: absolute;
		z-index: 10;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background-color: hsl(var(--white16));
		color: white;
		border: none;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.carousel-nav-btn:hover {
		background-color: hsl(var(--white33));
	}

	.carousel-nav-prev {
		left: 16px;
		padding-right: 1px;
	}

	.carousel-nav-next {
		right: 16px;
		padding-left: 1px;
	}

	.carousel-content {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		max-width: 90vw;
		max-height: 90vh;
	}

	.carousel-image-wrapper {
		position: relative;
		max-width: 100%;
		max-height: calc(90vh - 48px);
		border-radius: 8px;
		border: 0.33px solid hsl(var(--white16));
		overflow: hidden;
		background-color: hsl(var(--gray33));
		box-shadow: 0 0 80px 20px hsl(var(--black33));
	}

	@media (min-width: 768px) {
		.carousel-image-wrapper {
			border-radius: 16px;
		}
	}

	.carousel-skeleton {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.carousel-image {
		display: block;
		max-width: 100%;
		max-height: calc(90vh - 48px);
		object-fit: contain;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.carousel-image.loaded {
		opacity: 1;
	}

	.carousel-dots {
		display: flex;
		gap: 8px;
		padding: 8px 0;
	}

	.carousel-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: hsl(var(--white33));
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.carousel-dot:hover {
		background-color: hsl(var(--white66));
	}

	.carousel-dot.active {
		background-color: white;
		transform: scale(1.2);
	}
</style>
