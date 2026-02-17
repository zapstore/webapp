<script lang="js">
import { onMount } from "svelte";
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { Package, X } from "lucide-svelte";
import { queryEvents, queryEvent, queryCommentsFromStore, parseApp, parseRelease, fetchProfile, fetchProfilesBatch, fetchComments, fetchCommentRepliesByE, fetchZaps, parseComment, parseZapReceipt, encodeAppNaddr, publishComment, decodeNaddr, putEvents, } from "$lib/nostr";
import { fetchFromRelays } from "$lib/nostr/service";
import { DEFAULT_CATALOG_RELAYS } from "$lib/config";
import SkeletonLoader from "$lib/components/common/SkeletonLoader.svelte";
import { nip19 } from "nostr-tools";
import { EVENT_KINDS, PLATFORM_FILTER } from "$lib/config";
import { wheelScroll } from "$lib/actions/wheelScroll.js";
import AppPic from "$lib/components/common/AppPic.svelte";
import ProfilePic from "$lib/components/common/ProfilePic.svelte";
import DetailHeader from "$lib/components/layout/DetailHeader.svelte";
import { SocialTabs, BottomBar } from "$lib/components/social";
import Modal from "$lib/components/common/Modal.svelte";
import DownloadModal from "$lib/components/common/DownloadModal.svelte";
import { createSearchProfilesFunction, ZAPSTORE_PUBKEY, zapstoreProfileStore } from "$lib/services/profile-search";
import { createSearchEmojisFunction } from "$lib/services/emoji-search";
import { getCurrentPubkey, getIsSignedIn, signEvent } from "$lib/stores/auth.svelte.js";
import { isOnline } from "$lib/stores/online.svelte.js";
import { renderMarkdown } from "$lib/utils/markdown";
import Timestamp from "$lib/components/common/Timestamp.svelte";
import { stripUrlForDisplay } from "$lib/utils/url.js";
import { Copy, Check } from "$lib/components/icons";
let { data } = $props();
const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
const searchEmojis = $derived(createSearchEmojisFunction(getCurrentPubkey()));
// Error is mutable: server may set it, but client can clear it when Dexie has data
let error = $state(null);
// Local state - start with prerendered data
let app = $state(null);
let latestRelease = $state(null);
let refreshing = $state(false);
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
let thumbsLoaded = $state(new Set());
// Comments and zaps state (comments may have pending + npub for display)
let comments = $state([]);
let commentsLoading = $state(false);
let commentsError = $state("");
let profiles = $state({});
let profilesLoading = $state(false);
let zaps = $state([]);
let zapsLoading = $state(false);
let zapperProfiles = $state(new Map());
let releases = $state([]);
let releasesLoading = $state(false);
let releasesModalOpen = $state(false);
/** Single expanded release id (null = none). Toggling this one value is reliable in Svelte 5. */
let expandedReleaseId = $state(null);
let downloadModalOpen = $state(false);
let getStartedModalOpen = $state(false);
let securityModalOpen = $state(false);
const appNaddr = $derived($page.params.naddr ?? "");
const otherZaps = $derived(zaps.map((z) => {
    const prof = z.senderPubkey ? zapperProfiles.get(z.senderPubkey) : undefined;
    return {
        amount: z.amountSats,
        profile: z.senderPubkey
            ? { pictureUrl: prof?.picture, name: prof?.displayName ?? prof?.name, pubkey: z.senderPubkey }
            : undefined,
    };
}));
// Catalog for this app (used in header and Security modal) — same source as DetailHeader so catalog image matches
const catalogs = [
    {
        name: "Zapstore",
        pictureUrl: "https://zapstore.dev/zapstore-icon.png",
        pubkey: "78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55f2fe2202182",
    },
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
            (catalogs[0].name ?? "").toLowerCase() === "zapstore")
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
        pubkey: c.pubkey,
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
	if (!naddrStr.startsWith('naddr1')) return naddrStr.slice(0, 10) + '......' + naddrStr.slice(-6);
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
const publisherName = $derived(publisherProfile?.displayName || publisherProfile?.name || truncatedNpub);
const publisherNameForPic = $derived(publisherProfile?.displayName || publisherProfile?.name || null);
const publisherPictureUrl = $derived(publisherProfile?.picture || "");
const publisherUrl = $derived(app?.npub ? `/profile/${app.npub}` : "#");
const platforms = $derived(app?.platform ? [app.platform] : ["Android"]);
const hasRepository = $derived(!!app?.repository);
const isZapstorePublisher = $derived(!!app?.pubkey && !!ZAPSTORE_PUBKEY && app.pubkey.toLowerCase() === ZAPSTORE_PUBKEY.toLowerCase());
/** Zapstore app we link to in GetTheAppSection: show "Published by Developer" (Zapstore is the developer) */
const ZAPSTORE_APP_NADDR = "naddr1qvzqqqr7pvpzq7xwd748yfjrsu5yuerm56fcn9tntmyv04w95etn0e23xrczvvraqqgxgetk9eaxzurnw3hhyefwv9c8qakg5jt";
const isZapstoreApp = $derived(!!app?.naddr && app.naddr === ZAPSTORE_APP_NADDR);
const publishedByDeveloper = $derived(isZapstoreApp || (!isZapstorePublisher && hasRepository));
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
        },
    };
}
// Screenshot carousel functions
function openCarousel(index) {
    currentImageIndex = index;
    carouselOpen = true;
    document.body.style.overflow = "hidden";
}
function closeCarousel() {
    carouselOpen = false;
    document.body.style.overflow = "";
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
    if (!carouselOpen)
        return;
    if (event.key === "Escape") {
        closeCarousel();
    }
    else if (event.key === "ArrowRight") {
        nextImage();
    }
    else if (event.key === "ArrowLeft") {
        prevImage();
    }
}
// Strip markdown formatting
function stripMarkdown(text) {
    if (!text)
        return "";
    return text
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/_(.+?)_/g, "$1")
        .replace(/~~(.+?)~~/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*\d+\.\s+/gm, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
}
// Release notes preview: strip markdown first, then take first sentence or first 50 chars
function releaseNotesPreview(notes) {
    if (!notes)
        return "";
    const onOneLine = notes.replace(/\n/g, " ").trim();
    const stripped = stripMarkdown(onOneLine);
    if (!stripped)
        return "";
    const firstSentence = stripped.split(/[.!?]/)[0]?.trim() ?? stripped;
    return (firstSentence.length > 50 ? firstSentence.slice(0, 50) : firstSentence) || "";
}
// Load publisher profile
async function loadPublisherProfile(pubkey) {
    if (!pubkey)
        return;
    try {
        const event = await fetchProfile(pubkey);
        if (event) {
            const content = JSON.parse(event.content);
            publisherProfile = {
                displayName: content.display_name || content.displayName,
                name: content.name,
                picture: content.picture,
            };
        }
    }
    catch (err) {
        console.error("Error fetching publisher profile:", err);
    }
}
// Load comments (cached comments from store show immediately; only show loading when no cache)
async function loadComments() {
    if (!app?.pubkey || !app?.dTag)
        return;
    const hadCached = comments.length > 0;
    if (!hadCached)
        commentsLoading = true;
    commentsError = "";
    try {
        const events = await fetchComments(app.pubkey, app.dTag);
        comments = events.map(parseComment);
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
                    picture: content.picture,
                };
            }
            catch {
                nextProfiles[pubkey] = nextProfiles[pubkey] ?? null;
            }
        }
        profiles = nextProfiles;
        profilesLoading = false;
    }
    catch (err) {
        commentsError = "Failed to load comments";
        console.error(err);
    }
    finally {
        commentsLoading = false;
    }
}
/** Load replies that reference our comments/zaps via #e (e.g. from other apps that don't add #a). Returns all comment ids after merge (so caller can fetch zaps on them). */
async function loadCommentReplies() {
    if (!app?.pubkey || !app?.dTag)
        return comments.map((c) => c.id);
    const commentIds = comments.map((c) => c.id);
    const zapIds = zaps.map((z) => z.id);
    const allIds = [...new Set([...commentIds, ...zapIds])];
    if (allIds.length === 0)
        return commentIds;
    try {
        const events = await fetchCommentRepliesByE(allIds);
        const existingIds = new Set(comments.map((c) => c.id.toLowerCase()));
        const newEvents = events.filter((ev) => !existingIds.has(ev.id.toLowerCase()));
        if (newEvents.length === 0)
            return comments.map((c) => c.id);
        const newParsed = newEvents.map((ev) => {
            const p = parseComment(ev);
            p.npub = nip19.npubEncode(ev.pubkey);
            return p;
        });
        comments = [...comments, ...newParsed];
        return comments.map((c) => c.id);
    }
    catch (err) {
        console.error("Failed to load comment replies by #e:", err);
        return comments.map((c) => c.id);
    }
}
/** 1) Fetch zaps that tag the main app/stack (#a) → main feed zaps. 2) Then fetch zaps that tag any comment or zap in that main feed (#e) and merge. One level only; deeper zaps later. */
async function loadZaps() {
    if (!app?.pubkey || !app?.dTag)
        return;
    zapsLoading = true;
    try {
        // Step 1: zaps on the main event (app/stack) only
        const initialEvents = await fetchZaps(app.pubkey, app.dTag);
        const byId = new Map(initialEvents.map((e) => [e.id, e]));
        const parseOne = (e) => {
            const parsed = { ...parseZapReceipt(e), id: e.id };
            if (!parsed.zappedEventId && e.tags?.length) {
                const eTag = e.tags.find((t) => (t[0]?.toLowerCase() === 'e') && t[1]);
                if (eTag?.[1])
                    parsed.zappedEventId = eTag[1];
            }
            return parsed;
        };
        zaps = Array.from(byId.values()).map(parseOne);
        await hydrateZapperProfiles();
    }
    catch (err) {
        console.error("Failed to load zaps:", err);
    }
    finally {
        zapsLoading = false;
    }
}
/** Fetch zaps that tag any of the given event ids (#e) and merge into zaps. Used for zaps on main-feed comments and zaps. */
async function loadZapsByMainFeedIds(mainFeedEventIds) {
    if (!app?.pubkey || !app?.dTag || mainFeedEventIds.length === 0)
        return;
    try {
        const events = await fetchZaps(app.pubkey, app.dTag, { eventIds: mainFeedEventIds });
        const existingIds = new Set(zaps.map((z) => z.id.toLowerCase()));
        const newEvents = events.filter((e) => !existingIds.has(e.id.toLowerCase()));
        if (newEvents.length === 0)
            return;
        const parseOne = (e) => {
            const parsed = { ...parseZapReceipt(e), id: e.id };
            if (!parsed.zappedEventId && e.tags?.length) {
                const eTag = e.tags.find((t) => (t[0]?.toLowerCase() === 'e') && t[1]);
                if (eTag?.[1])
                    parsed.zappedEventId = eTag[1].toLowerCase();
            }
            return parsed;
        };
        const newZaps = newEvents.map(parseOne);
        const merged = [...zaps];
        const mergedIds = new Set(merged.map((z) => z.id.toLowerCase()));
        for (const z of newZaps) {
            if (!mergedIds.has(z.id.toLowerCase())) {
                merged.push(z);
                mergedIds.add(z.id.toLowerCase());
            }
        }
        zaps = merged;
        await hydrateZapperProfiles();
    }
    catch (err) {
        console.error("Failed to load zaps by main feed ids:", err);
    }
}
async function hydrateZapperProfiles() {
    const uniqueSenders = [...new Set(zaps.map((z) => z.senderPubkey).filter(Boolean))];
    const nextZapperProfiles = new Map(zapperProfiles);
    for (const pk of uniqueSenders) {
        const ev = await queryEvent({ kinds: [0], authors: [pk] });
        if (ev?.content) {
            try {
                const c = JSON.parse(ev.content);
                nextZapperProfiles.set(pk, {
                    displayName: c.display_name ?? c.name,
                    name: c.name,
                    picture: c.picture,
                });
            }
            catch {
                /* ignore */
            }
        }
    }
    zapperProfiles = new Map(nextZapperProfiles);
    const missing = uniqueSenders.filter((pk) => !nextZapperProfiles.has(pk)).slice(0, 40);
    const fetched = await fetchProfilesBatch(missing);
    for (const pubkey of missing) {
        const event = fetched.get(pubkey);
        if (!event?.content)
            continue;
        try {
            const content = JSON.parse(event.content);
            const profile = {
                displayName: content.display_name ?? content.name,
                name: content.name,
                picture: content.picture,
            };
            nextZapperProfiles.set(pubkey, profile);
        }
        catch {
            /* ignore malformed profile */
        }
    }
    zapperProfiles = new Map(nextZapperProfiles);
}
async function handleCommentSubmit(event) {
    const userPubkey = getCurrentPubkey();
    if (!userPubkey || !app)
        return;
    const { text, emojiTags: submitEmojiTags, parentId, replyToPubkey, rootPubkey, parentKind } = event;
    const tempId = `pending-${Date.now()}`;
    const optimistic = {
        id: tempId,
        pubkey: userPubkey,
        content: text,
        contentHtml: "",
        emojiTags: submitEmojiTags ?? [],
        createdAt: Math.floor(Date.now() / 1000),
        parentId: parentId ?? null,
        isReply: parentId != null,
        pending: true,
        npub: nip19.npubEncode(userPubkey),
    };
    comments = [...comments, optimistic];
    try {
        const signed = await publishComment(text, { contentType: "app", pubkey: app.pubkey, identifier: app.dTag }, signEvent, submitEmojiTags, parentId, replyToPubkey ?? rootPubkey, parentKind);
        const parsed = parseComment(signed);
        parsed.npub = nip19.npubEncode(signed.pubkey);
        comments = comments.filter((c) => c.id !== tempId);
        comments = [...comments, parsed];
        // So the new comment shows our name/avatar: ensure current user's profile is in profiles (cache first, then fetch)
        const existing = await queryEvent({ kinds: [0], authors: [userPubkey] });
        if (existing?.content) {
            try {
                const c = JSON.parse(existing.content);
                profiles = { ...profiles, [userPubkey]: { displayName: c.display_name ?? c.displayName, name: c.name, picture: c.picture } };
            }
            catch {
                /* ignore */
            }
        }
        else {
            try {
                const event = (await fetchProfilesBatch([userPubkey])).get(userPubkey);
                if (event?.content) {
                    const content = JSON.parse(event.content);
                    profiles = { ...profiles, [userPubkey]: { displayName: content.display_name ?? content.displayName, name: content.name, picture: content.picture } };
                }
            }
            catch {
                /* ignore */
            }
        }
    }
    catch (err) {
        console.error("Failed to publish comment:", err);
        comments = comments.filter((c) => c.id !== tempId);
        commentsError =
            err instanceof Error ? err.message : "Comment could not be published to any relay.";
    }
}
async function loadReleases() {
    if (!app?.pubkey || !app?.dTag) return;
    releasesLoading = true;
    try {
        // Fetch releases from relays (server doesn't cache releases)
        const aTagValue = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
        await fetchFromRelays(DEFAULT_CATALOG_RELAYS, {
            kinds: [EVENT_KINDS.RELEASE],
            '#a': [aTagValue],
            limit: 50
        });
        // Read from Dexie (fetchFromRelays wrote them there)
        const releaseEvents = await queryEvents({
            kinds: [EVENT_KINDS.RELEASE],
            '#a': [aTagValue],
            limit: 50
        });
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
    }
    catch (err) {
        console.error("Failed to load releases:", err);
        releases = [];
    }
    finally {
        releasesLoading = false;
    }
}
onMount(async () => {
    if (!browser)
        return;
    // Decode the naddr to get pubkey + identifier for Dexie queries
    const pointer = decodeNaddr(appNaddr);
    const _pubkey = data.app?.pubkey ?? pointer?.pubkey;
    const _identifier = data.app?.dTag ?? pointer?.identifier;
    if (!_pubkey || !_identifier) {
        error = data.error ?? 'Invalid app URL';
        return;
    }
    const aTagValue = `${EVENT_KINDS.APP}:${_pubkey}:${_identifier}`;
    // 1. Try Dexie first (local-first: IndexedDB is the single client-side source of truth)
    const cachedApp = await queryEvent({
        kinds: [EVENT_KINDS.APP],
        authors: [_pubkey],
        "#d": [_identifier],
        ...PLATFORM_FILTER,
    });
    if (cachedApp) {
        app = parseApp(cachedApp);
        error = null;
    }
    const cachedRelease = await queryEvent({ kinds: [EVENT_KINDS.RELEASE], "#a": [aTagValue], ...PLATFORM_FILTER });
    if (cachedRelease) {
        latestRelease = parseRelease(cachedRelease);
    }
    // 2. Supplement with server data (may be fresher)
    if (data.app && !app) {
        app = data.app;
        error = null;
    }
    // 3. Not in cache or Dexie: try relays once before showing 404 (online only)
    if (!app && isOnline()) {
        const events = await fetchFromRelays(DEFAULT_CATALOG_RELAYS, {
            kinds: [EVENT_KINDS.APP],
            authors: [_pubkey],
            '#d': [_identifier],
            ...PLATFORM_FILTER,
            limit: 1
        });
        if (events.length > 0) {
            app = parseApp(events[0]);
            error = null;
        }
    }
    // 4. If still no app, show error
    if (!app) {
        error = data.error ?? 'App not found';
        return;
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
                        picture: c.picture,
                    };
                }
                catch {
                    /* ignore */
                }
            }
        }
        profiles = nextProfiles;
    }
    // Load publisher profile
    loadPublisherProfile(_pubkey);
    // Background cascade: comments, zaps, then replies by #e
    Promise.all([loadComments(), loadZaps()]).then(async () => {
        const mainFeedZapIds = zaps.filter((z) => !z.zappedEventId).map((z) => z.id);
        const allCommentIds = await loadCommentReplies();
        loadZapsByMainFeedIds([...allCommentIds, ...mainFeedZapIds]);
    });
    // Load releases from server data
    const schedule = "requestIdleCallback" in window
        ? window.requestIdleCallback
        : (cb) => setTimeout(cb, 1);
    schedule(async () => {
        loadReleases();
    });
});
function retryLoad() {
    window.location.reload();
}
function formatReleaseDate(ts) {
    return new Date(ts * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
function toggleReleaseNotesExpanded(releaseId) {
    expandedReleaseId = expandedReleaseId === releaseId ? null : releaseId;
}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  {#if app}
    <title>{app.name} - Zapstore</title>
    <meta name="description" content={app.description.slice(0, 160)} />
    {#if app.icon}
      <meta property="og:image" content={app.icon} />
    {/if}
  {:else}
    <title>App Details - Zapstore</title>
  {/if}
</svelte:head>

{#if error}
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
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
  <!-- Contextual header with publisher info and catalog -->
  <DetailHeader
    publisherPic={publisherPictureUrl}
    {publisherName}
    publisherNameForPic={publisherNameForPic}
    publisherPubkey={app.pubkey}
    {publisherUrl}
    timestamp={app.createdAt}
    {catalogs}
    catalogText="In Zapstore"
    showPublisher={true}
    bind:getStartedModalOpen
  />

  <div class="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-6 pb-24">
    <!-- App Header Row -->
    <div class="app-header flex items-center gap-4 sm:gap-6 mb-6">
      <AppPic
        iconUrl={app.icon}
        name={app.name}
        identifier={app.dTag}
        size="2xl"
        className="app-icon-responsive flex-shrink-0"
      />

      <div class="app-info flex-1 min-w-0">
        <div class="app-name-row flex items-center justify-between mb-2 sm:mb-3">
          <h1 class="app-name text-[1.625rem] sm:text-4xl font-black" style="color: hsl(var(--white));">
            {app.name}
          </h1>
          <!--
          <button type="button" class="install-btn-desktop btn-primary flex-shrink-0" onclick={() => (downloadModalOpen = true)}>
            Download
          </button>
          -->
        </div>

        <div class="platforms-row flex items-center gap-3">
          <div class="platforms-scroll flex-1 overflow-x-auto scrollbar-hide" use:wheelScroll>
            <div class="flex gap-2">
              {#each platforms as platform}
                <div class="platform-pill flex items-center gap-2 flex-shrink-0">
                  <svg class="platform-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.463 11.463 0 00-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 003 18h18a10.78 10.78 0 00-3.4-8.52zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                  </svg>
                  <span class="platform-text text-sm whitespace-nowrap" style="color: hsl(var(--white66));">
                    {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </span>
                </div>
              {/each}
            </div>
          </div>

          <!--
          <button type="button" class="install-btn-mobile btn-primary-small flex-shrink-0" onclick={() => (downloadModalOpen = true)}>
            Download
          </button>
          -->
        </div>
      </div>
    </div>

    <!-- Screenshots -->
    {#if app.images && app.images.length > 0}
      <div class="screenshots-scroll mb-4" use:wheelScroll>
        <div class="screenshots-content">
          {#each app.images as image, index}
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
                onload={() => { thumbsLoaded = new Set(thumbsLoaded).add(index); }}
              />
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Description -->
    <div class="description-container" class:expanded={descriptionExpanded}>
      <div class="app-description prose prose-invert max-w-none" use:checkTruncation>
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
        <button type="button" class="info-panel panel-security text-left w-full" onclick={() => (securityModalOpen = true)}>
          <div class="panel-header">
            <span class="text-base font-semibold" style="color: hsl(var(--foreground));">Security</span>
          </div>
          <div class="panel-list flex flex-col">
            <!-- 1. Published by Developer (check) or Published by Indexer (line) -->
            <div class="panel-list-item flex items-center gap-2" style="color: hsl(var(--white66)); opacity: 1; transform: scale(1); transform-origin: left;">
              {#if publishedByDeveloper}
                <svg class="security-check flex-shrink-0" width="20" height="14" viewBox="-1.5 -1.5 20 14" fill="none" style="overflow: visible;">
                  <path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" stroke="hsl(var(--blurpleColor))" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span class="text-sm">Published by Developer</span>
              {:else}
                <span class="security-line flex-shrink-0" aria-hidden="true"></span>
                <span class="text-sm">Published by Indexer</span>
              {/if}
            </div>
            <!-- 2. Open source (check) or Closed-source (line) — step down -->
            <div class="panel-list-item flex items-center gap-2" style="color: hsl(var(--white66)); opacity: 0.82; transform: scale(0.95); transform-origin: left;">
              {#if hasRepository}
                <svg class="security-check flex-shrink-0" width="20" height="14" viewBox="-1.5 -1.5 20 14" fill="none" style="overflow: visible;">
                  <path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" stroke="hsl(var(--blurpleColor))" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span class="text-sm">Open source</span>
              {:else}
                <span class="security-line flex-shrink-0" aria-hidden="true"></span>
                <span class="text-sm">Closed-source</span>
              {/if}
            </div>
            <!-- 3. Trusted Catalog — step down again -->
            <div class="panel-list-item panel-list-item-last flex items-center gap-2" style="color: hsl(var(--white66)); opacity: 0.64; transform: scale(0.9); transform-origin: left;">
              <svg class="security-check flex-shrink-0" width="20" height="14" viewBox="-1.5 -1.5 20 14" fill="none" style="overflow: visible;">
                <path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" stroke="hsl(var(--blurpleColor))" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="text-sm">Trusted Catalog</span>
            </div>
          </div>
        </button>

        <!-- Releases Panel (entire panel opens modal) -->
        <button type="button" class="info-panel panel-releases text-left w-full" onclick={() => (releasesModalOpen = true)}>
          <div class="panel-header">
            <span class="text-base font-semibold" style="color: hsl(var(--foreground));">Releases</span>
          </div>
          <div class="panel-list flex flex-col">
            {#if releasesLoading}
              <p class="text-sm" style="color: hsl(var(--white33));">Loading releases...</p>
            {:else if releases.length === 0}
              <p class="text-sm" style="color: hsl(var(--white33));">No releases found.</p>
            {:else}
              {#each releases.slice(0, 3) as release, i}
                {@const preview = releaseNotesPreview(release.notes)}
                <div
                  class="panel-list-item flex items-center gap-2 min-w-0 w-full text-left"
                  class:panel-list-item-last={i === Math.min(3, releases.length) - 1}
                  style="opacity: {1 - i * 0.18}; transform: scale({1 - i * 0.05}); transform-origin: left;"
                >
                  <span class="text-sm font-medium flex-shrink-0" style="color: hsl(var(--white33));">
                    {release.version}
                  </span>
                  <span class="text-sm truncate" style="color: hsl(var(--white66)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    {preview || "No notes"}
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
        app={app}
        version={latestRelease?.version}
        mainEventIds={[app?.id, ...(releases ?? []).map((r) => r.id)].filter(Boolean)}
        {publisherProfile}
        getAppSlug={(p, d) => (app ? (app.naddr || encodeAppNaddr(p, d)) : "")}
        pubkeyToNpub={(pk) => nip19.npubEncode(pk)}
        zaps={zaps.map((z) => ({
          id: z.id,
          senderPubkey: z.senderPubkey || undefined,
          amountSats: z.amountSats,
          createdAt: z.createdAt,
          comment: z.comment,
          emojiTags: z.emojiTags ?? [],
          zappedEventId: z.zappedEventId ?? undefined,
        }))}
        {zapperProfiles}
        {comments}
        {commentsLoading}
        {commentsError}
        zapsLoading={zapsLoading}
        {profiles}
        {profilesLoading}
        searchProfiles={searchProfiles}
        searchEmojis={searchEmojis}
        onCommentSubmit={handleCommentSubmit}
        onZapReceived={() => {
          function refetchZapsAndThreads() {
            loadZaps().then(async () => {
              const mainFeedZapIds = zaps.filter((z) => !z.zappedEventId).map((z) => z.id);
              const allCommentIds = await loadCommentReplies();
              loadZapsByMainFeedIds([...allCommentIds, ...mainFeedZapIds]);
            });
          }
          refetchZapsAndThreads();
          setTimeout(refetchZapsAndThreads, 2500);
        }}
        onGetStarted={() => (getStartedModalOpen = true)}
      />
    </div>

    <!-- Screenshot Carousel Modal -->
    {#if carouselOpen && app.images && app.images.length > 0}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <div class="carousel-modal bg-overlay" onclick={closeCarousel} role="dialog" aria-modal="true" aria-label="Screenshot carousel" tabindex="-1">
        <button type="button" onclick={closeCarousel} class="carousel-close-btn" aria-label="Close carousel">
          <X class="h-5 w-5" />
        </button>

        {#if app.images.length > 1}
          <button type="button" onclick={(e) => { e.stopPropagation(); prevImage(); }} class="carousel-nav-btn carousel-nav-prev" aria-label="Previous image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <button type="button" onclick={(e) => { e.stopPropagation(); nextImage(); }} class="carousel-nav-btn carousel-nav-next" aria-label="Next image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        {/if}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
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
              {#each app.images as _, index}
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); currentImageIndex = index; carouselImageLoaded = false; }}
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
                  <a href={app.repository} target="_blank" rel="noopener noreferrer" class="meta-link">{stripUrlForDisplay(app.repository)}</a>
                {:else}
                  <span class="meta-muted">—</span>
                {/if}
              </span>
            </div>
            <div class="releases-detail-row">
              <span class="releases-detail-label">Website</span>
              <span class="releases-detail-value">
                {#if app.url}
                  <a href={app.url} target="_blank" rel="noopener noreferrer" class="meta-link">{stripUrlForDisplay(app.url)}</a>
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
                <span class="releases-naddr-text">{app.naddr ? middleTrimNaddr(app.naddr) : '—'}</span>
                {#if app.naddr}
                  <button
                    type="button"
                    class="releases-naddr-copy"
                    onclick={copyNaddr}
                    aria-label="Copy naddr"
                  >
                    {#if naddrCopied}
                      <span class="releases-naddr-copy-check"><Check variant="outline" size={14} strokeWidth={2.8} color="hsl(var(--blurpleLightColor))" /></span>
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
                  <span class="release-panel-version" style="color: hsl(var(--foreground));">{release.version}</span>
                  <Timestamp timestamp={release.createdAt} size="sm" className="release-timestamp" />
                </div>
                <div class="release-panel-divider"></div>
                <div class="release-panel-row release-panel-notes">
                  {#if release.notes}
                    <div class="release-notes-block">
                      <div class="release-notes-text" class:collapsed={!notesExpanded}>
                        <div class="release-notes prose prose-invert max-w-none">
                          {@html renderMarkdown(release.notes)}
                        </div>
                      </div>
                      <button
                        type="button"
                        class="release-notes-toggle"
                        onclick={(e) => { e.stopPropagation(); toggleReleaseNotesExpanded(releaseId); }}
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
                <svg class="security-check-icon" width="20" height="20" viewBox="-1 1 26 22" fill="none" style="overflow: visible;">
                  <path d="M8 17L2 11L8 16.5L22 3L8 17Z" stroke="hsl(var(--blurpleColor))" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              {:else}
                <span class="security-line" aria-hidden="true"></span>
              {/if}
            </div>
            <div class="security-item-body">
              <h3 class="security-item-title">{publishedByDeveloper ? 'Published by Developer' : 'Published by Indexer'}</h3>
              <p class="security-item-description">
                {#if publishedByDeveloper}
                  This app is published directly by its developer, ensuring authenticity and direct updates from the source.
                {:else}
                  This app is published by a Zapstore indexer. While vetted, it's not directly from the developer.
                {/if}
              </p>
              <div class="security-profile-row">
                <span class="security-inline-label">Profile</span>
                <div class="security-profile">
                  <ProfilePic pictureUrl={publisherPictureUrl} name={publisherNameForPic} pubkey={app.pubkey} size="xs" />
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
                <svg class="security-check-icon" width="20" height="20" viewBox="-1 1 26 22" fill="none" style="overflow: visible;">
                  <path d="M8 17L2 11L8 16.5L22 3L8 17Z" stroke="hsl(var(--blurpleColor))" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              {:else}
                <span class="security-line" aria-hidden="true"></span>
              {/if}
            </div>
            <div class="security-item-body">
              <h3 class="security-item-title">{hasRepository ? 'Open Source' : 'Closed Source'}</h3>
              <p class="security-item-description">
                {#if hasRepository}
                  The source code is publicly available for review, allowing community audits and transparency.
                {:else}
                  The source code is not publicly available. Exercise caution and verify the publisher's reputation.
                {/if}
              </p>
              <div class="security-profile-row">
                <span class="security-inline-label">Repository</span>
                {#if hasRepository && app.repository}
                  <a href={app.repository} target="_blank" rel="noopener noreferrer" class="security-profile-link">{stripUrlForDisplay(app.repository)}</a>
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
              <svg class="security-check-icon" width="20" height="20" viewBox="-1 1 26 22" fill="none" style="overflow: visible;">
                <path d="M8 17L2 11L8 16.5L22 3L8 17Z" stroke="hsl(var(--blurpleColor))" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <div class="security-item-body">
              <h3 class="security-item-title">Trusted Catalog</h3>
              <p class="security-item-description">
                This app is listed in the official Zapstore catalog, which is curated and maintained by the Zapstore team.
              </p>
              {#each catalogProfiles as catalogProfile}
                <div class="security-profile-row">
                  <span class="security-inline-label">Catalog</span>
                  <div class="security-profile">
                    <ProfilePic
                      pictureUrl={catalogProfile.picture}
                      name={catalogProfile?.displayName ?? catalogProfile?.name}
                      pubkey={catalogProfile.pubkey}
                      size="xs"
                    />
                    <span class="security-profile-name">{catalogProfile?.displayName ?? catalogProfile?.name ?? ''}</span>
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
        app={app}
        isZapstore={app.pubkey === "78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55f2fe2202182"}
      />
    {/if}
  </div>

  <!-- Bottom Bar: shown for everyone; guests see "Get started to comment" and can zap with anon keypair. -->
  {#if app}
  {@const zapTarget = app ? { name: app.name, pubkey: app.pubkey, dTag: app.dTag, id: latestRelease?.id ?? app.id, pictureUrl: publisherPictureUrl } : null}
  <BottomBar
    appName={app.name || ""}
    {publisherName}
    contentType="app"
    {zapTarget}
    {otherZaps}
    isSignedIn={getIsSignedIn()}
    onGetStarted={() => (getStartedModalOpen = true)}
    searchProfiles={searchProfiles}
    searchEmojis={searchEmojis}
    oncommentSubmit={(e) =>
      handleCommentSubmit({ text: e.text, emojiTags: e.emojiTags, mentions: e.mentions, parentId: undefined })}
    onzapReceived={() => {
      loadZaps();
    }}
  />
  {/if}
{/if}

<style>
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
    mask-image: linear-gradient(to right, transparent 0%, black 1rem, black calc(100% - 1rem), transparent 100%);
    -webkit-mask-image: linear-gradient(to right, transparent 0%, black 1rem, black calc(100% - 1rem), transparent 100%);
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
      mask-image: linear-gradient(to right, transparent 0%, black 1.5rem, black calc(100% - 1.5rem), transparent 100%);
      -webkit-mask-image: linear-gradient(to right, transparent 0%, black 1.5rem, black calc(100% - 1.5rem), transparent 100%);
    }
  }

  @media (min-width: 1024px) {
    .screenshots-scroll {
      margin-left: -2rem;
      margin-right: -2rem;
      padding-left: 2rem;
      padding-right: 2rem;
      mask-image: linear-gradient(to right, transparent 0%, black 2rem, black calc(100% - 2rem), transparent 100%);
      -webkit-mask-image: linear-gradient(to right, transparent 0%, black 2rem, black calc(100% - 2rem), transparent 100%);
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
    0% { transform: scale(0); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
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

  /* Platform pills */
  .platform-pill {
    height: 32px;
    padding: 0 0.875rem 0 0.5rem;
    border-radius: 9999px;
    background-color: hsl(var(--white8));
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
