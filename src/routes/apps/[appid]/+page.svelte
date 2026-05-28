<script lang="js">
	import { onMount } from 'svelte';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { X } from 'lucide-svelte';
	import ZappyError from '$lib/components/common/ZappyError.svelte';
	import { parseZapReceipt, publishComment } from '$lib/purpleweb';
	import { encodeAppNaddr, decodeNaddr } from '$lib/nostr';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import { nip19 } from 'nostr-tools';
	import { EVENT_KINDS } from '$lib/config';
	import { wheelScroll } from '$lib/actions/wheelScroll.js';
	import { wheelScrollPassthrough } from '$lib/actions/wheelScrollPassthrough.js';
	import AppPic from '$lib/components/common/AppPic.svelte';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
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
	import { markdownToPlainTextLine, renderMarkdown } from '$lib/utils/markdown';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { SITE_URL, SITE_ICON } from '$lib/config';
	import Timestamp from '$lib/components/common/Timestamp.svelte';
	import { stripUrlForDisplay } from '$lib/utils/url.js';
	import {
		Copy,
		Check,
		Index,
		ChevronLeft,
		ChevronRight,
		ChevronDown
	} from '$lib/components/icons';
	import DropdownMenu from '$lib/components/common/DropdownMenu.svelte';
	import { createAppDetailQuery, createAppSocialQuery } from '$lib/purpleweb';
	import '$lib/styles/bordered-detail-column.css';
let { data } = $props();
const appid = $derived($page.params.appid ?? '');
const detail = createAppDetailQuery(() => ({
	appid,
	seedApp: data.app,
	seedEvents: data.seedEvents,
	error: data.error
}));
const app = $derived(detail.app);
const searchProfiles = $derived(
	createSearchProfilesFunction(() => getCurrentPubkey(), () => (app?.pubkey ? [app.pubkey] : []))
);
const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));
const error = $derived(detail.error);
const publisherProfile = $derived(detail.publisherProfile);

const appJsonLd = $derived.by(() => {
	const currentApp = app;
	const publisher = publisherProfile;
	return currentApp
		? {
				'@context': 'https://schema.org',
				'@type': 'SoftwareApplication',
				name: currentApp.name,
				description: markdownToPlainTextLine(currentApp.description).slice(0, 160),
				image: currentApp.icon,
				url: `${SITE_URL}/apps/${currentApp.dTag}`,
				operatingSystem: 'Android',
				applicationCategory: 'MobileApplication',
				author: publisher?.displayName || publisher?.name
					? {
							'@type': 'Person',
							name: publisher.displayName || publisher.name,
							url: currentApp.npub ? `${SITE_URL}/profile/${currentApp.npub}` : undefined
						}
					: undefined,
				publisher: { '@type': 'Organization', '@id': `${SITE_URL}/#organization` }
			}
		: null;
});
const latestRelease = $derived(detail.latestRelease);
let _refreshing = $state(false);
	// Description expand state
	let descriptionExpanded = $state(false);
	let isTruncated = $state(false);
	// Screenshot carousel state
	let carouselOpen = $state(false);
	let currentImageIndex = $state(0);
	let carouselImageLoaded = $state(false);
	// Track which thumbnail screenshots have loaded
	let thumbsLoaded = new SvelteSet();
	// Track which thumbnails are landscape (wider than tall) — these get auto width
	let landscapeImages = new SvelteSet();
	// Screenshots horizontal scroll
	let screenshotsScrollContainer = $state(null);
	/** @type {HTMLDivElement | null} */
	let screenshotsScrollWrap = $state(null);
	let screenshotsControlsTop = $state(0);
	let screenshotsControlsLeft = $state(0);
	let screenshotsControlsRight = $state(0);
	let screenshotsScrolledRight = $state(false);
	let screenshotsCanScrollRight = $state(false);
	const SCREENSHOTS_SCROLL_STEP = 260;
	function scrollScreenshots(dir) {
		if (!screenshotsScrollContainer) return;
		screenshotsScrollContainer.scrollBy({
			left: dir * SCREENSHOTS_SCROLL_STEP,
			behavior: 'smooth'
		});
	}
	function updateScreenshotsScrollState() {
		if (!screenshotsScrollContainer) return;
		const { scrollLeft, scrollWidth, clientWidth } = screenshotsScrollContainer;
		screenshotsScrolledRight = scrollLeft > 4;
		screenshotsCanScrollRight = scrollLeft + clientWidth < scrollWidth - 4;
	}
	function handleScreenshotsScroll() {
		updateScreenshotsScrollState();
	}
	$effect(() => {
		const container = screenshotsScrollContainer;
		if (!container) return;
		updateScreenshotsScrollState();
		const observer = new ResizeObserver(() => updateScreenshotsScrollState());
		observer.observe(container);
		return () => observer.disconnect();
	});

	function updateScreenshotsControlsPosition() {
		const wrap = screenshotsScrollWrap;
		const outer = wrap?.closest('.app-detail-outer');
		const frame = wrap?.closest('.app-detail-frame');
		if (!wrap || !outer || !frame) return;
		const wrapRect = wrap.getBoundingClientRect();
		const outerRect = outer.getBoundingClientRect();
		screenshotsControlsTop = wrapRect.top - outerRect.top + wrapRect.height / 2;
		// Position relative to outer's padding edge (absolute containing block), not viewport.
		screenshotsControlsLeft = frame.offsetLeft;
		screenshotsControlsRight = outer.clientWidth - frame.offsetLeft - frame.offsetWidth;
	}

	$effect(() => {
		const wrap = screenshotsScrollWrap;
		if (!wrap || !app?.images?.length) return;
		const frame = wrap.closest('.app-detail-frame');
		updateScreenshotsControlsPosition();
		const scrollEl = wrap.closest('.app-detail-scroll');
		const observer = new ResizeObserver(updateScreenshotsControlsPosition);
		observer.observe(wrap);
		if (frame) observer.observe(frame);
		scrollEl?.addEventListener('scroll', updateScreenshotsControlsPosition, { passive: true });
		window.addEventListener('resize', updateScreenshotsControlsPosition);
		return () => {
			observer.disconnect();
			scrollEl?.removeEventListener('scroll', updateScreenshotsControlsPosition);
			window.removeEventListener('resize', updateScreenshotsControlsPosition);
		};
	});
	// Comments and zaps state (comments may have pending + npub for display)
	let comments = $state([]);
	let commentsLoading = $state(false);
	/** Relay catch-up after Dexie — drives Comments tab spinner without blocking bubbles. */
	let commentsSyncing = $state(false);
	let commentsError = $state('');
	let profiles = $state({});
	let profilesLoading = $state(false);
	let zaps = $state([]);
	let zapsLoading = $state(false);
	let zapperProfiles = new SvelteMap();
	/** @type {Array<{ label: string, pubkeys: string[] }>} */
	let labelEntries = $state([]);
	let labelsLoading = $state(false);
	const releases = $derived(detail.releases);
	const releasesLoading = $derived(detail.releasesLoading);
	let releasesModalOpen = $state(false);
	/** Single expanded release id (null = none). Toggling this one value is reliable in Svelte 5. */
	let expandedReleaseId = $state(null);
	const social = createAppSocialQuery(() => app);
	$effect(() => {
		comments = social.comments;
		commentsLoading = social.commentsLoading;
		commentsSyncing = social.commentsSyncing;
		commentsError = social.commentsError;
		zaps = social.zaps;
		zapsLoading = social.zapsLoading;
		labelEntries = social.labelEntries;
		labelsLoading = social.labelsLoading;
		profiles = social.profiles;
		profilesLoading = social.profilesLoading;
		zapperProfiles.clear();
		for (const [pubkey, profile] of social.zapperProfiles) {
			zapperProfiles.set(pubkey, profile);
		}
	});
	let downloadModalOpen = $state(false);
	let downloadDropdownOpen = $state(false);
	/** @type {HTMLDivElement | null} */
	let downloadDropdownWrapDesktop = $state(null);
	/** @type {HTMLDivElement | null} */
	let downloadDropdownWrapMobile = $state(null);
	const directDownloadUrl = $derived(detail.directDownloadUrl);
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

	$effect(() => {
		if (!downloadDropdownOpen) return;
		function handleClick(/** @type {MouseEvent} */ e) {
			const t = /** @type {Node} */ (e.target);
			const inDesktop = downloadDropdownWrapDesktop?.contains(t);
			const inMobile = downloadDropdownWrapMobile?.contains(t);
			if (!inDesktop && !inMobile) downloadDropdownOpen = false;
		}
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	});

	/**
	 * Fetch an APK from the Blossom CDN with the X-Zapstore-Client header so the
	 * relay backend records this download as originating from the web client.
	 * Falls back to a plain navigation if fetch fails.
	 * @param {string} url
	 */
	async function handleDirectDownload(url) {
		downloadDropdownOpen = false;
		const filename = url.split('/').pop() || 'app.apk';
		try {
			const response = await fetch(url, { headers: { 'X-Zapstore-Client': 'web' } });
			const blob = await response.blob();
			const objectUrl = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = objectUrl;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(objectUrl);
			document.body.removeChild(a);
		} catch {
			window.location.href = url;
		}
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
	const isZapstoreApp = $derived(app?.dTag === 'dev.zapstore.app');
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
		}
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
		try {
			await publishComment(
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
		} catch (err) {
			console.error('Failed to publish comment:', err);
			commentsError =
				err instanceof Error ? err.message : 'Comment could not be published to any relay.';
		}
	}
	onMount(async () => {
		if (!browser) return;
		const pointer = decodeNaddr(appid);
		if (pointer?.kind === EVENT_KINDS.APP_STACK) {
			goto(`/stacks/${appid}`, { replaceState: true });
		}
	});
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
		imageAlt="{app.name} icon"
		url="{SITE_URL}/apps/{app.dTag}"
		type="product"
		author={publisherProfile?.displayName || publisherProfile?.name}
		authorUrl={app.npub ? `${SITE_URL}/profile/${app.npub}` : undefined}
		jsonld={appJsonLd}
	/>
{:else}
	<SeoHead title="App Details — Zapstore" />
{/if}

{#if error}
	<ZappyError message="this app wasn't found." />
{:else if app}
	<div class="app-detail-page" use:wheelScrollPassthrough>
	<div class="app-detail-outer container mx-auto px-0 sm:px-6 lg:px-8">
		<div class="app-detail-frame">
			<div class="app-detail-scroll" data-main-scroll>
		<!-- Mobile only: author + timestamp above the app icon -->
		<div class="detail-publisher-row publisher-mobile-only">
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

		<!-- App Header: icon + title/actions -->
		<div class="app-header flex items-start gap-4 sm:gap-6 mb-6">
			<AppPic
				iconUrl={app.icon}
				name={app.name}
				identifier={app.dTag}
				size="2xl"
				className="app-icon-responsive flex-shrink-0"
			/>

			<div class="app-info flex-1 min-w-0">
				<!-- Name row:
				     Mobile  → just the name
				     Desktop → [name] [pill] ··· [Install] -->
				<div class="app-name-row flex items-center mb-2 sm:mb-3">
					<!-- Left group: name always; pill desktop-only -->
					<div class="app-name-and-pill">
						<h1
							class="app-name text-[1.5rem] sm:text-4xl font-black min-w-0"
							style="color: var(--white);"
						>
							{app.name}
						</h1>
						<!-- Desktop only: pill right next to the name -->
						<div
							class="platforms-row platforms-scroll desktop-pill-wrap flex items-center gap-2 flex-shrink-0 overflow-x-auto scrollbar-hide"
							use:wheelScroll
						>
							{#each platforms as platform (platform)}
								<div class="platform-pill flex items-center gap-2 flex-shrink-0">
									<svg class="platform-icon" viewBox="0 0 24 24" fill="currentColor">
										<path
											d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.463 11.463 0 00-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 003 18h18a10.78 10.78 0 00-3.4-8.52zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
										/>
									</svg>
									<span
										class="platform-text regular14 whitespace-nowrap"
										style="color: var(--white66);"
									>
										{platform.charAt(0).toUpperCase() + platform.slice(1)}
									</span>
								</div>
							{/each}
						</div>
					</div>
					<!-- Desktop only: Download button pushed to the far right -->
					<div
						class="install-btn-desktop download-split-wrap"
						bind:this={downloadDropdownWrapDesktop}
					>
						{#if isZapstoreApp}
							<div class="download-split-btn" role="group">
								<button
									type="button"
									class="download-main download-main--solo"
									onclick={() => {
										downloadModalOpen = true;
									}}
								>
									Download
								</button>
							</div>
						{:else}
							<div class="download-split-btn" role="group">
								<button
									type="button"
									class="download-main"
									onclick={() => {
										downloadModalOpen = true;
										downloadDropdownOpen = false;
									}}
								>
									Download
								</button>
								<div class="download-divider" aria-hidden="true"></div>
								<button
									type="button"
									class="download-chevron"
									aria-label="More download options"
									aria-expanded={downloadDropdownOpen}
									onclick={(e) => {
										e.stopPropagation();
										downloadDropdownOpen = !downloadDropdownOpen;
									}}
								>
									<span class="download-chevron-icon">
										<ChevronDown
											variant="outline"
											size={13}
											strokeWidth={1.6}
											color="var(--white66)"
										/>
									</span>
								</button>
							</div>
							{#if downloadDropdownOpen}
								<DropdownMenu
									class="download-dropdown download-dropdown-desktop"
									itemChevron={true}
								>
									<button
										type="button"
										class="dropdown-item dropdown-item--stacked"
										role="menuitem"
										onclick={() => {
											downloadModalOpen = true;
											downloadDropdownOpen = false;
										}}
									>
										<span class="dropdown-item-body">
											<span class="dropdown-item-title">Via Zapstore</span>
											<span class="dropdown-item-desc">For reliable and secure updates</span>
										</span>
										<span class="item-chevron"
											><ChevronRight
												variant="outline"
												size={12}
												strokeWidth={1.4}
												color="var(--white33)"
											/></span
										>
									</button>
									{#if directDownloadUrl}
										<button
											class="dropdown-item dropdown-item--stacked"
											role="menuitem"
											onclick={() => handleDirectDownload(directDownloadUrl)}
										>
											<span class="dropdown-item-body">
												<span class="dropdown-item-title">Direct Download</span>
												<span class="dropdown-item-desc">Get the {app?.name} APK directly</span>
											</span>
											<span class="item-chevron"
												><ChevronRight
													variant="outline"
													size={12}
													strokeWidth={1.4}
													color="var(--white33)"
												/></span
											>
										</button>
									{/if}
								</DropdownMenu>
							{/if}
						{/if}
					</div>
				</div>

				<!-- Mobile only: pill (left) + install (right) below the name -->
				<div class="app-mobile-actions">
					<div
						class="platforms-row platforms-scroll flex items-center gap-2 flex-shrink-0 overflow-x-auto scrollbar-hide"
						use:wheelScroll
					>
						{#each platforms as platform (platform)}
							<div class="platform-pill flex items-center gap-2 flex-shrink-0">
								<svg class="platform-icon" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.463 11.463 0 00-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 003 18h18a10.78 10.78 0 00-3.4-8.52zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
									/>
								</svg>
								<span
									class="platform-text regular14 whitespace-nowrap"
									style="color: var(--white66);"
								>
									{platform.charAt(0).toUpperCase() + platform.slice(1)}
								</span>
							</div>
						{/each}
					</div>
					<div class="install-btn download-split-wrap" bind:this={downloadDropdownWrapMobile}>
						{#if isZapstoreApp}
							<div class="download-split-btn" role="group">
								<button
									type="button"
									class="download-main download-main--solo"
									onclick={() => {
										downloadModalOpen = true;
									}}
								>
									Download
								</button>
							</div>
						{:else}
							<div class="download-split-btn" role="group">
								<button
									type="button"
									class="download-main"
									onclick={() => {
										downloadModalOpen = true;
										downloadDropdownOpen = false;
									}}
								>
									Download
								</button>
								<div class="download-divider" aria-hidden="true"></div>
								<button
									type="button"
									class="download-chevron"
									aria-label="More download options"
									aria-expanded={downloadDropdownOpen}
									onclick={(e) => {
										e.stopPropagation();
										downloadDropdownOpen = !downloadDropdownOpen;
									}}
								>
									<span class="download-chevron-icon">
										<ChevronDown
											variant="outline"
											size={13}
											strokeWidth={1.6}
											color="var(--white66)"
										/>
									</span>
								</button>
							</div>
							{#if downloadDropdownOpen}
								<DropdownMenu class="download-dropdown download-dropdown-mobile" itemChevron={true}>
									<button
										type="button"
										class="dropdown-item dropdown-item--stacked"
										role="menuitem"
										onclick={() => {
											downloadModalOpen = true;
											downloadDropdownOpen = false;
										}}
									>
										<span class="dropdown-item-body">
											<span class="dropdown-item-title">Via Zapstore</span>
											<span class="dropdown-item-desc">For reliable and secure updates</span>
										</span>
										<span class="item-chevron"
											><ChevronRight
												variant="outline"
												size={12}
												strokeWidth={1.4}
												color="var(--white33)"
											/></span
										>
									</button>
									{#if directDownloadUrl}
										<button
											class="dropdown-item dropdown-item--stacked"
											role="menuitem"
											onclick={() => handleDirectDownload(directDownloadUrl)}
										>
											<span class="dropdown-item-body">
												<span class="dropdown-item-title">Direct Download</span>
												<span class="dropdown-item-desc">Get the {app?.name} APK directly</span>
											</span>
											<span class="item-chevron"
												><ChevronRight
													variant="outline"
													size={12}
													strokeWidth={1.4}
													color="var(--white33)"
												/></span
											>
										</button>
									{/if}
								</DropdownMenu>
							{/if}
						{/if}
					</div>
				</div>

				<!-- Desktop only: author + timestamp below the name row -->
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
			<div class="screenshots-scroll-wrap mb-4" bind:this={screenshotsScrollWrap}>
				<div
					class="screenshots-scroll"
					bind:this={screenshotsScrollContainer}
					onscroll={handleScreenshotsScroll}
				>
					<div class="screenshots-content">
						{#each app.images as image, index (index)}
							<button
								type="button"
								onclick={() => openCarousel(index)}
								class="screenshot-thumb relative flex-shrink-0 overflow-hidden cursor-pointer focus:outline-none"
								class:landscape={landscapeImages.has(index)}
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
									onload={(e) => {
										thumbsLoaded.add(index);
										const img = /** @type {HTMLImageElement} */ (e.target);
										if (img.naturalWidth > img.naturalHeight) landscapeImages.add(index);
									}}
								/>
							</button>
						{/each}
					</div>
				</div>

				{#if screenshotsScrolledRight}
					<div class="screenshots-fade screenshots-fade-left" aria-hidden="true"></div>
				{/if}
				{#if screenshotsCanScrollRight}
					<div class="screenshots-fade screenshots-fade-right" aria-hidden="true"></div>
				{/if}

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
			{#if descriptionExpanded}
				<button
					type="button"
					class="read-more-btn read-less-btn"
					onclick={() => (descriptionExpanded = false)}
				>
					Read less
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
						<span class="semibold16" style="color: var(--white);">Security</span>
					</div>
					<div class="panel-list flex flex-col">
						<!-- 1. Published by Developer (check) or Published by Indexer (line) -->
						<div
							class="panel-list-item flex items-center gap-2"
							style="color: var(--white66); opacity: 1; transform: scale(1); transform-origin: left;"
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
										stroke="var(--blurpleColor)"
										stroke-width="2.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span class="regular14">Published by Developer</span>
							{:else}
								<span class="security-line flex-shrink-0" aria-hidden="true"></span>
								<span class="regular14">Published by Indexer</span>
							{/if}
						</div>
						<!-- 2. Open source (check) or Closed-source (line) — step down -->
						<div
							class="panel-list-item flex items-center gap-2"
							style="color: var(--white66); opacity: 0.78; transform: scale(0.96); transform-origin: left;"
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
										stroke="var(--blurpleColor)"
										stroke-width="2.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span class="regular14">Open source</span>
							{:else}
								<span class="security-line flex-shrink-0" aria-hidden="true"></span>
								<span class="regular14">Closed-source</span>
							{/if}
						</div>
						<!-- 3. Trusted Catalog — step down again -->
						<div
							class="panel-list-item panel-list-item-last flex items-center gap-2"
							style="color: var(--white66); opacity: 0.56; transform: scale(0.92); transform-origin: left;"
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
									stroke="var(--blurpleColor)"
									stroke-width="2.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							<span class="regular14">Trusted Catalog</span>
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
						<span class="semibold16" style="color: var(--white);">Releases</span>
					</div>
					<div class="panel-list flex flex-col">
						{#if releasesLoading}
							<p class="regular14" style="color: var(--white33);">Loading releases...</p>
						{:else if releases.length === 0}
							<p class="regular14" style="color: var(--white33);">No releases found.</p>
						{:else}
							{#each releases.slice(0, 3) as release, i (release.id ?? `release-${i}`)}
								{@const preview = releaseNotesPreview(release.notes)}
								<div
									class="panel-list-item flex items-center gap-2 min-w-0 w-full text-left"
									class:panel-list-item-last={i === Math.min(3, releases.length) - 1}
									style="opacity: {1 - i * 0.22}; transform: scale({1 -
										i * 0.04}); transform-origin: left;"
								>
									<span class="medium14 flex-shrink-0" style="color: var(--white33);">
										{trimVersion(release.version)}
									</span>
									<span
										class="regular14 truncate"
										style="color: var(--white66); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
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
				wrapperRoot={app?.pubkey && app?.dTag
					? { kind: EVENT_KINDS.APP, pubkey: app.pubkey, identifier: app.dTag }
					: null}
				{zaps}
				{zapperProfiles}
				{comments}
				{commentsLoading}
				{commentsSyncing}
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
			</div>
		</div>
		{#if app.images && app.images.length > 0}
			<div
				class="screenshots-controls"
				style="top: {screenshotsControlsTop}px"
				aria-hidden={!screenshotsScrolledRight && !screenshotsCanScrollRight}
			>
				{#if screenshotsScrolledRight}
					<button
						type="button"
						class="screenshots-btn screenshots-btn-left"
						style="left: {screenshotsControlsLeft}px"
						onclick={() => scrollScreenshots(-1)}
						aria-label="Scroll screenshots left"
					>
						<ChevronLeft size={14} strokeWidth={1.4} color="var(--white66)" />
					</button>
				{/if}
				{#if screenshotsCanScrollRight}
					<button
						type="button"
						class="screenshots-btn screenshots-btn-right"
						style="right: {screenshotsControlsRight}px"
						onclick={() => scrollScreenshots(1)}
						aria-label="Scroll screenshots right"
					>
						<ChevronRight size={14} strokeWidth={1.4} color="var(--white66)" />
					</button>
				{/if}
			</div>
		{/if}
	</div>

		<!-- Screenshot Carousel Modal -->
		{#if carouselOpen && app.images && app.images.length > 0}
			<div
				class="carousel-modal bg-overlay"
				onclick={closeCarousel}
				onkeydown={(e) => e.key === 'Escape' && closeCarousel()}
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

				<div
					class="carousel-content"
					role="presentation"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
				>
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
													color="var(--blurpleLightColor)"
												/></span
											>
										{:else}
											<Copy variant="outline" size={16} color="var(--white66)" />
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
									<span class="release-panel-version" style="color: var(--white);"
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
												{notesExpanded ? 'Read less' : 'Read more'}
											</button>
										</div>
									{:else}
										<p class="regular14 meta-muted">No release notes.</p>
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
										stroke="var(--blurpleColor)"
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
										stroke="var(--blurpleColor)"
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
									stroke="var(--blurpleColor)"
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
				app={isZapstoreApp ? null : app}
				isZapstore={isZapstoreApp}
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
	/* ── Publisher row: mobile = above icon, desktop = inside app-info below name ── */
	.detail-publisher-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 1.25rem;
	}

	/* Mobile-only publisher row (above app icon) */
	.publisher-mobile-only {
		padding-bottom: 0.875rem;
	}
	@media (min-width: 768px) {
		.publisher-mobile-only {
			display: none;
		}
	}

	/* Desktop: author + timestamp next to each other (exact original behaviour) */
	.detail-publisher-row-in-app {
		display: none;
		padding-bottom: 0;
	}
	@media (min-width: 768px) {
		.detail-publisher-row-in-app {
			display: flex;
			justify-content: flex-start;
			gap: 1rem;
		}
		.detail-publisher-row-in-app .detail-publisher-link {
			flex: 0 0 auto;
		}
	}

	/* ── Name row ── */
	.app-name-row {
		padding-top: 2px;
	}
	@media (min-width: 768px) {
		.app-name-row {
			justify-content: space-between;
			align-items: center;
			padding-top: 6px;
		}
	}

	/* Left group: name + pill (pill desktop-only) */
	.app-name-and-pill {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		min-width: 0;
		flex: 1;
	}

	/* Desktop-only: pill sits right next to name */
	.desktop-pill-wrap {
		display: none;
	}
	@media (min-width: 768px) {
		.desktop-pill-wrap {
			display: flex;
		}
	}

	/* ── Download split button ─────────────────────────────────── */
	.download-split-wrap {
		position: relative;
		flex-shrink: 0;
	}

	.download-split-btn {
		display: inline-flex;
		align-items: stretch;
		height: 32px;
		background-image: var(--button-primary-bg);
		border-radius: 9999px;
		overflow: hidden;
		transition: transform 0.15s ease;
	}

	.download-split-btn:hover {
		transform: scale(1.025);
		box-shadow:
			0 0 20px color-mix(in srgb, var(--blurpleColor) 40%, transparent),
			0 10px 40px -20px color-mix(in srgb, var(--blurpleColor) 60%, transparent);
	}

	.download-split-btn:has(:active) {
		transform: scale(0.98);
	}

	.download-main {
		display: inline-flex;
		align-items: center;
		padding: 0 11px 0 14px;
		font-size: 14px;
		font-weight: 500;
		color: var(--whiteEnforced);
		background: none;
		border: none;
		cursor: pointer;
		white-space: nowrap;
		line-height: 1;
	}

	.download-main--solo {
		padding: 0 14px;
	}

	.download-divider {
		width: 1px;
		background-color: color-mix(in srgb, var(--whiteEnforced) 25%, transparent);
		align-self: stretch;
		flex-shrink: 0;
	}

	.download-chevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0 2px 0 0;
	}

	.download-chevron-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		padding-top: 2px;
	}

	:global(.download-dropdown) {
		position: absolute;
		z-index: 50;
		min-width: 260px;
	}

	:global(.download-dropdown-desktop) {
		top: calc(100% + 6px);
		right: 0;
	}

	:global(.download-dropdown-mobile) {
		top: calc(100% + 6px);
		right: 0;
	}

	/* Desktop-only: Install button pushed to the far right */
	.install-btn-desktop {
		display: none;
	}
	@media (min-width: 768px) {
		.install-btn-desktop {
			display: inline-flex;
		}
	}

	/* Mobile only: pill (left) + install (right) below name */
	.app-mobile-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.5rem;
	}
	@media (min-width: 768px) {
		.app-mobile-actions {
			display: none;
		}
	}

	.install-btn {
		flex-shrink: 0;
		white-space: nowrap;
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
		color: var(--white66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.detail-publisher-timestamp) {
		color: var(--white33) !important;
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
		background-color: var(--white16);
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
		background: var(--white8);
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
		background-color: var(--white33);
		border-radius: 1.4px;
	}

	.security-item-body {
		flex: 1;
		min-width: 0;
	}

	.security-item-title {
		font-size: 1.125rem;
		font-weight: 500;
		color: var(--white);
		margin: 0 0 0.5rem 0;
	}

	.security-item-description {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--white66);
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
		color: var(--white33);
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
		color: var(--white);
		font-weight: 500;
	}

	.security-profile-muted {
		font-size: 0.875rem;
		color: var(--white33);
	}

	.security-profile-link {
		font-size: 0.875rem;
		color: var(--blurpleLightColor);
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
		background-color: var(--white8);
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
	.screenshots-scroll-wrap {
		position: relative;
		margin-left: calc(-1 * var(--detail-pad-x));
		margin-right: calc(-1 * var(--detail-pad-x));
		width: calc(100% + 2 * var(--detail-pad-x));
		overflow: visible;
	}

	.screenshots-scroll {
		padding-left: var(--detail-pad-x);
		padding-right: var(--detail-pad-x);
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.screenshots-scroll::-webkit-scrollbar {
		display: none;
	}

	.screenshots-content {
		display: flex;
		gap: 12px;
		padding-bottom: 8px;
		align-items: flex-start;
	}

	/* Portrait default (width fixed); landscape class expands to natural width after load */
	.screenshot-thumb {
		width: 80px;
		height: 180px;
		flex-shrink: 0;
		border-radius: 12px;
		background-color: var(--gray33);
		border: 0.33px solid var(--white16);
	}

	/* Landscape images: let width adapt to natural aspect ratio */
	.screenshot-thumb.landscape {
		width: auto;
	}

	@media (min-width: 640px) {
		.screenshot-thumb {
			width: 96px;
			height: 200px;
			border-radius: 16px;
		}

		.screenshot-thumb.landscape {
			width: auto;
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
		display: block;
		object-fit: cover;
		object-position: top center;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.screenshot-img.loaded {
		opacity: 1;
	}

	/* Scroll fade overlays */
	.screenshots-fade {
		position: absolute;
		top: 0;
		bottom: 8px;
		pointer-events: none;
		z-index: 5;
	}

	.screenshots-fade-left {
		left: 0;
		width: var(--detail-pad-x);
		background: linear-gradient(to right, var(--black), transparent);
	}

	.screenshots-fade-right {
		right: 0;
		width: var(--detail-pad-x);
		background: linear-gradient(to left, var(--black), transparent);
	}

	@media (min-width: 768px) {
		.screenshots-fade-left,
		.screenshots-fade-right {
			width: 2rem;
		}
	}

	/* Chevron scroll buttons — desktop + mouse only */
	.screenshots-btn {
		display: none;
	}

	/* Chevrons sit on .app-detail-outer (outside scroll/frame overflow) and track the screenshot row. */
	.screenshots-controls {
		position: absolute;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		pointer-events: none;
		z-index: 30;
	}

	.screenshots-controls .screenshots-btn {
		pointer-events: auto;
	}

	@media (min-width: 768px) and (hover: hover) and (pointer: fine) {
		.screenshots-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			position: absolute;
			top: 50%;
			transform: translateY(-60%) scale(1);
			width: 34px;
			height: 34px;
			border-radius: 50%;
			border: none;
			background: var(--gray66);
			backdrop-filter: blur(var(--blur-sm));
			-webkit-backdrop-filter: blur(var(--blur-sm));
			cursor: pointer;
			z-index: 20;
			transition: transform 0.2s ease;
		}

		.screenshots-btn-left {
			transform: translate(-50%, -60%);
		}

		.screenshots-btn-left:hover {
			transform: translate(-50%, -60%) scale(1.08);
		}

		.screenshots-btn-left:active {
			transform: translate(-50%, -60%) scale(0.95);
		}

		.screenshots-btn-left :global(svg) {
			padding-right: 2px;
		}

		.screenshots-btn-right {
			left: auto;
			transform: translate(50%, -60%);
		}

		.screenshots-btn-right:hover {
			transform: translate(50%, -60%) scale(1.08);
		}

		.screenshots-btn-right:active {
			transform: translate(50%, -60%) scale(0.95);
		}

		.screenshots-btn-right :global(svg) {
			padding-left: 2px;
		}
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
		color: color-mix(in srgb, var(--white) 85%, transparent);
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
		background: linear-gradient(to bottom, transparent, var(--black));
		pointer-events: none;
	}

	/* Description Read More: left-aligned so no jump on hover (same as release notes) */
	.description-container .read-more-btn {
		position: absolute;
		bottom: 8px;
		left: 0;
		height: 32px;
		padding: 0 14px;
		background-color: var(--white8);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: none;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--white66);
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.description-container .read-more-btn:hover {
		transform: scale(1.025);
	}

	.description-container .read-more-btn:active {
		transform: scale(0.98);
	}

	/* Read less: shown below expanded content, not absolute-positioned */
	.description-container .read-less-btn {
		position: static;
		margin-top: 10px;
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
		color: var(--white33);
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
		color: var(--white66);
	}

	.releases-naddr-row .releases-naddr-text {
		color: var(--white66);
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
		color: var(--white66);
		transition: color 0.15s ease;
	}

	.releases-naddr-copy:hover {
		color: var(--white);
	}

	.releases-naddr-copy-check {
		display: flex;
		color: var(--blurpleLightColor);
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
		color: var(--white33);
	}

	.releases-modal-divider {
		flex-shrink: 0;
		width: 100%;
		height: 1px;
		background-color: var(--white16);
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
		background: var(--white4);
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
		background-color: var(--white16);
		width: 100%;
	}

	.release-panel-version {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
	}

	.meta-link {
		color: var(--blurpleLightColor);
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
		color: color-mix(in srgb, var(--white) 90%, transparent);
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
		background-color: var(--white8);
	}

	.release-notes :global(pre) {
		font-size: 0.8125rem;
		padding: 0.75em 1em;
		border-radius: 8px;
		background-color: var(--white8);
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
		color: var(--white66);
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

	.platform-pill {
		height: 32px;
		padding: 0 0.875rem 0 0.5rem;
		border-radius: 9999px;
		background-color: var(--white8);
		box-sizing: border-box;
	}

	.platform-icon {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		color: var(--white33);
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
		background-color: var(--white16);
		color: white;
		border: none;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.carousel-close-btn:hover {
		background-color: var(--white33);
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
		background-color: var(--white16);
		color: white;
		border: none;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.carousel-nav-btn:hover {
		background-color: var(--white33);
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
		border: 0.33px solid var(--white16);
		overflow: hidden;
		background-color: var(--gray33);
		box-shadow: 0 0 80px 20px var(--black33);
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
		background-color: var(--white33);
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.carousel-dot:hover {
		background-color: var(--white66);
	}

	.carousel-dot.active {
		background-color: white;
		transform: scale(1.2);
	}
</style>
