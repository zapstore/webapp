<script lang="js">
/**
 * Stack Detail Page
 *
 * Displays a curated collection of apps with:
 * - Stack header with title and description
 * - Horizontal scrolling grid of apps (3 per column)
 * - Social engagement (comments, zaps)
 * - Bottom bar for interactions
 */
import { page } from "$app/stores";
import { onMount } from "svelte";
import { SvelteSet, SvelteMap } from "svelte/reactivity";
import SeoHead from "$lib/components/layout/SeoHead.svelte";
import { browser } from "$app/environment";
import { beforeNavigate, goto } from "$app/navigation";
import { fetchProfilesBatch, queryEvent, queryEvents, putEvents, queryCommentsFromStore, fetchComments, fetchLabelsForAddressable, groupLabelEventsToEntries, encodeAppNaddr, encodeStackNaddr, parseProfile, parseComment, publishComment, decodeNaddr, parseAppStack, parseApp, fetchZaps, parseZapReceipt, } from "$lib/nostr";
import { stackDisplayDescription, stackDisplayTitle } from "$lib/nostr/models.js";
import { fetchFromRelays } from "$lib/nostr/service";
import { ZAPSTORE_RELAY, EVENT_KINDS, PLATFORM_FILTER, SITE_ICON } from "$lib/config";
import { isOnline } from "$lib/stores/online.svelte.js";
import { nip19 } from "nostr-tools";

import { ChevronLeft, ChevronRight } from "$lib/components/icons";
import AppSmallCard from "$lib/components/cards/AppSmallCard.svelte";
import SocialTabs from "$lib/components/social/SocialTabs.svelte";
import { resolve } from "$app/paths";
import BottomBar from "$lib/components/social/BottomBar.svelte";
import SkeletonLoader from "$lib/components/common/SkeletonLoader.svelte";
import ProfilePic from "$lib/components/common/ProfilePic.svelte";
import ProfilePicStack from "$lib/components/common/ProfilePicStack.svelte";
import Timestamp from "$lib/components/common/Timestamp.svelte";
import { createSearchProfilesFunction, ZAPSTORE_PUBKEY, zapstoreProfileStore } from "$lib/services/profile-search";
import { createSearchEmojisFunction } from "$lib/services/emoji-search";
import { getCurrentPubkey, getIsSignedIn, signEvent } from "$lib/stores/auth.svelte.js";
import { persistEventsInBackground } from "$lib/nostr/cache-writer.js";
import EditStackModal from "$lib/components/modals/EditStackModal.svelte";
import GetStartedModal from "$lib/components/modals/GetStartedModal.svelte";
import SpinKeyModal from "$lib/components/modals/SpinKeyModal.svelte";
import OnboardingBuildingModal from "$lib/components/modals/OnboardingBuildingModal.svelte";
import Pen from "$lib/components/icons/Pen.svelte";
let { data } = $props();
// Catalog for this stack - currently just Zapstore
const catalogs = [
    {
        name: "Zapstore",
        pictureUrl: SITE_ICON,
        pubkey: "78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55f2fe2202182",
    },
];
// Reactive Zapstore profile so catalog image is always fresh
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
let stack = $state(null);
let apps = $state([]);
let loading = $state(false); // Start false, only show loading if no cached data
let error = $state(null);
let comments = $state([]);
let commentsLoading = $state(false);
let commentsError = $state("");
let getStartedModalOpen = $state(false);
let spinKeyModalOpen = $state(false);
let onboardingBuildingModalOpen = $state(false);
let onboardingProfileName = $state('');
let editStackModalOpen = $state(false);
function _handleGetStartedStart(_event) {
    onboardingProfileName = _event.profileName;
    spinKeyModalOpen = true;
    setTimeout(() => { getStartedModalOpen = false; }, 80);
}
function handleGetStartedConnected() { getStartedModalOpen = false; }
function handleSpinComplete() {
    spinKeyModalOpen = false;
    setTimeout(() => { onboardingBuildingModalOpen = true; }, 150);
}
function handleUseExistingKey() { spinKeyModalOpen = false; getStartedModalOpen = true; }
let profiles = $state({});
let profilesLoading = $state(false);
/** @type {Array<{ label: string, pubkeys: string[] }>} */
let labelEntries = $state([]);
let labelsLoading = $state(false);
let zaps = $state([]);
let zapsLoading = $state(false);
let zapperProfiles = new SvelteMap();
// Check if current user owns this stack
const isOwner = $derived(
    getIsSignedIn() && 
    getCurrentPubkey() && 
    stack?.pubkey && 
    getCurrentPubkey() === stack.pubkey
);
const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));
const stackNaddr = $derived($page.params.naddr);
// Ref for horizontal scroll container
let appsScrollContainer = $state(null);
/** ~one column width + gap — matches apps listing scroll step */
const STACK_APPS_SCROLL_STEP = 320;
let stackAppsScrolledRight = $state(false);
let stackAppsCanScrollRight = $state(false);
function handleStackAppsScroll() {
    if (!appsScrollContainer)
        return;
    const { scrollLeft, scrollWidth, clientWidth } = appsScrollContainer;
    stackAppsScrolledRight = scrollLeft > 20;
    stackAppsCanScrollRight =
        scrollWidth > clientWidth + 2 && scrollLeft + clientWidth < scrollWidth - 2;
}
function scrollStackApps(dir) {
    if (!appsScrollContainer)
        return;
    appsScrollContainer.scrollBy({ left: dir * STACK_APPS_SCROLL_STEP, behavior: 'smooth' });
    if (dir > 0)
        setTimeout(handleStackAppsScroll, 350);
}
// Save scroll positions before navigating away
beforeNavigate(() => {
    if (!browser)
        return;
    const scrollState = {
        scrollY: window.scrollY,
        appsScrollX: appsScrollContainer?.scrollLeft ?? 0,
        timestamp: Date.now(),
        stackNaddr
    };
    sessionStorage.setItem('stack_detail_scroll', JSON.stringify(scrollState));
});
// Restore scroll positions on mount (when coming back)
let pendingScrollRestore = null;
function restoreScrollPositions() {
    if (!browser)
        return;
    const saved = sessionStorage.getItem('stack_detail_scroll');
    if (saved) {
        try {
            const scrollState = JSON.parse(saved);
            // Only restore if saved within last 5 minutes and for the same stack
            if (Date.now() - scrollState.timestamp < 5 * 60 * 1000 &&
                scrollState.stackNaddr === stackNaddr) {
                pendingScrollRestore = scrollState;
                // Restore vertical scroll immediately
                if (scrollState.scrollY > 0) {
                    window.scrollTo(0, scrollState.scrollY);
                }
                // Try to restore horizontal position
                tryRestoreHorizontalScroll();
            }
        }
        catch (_e) {
            // Ignore parse errors
        }
        // Clear after attempting restore
        sessionStorage.removeItem('stack_detail_scroll');
    }
}
function tryRestoreHorizontalScroll() {
    if (!pendingScrollRestore)
        return;
    if (appsScrollContainer && pendingScrollRestore.appsScrollX > 0) {
        appsScrollContainer.scrollLeft = pendingScrollRestore.appsScrollX;
        handleStackAppsScroll();
        pendingScrollRestore = null;
    }
    else {
        // Container not ready, try again next frame
        requestAnimationFrame(tryRestoreHorizontalScroll);
    }
}
onMount(() => {
    stack = data.stack ?? null;
    apps = data.apps ?? [];
    error = data.error ?? null;
    loadStack();
    restoreScrollPositions();
});
async function loadStack() {
    try {
        error = null;
        let foundStack = data.stack;
        // Client-side navigation / offline: query Dexie if no server data
        const pointer = browser ? decodeNaddr($page.params.naddr) : null;
        if (!foundStack && pointer) {
            const event = await queryEvent({
                kinds: [EVENT_KINDS.APP_STACK],
                authors: [pointer.pubkey],
                '#d': [pointer.identifier]
            });
            if (event)
                foundStack = parseAppStack(event);
        }
        // Not in cache or Dexie: try relays once before showing 404 (online only)
        if (!foundStack && browser && pointer && isOnline()) {
            loading = true;
            const events = await fetchFromRelays([ZAPSTORE_RELAY], {
                kinds: [EVENT_KINDS.APP_STACK],
                authors: [pointer.pubkey],
                '#d': [pointer.identifier],
                ...PLATFORM_FILTER,
                limit: 1
            }, { feature: 'stack-detail' });
            if (events.length > 0)
                foundStack = parseAppStack(events[0]);
        }
        if (!foundStack) {
            error = data.error ?? "Stack not found";
            return;
        }
        persistEventsInBackground(data.seedEvents ?? []);
        // Fetch creator profile
        let creator = null;
        const creatorPubkey = foundStack.pubkey;
        if (creatorPubkey) {
            try {
                const profileEvent = (await fetchProfilesBatch([creatorPubkey])).get(creatorPubkey) ?? null;
                if (profileEvent) {
                    const profile = parseProfile(profileEvent);
                    creator = {
                        name: profile?.displayName || profile?.name,
                        picture: profile?.picture,
                        pubkey: creatorPubkey,
                        npub: nip19.npubEncode(creatorPubkey),
                    };
                }
                else {
                    creator = {
                        name: undefined,
                        picture: undefined,
                        pubkey: creatorPubkey,
                        npub: nip19.npubEncode(creatorPubkey),
                    };
                }
            }
            catch (_e) {
                creator = {
                    name: undefined,
                    picture: undefined,
                    pubkey: creatorPubkey,
                    npub: nip19.npubEncode(creatorPubkey),
                };
            }
        }
        stack = { ...foundStack, creator };
        // Async: comments from Dexie (local-first)
        const cachedCommentEvents = await queryCommentsFromStore(foundStack.pubkey, foundStack.dTag, EVENT_KINDS.APP_STACK);
        if (cachedCommentEvents.length > 0) {
            comments = cachedCommentEvents.map(parseComment);
            // Hydrate comment-author profiles from Dexie so names/pics show immediately
            const nextProfiles = { ...profiles };
            const pubkeys = [...new Set(comments.map((c) => c.pubkey))];
            for (const pk of pubkeys) {
                const ev = await queryEvent({ kinds: [0], authors: [pk] });
                if (ev?.content) {
                    try {
                        const c = JSON.parse(ev.content);
                        nextProfiles[pk] = {
                            displayName: c.display_name ?? c.name,
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
        loadCommentsForStack(foundStack.pubkey, foundStack.dTag);
        loadLabelsForStack(foundStack.pubkey, foundStack.dTag);
        // Resolve apps: use server data → Dexie → relay backfill
        if (data.apps?.length > 0) {
            apps = data.apps;
        }
        else if (foundStack.appRefs?.length > 0) {
            const appRefs = foundStack.appRefs.filter((r) => r.kind === EVENT_KINDS.APP);
            const ids = appRefs.map((r) => r.identifier);
            if (ids.length > 0) {
                const events = await queryEvents({ kinds: [EVENT_KINDS.APP], '#d': ids });
                apps = events.map(parseApp);
                // Relay backfill: fetch any refs not yet in Dexie (single batch query)
                if (browser && isOnline() && apps.length < appRefs.length) {
                    const foundDTags = new Set(apps.map((a) => a.dTag));
                    const missing = appRefs.filter((r) => !foundDTags.has(r.identifier));
                    if (missing.length > 0) {
                        const missingEvents = await fetchFromRelays(
                            [ZAPSTORE_RELAY],
                            {
                                kinds: [EVENT_KINDS.APP],
                                authors: [...new Set(missing.map((r) => r.pubkey))],
                                '#d': missing.map((r) => r.identifier),
                                ...PLATFORM_FILTER,
                                limit: missing.length + 5
                            },
                            { feature: 'stack-apps-fill' }
                        );
                        if (missingEvents.length > 0) {
                            await putEvents(missingEvents).catch(() => {});
                            const allEvents = await queryEvents({ kinds: [EVENT_KINDS.APP], '#d': ids });
                            apps = allEvents.map(parseApp);
                        }
                    }
                }
            }
        }
    }
    catch (err) {
        console.error("Error loading stack:", err);
        error = err instanceof Error ? err.message : "Unknown error";
    }
    finally {
        loading = false;
    }
}
async function loadCommentsForStack(pubkey, dTag) {
    const hadCached = comments.length > 0;
    if (!hadCached)
        commentsLoading = true;
    commentsError = "";
    try {
        const [relayEvents, storeEvents] = await Promise.all([
            fetchComments(pubkey, dTag, { aTagKind: EVENT_KINDS.APP_STACK }),
            queryCommentsFromStore(pubkey, dTag, EVENT_KINDS.APP_STACK),
        ]);
        const byId = new Map();
        for (const e of storeEvents) {
            if (e?.id)
                byId.set(e.id.toLowerCase(), e);
        }
        for (const e of relayEvents) {
            if (e?.id)
                byId.set(e.id.toLowerCase(), e);
        }
        const merged = Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
        comments = merged.map(parseComment);
        const uniquePubkeys = [...new Set(comments.map((c) => c.pubkey))];
        profilesLoading = true;
        const nextProfiles = { ...profiles };
        const fetchedProfiles = await fetchProfilesBatch(uniquePubkeys);
        for (const pk of uniquePubkeys) {
            const event = fetchedProfiles.get(pk);
            if (!event?.content) {
                nextProfiles[pk] = nextProfiles[pk] ?? null;
                continue;
            }
            try {
                const c = JSON.parse(event.content);
                nextProfiles[pk] = {
                    displayName: c.display_name ?? c.name,
                    name: c.name,
                    picture: c.picture,
                };
            }
            catch {
                nextProfiles[pk] = nextProfiles[pk] ?? null;
            }
        }
        profiles = nextProfiles;
    }
    catch (err) {
        commentsError = "Failed to load comments";
        console.error(err);
    }
    finally {
        commentsLoading = false;
        profilesLoading = false;
    }
}
async function loadLabelsForStack(pubkey, dTag) {
    labelsLoading = true;
    try {
        const pk = pubkey.toLowerCase();
        const aVal = `${EVENT_KINDS.APP_STACK}:${pk}:${dTag}`;
        const [lo, up] = await Promise.all([
            queryEvents({ kinds: [EVENT_KINDS.LABEL], "#a": [aVal], limit: 300 }),
            queryEvents({ kinds: [EVENT_KINDS.LABEL], "#A": [aVal], limit: 300 }),
        ]);
        const byId = new Map();
        for (const e of [...lo, ...up]) {
            if (e?.id && !byId.has(e.id))
                byId.set(e.id, e);
        }
        labelEntries = groupLabelEventsToEntries(Array.from(byId.values()));
        const remote = await fetchLabelsForAddressable(pk, dTag, { aTagKind: EVENT_KINDS.APP_STACK });
        for (const e of remote) {
            if (e?.id && !byId.has(e.id))
                byId.set(e.id, e);
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
                            picture: j.picture,
                        };
                    }
                    catch {
                        /* ignore */
                    }
                }
            }
            profiles = next;
        }
    }
    catch (err) {
        console.error("[StackDetail] Labels failed:", err);
    }
    finally {
        labelsLoading = false;
    }
}
async function loadZapsForStack(pubkey, dTag) {
    if (!pubkey || !dTag)
        return;
    zapsLoading = true;
    try {
        const aTagValue = `${EVENT_KINDS.APP_STACK}:${pubkey}:${dTag}`;
        const [initialEvents, zLo, zUp] = await Promise.all([
            fetchZaps(pubkey, dTag, { aTagKind: EVENT_KINDS.APP_STACK }),
            queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], "#a": [aTagValue], limit: 200 }),
            queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], "#A": [aTagValue], limit: 200 }),
        ]);
        const byId = new Map();
        for (const e of [...zLo, ...zUp]) {
            if (e?.id)
                byId.set(e.id, e);
        }
        for (const e of initialEvents) {
            if (e?.id)
                byId.set(e.id, e);
        }
        const parseOne = (e) => {
            const parsed = { ...parseZapReceipt(e), id: e.id };
            if (!parsed.zappedEventId && e.tags?.length) {
                const eTag = e.tags.find((t) => t[0]?.toLowerCase() === "e" && t[1]);
                if (eTag?.[1])
                    parsed.zappedEventId = eTag[1];
            }
            return parsed;
        };
        zaps = Array.from(byId.values()).map(parseOne);
        await hydrateStackZapperProfiles();
    }
    catch (err) {
        console.error("Failed to load stack zaps:", err);
    }
    finally {
        zapsLoading = false;
    }
}
async function hydrateStackZapperProfiles() {
    const uniqueSenders = [...new SvelteSet(zaps.map((z) => z.senderPubkey).filter(Boolean))];
    for (const pk of uniqueSenders) {
        const ev = await queryEvent({ kinds: [0], authors: [pk] });
        if (ev?.content) {
            try {
                const c = JSON.parse(ev.content);
                zapperProfiles.set(pk, {
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
    const missing = uniqueSenders.filter((pk) => !zapperProfiles.has(pk)).slice(0, 40);
    const fetched = await fetchProfilesBatch(missing);
    for (const pubkey of missing) {
        const event = fetched.get(pubkey);
        if (!event?.content)
            continue;
        try {
            const content = JSON.parse(event.content);
            zapperProfiles.set(pubkey, {
                displayName: content.display_name ?? content.name,
                name: content.name,
                picture: content.picture,
            });
        }
        catch {
            /* ignore */
        }
    }
}
function parseStackZapFromReceiptEvent(e) {
    const parsed = { ...parseZapReceipt(e), id: e.id };
    if (!parsed.zappedEventId && e.tags?.length) {
        const eTag = e.tags.find((t) => t[0]?.toLowerCase() === "e" && t[1]);
        if (eTag?.[1])
            parsed.zappedEventId = eTag[1];
    }
    return parsed;
}
function handleStackZapPending(payload) {
    if (!payload?.tempId)
        return;
    const userPubkey = getCurrentPubkey();
    const optimistic = {
        id: payload.tempId,
        senderPubkey: userPubkey || undefined,
        amountSats: payload.amountSats,
        comment: payload.comment ?? "",
        emojiTags: payload.emojiTags ?? [],
        createdAt: Math.floor(Date.now() / 1000),
        zappedEventId: payload.zappedEventId,
        pending: true,
    };
    zaps = [optimistic, ...zaps];
    if (userPubkey && profiles[userPubkey]) {
        const p = profiles[userPubkey];
        zapperProfiles.set(userPubkey, {
            displayName: p.displayName ?? p.name,
            name: p.name,
            picture: p.picture,
        });
    }
}
function handleStackZapPendingClear(tempId) {
    if (!tempId)
        return;
    zaps = zaps.filter((z) => z.id !== tempId);
}
async function handleStackBottomBarZap(event) {
    const { zapReceipt, pendingTempId } = event ?? {};
    if (pendingTempId) {
        zaps = zaps.filter((z) => z.id !== pendingTempId);
    }
    if (zapReceipt?.id) {
        const parsed = parseStackZapFromReceiptEvent(zapReceipt);
        const pid = String(parsed.id).toLowerCase();
        if (!zaps.some((z) => String(z.id).toLowerCase() === pid)) {
            zaps = [parsed, ...zaps];
        }
        await hydrateStackZapperProfiles();
    }
    const pk = stack?.pubkey;
    const dt = stack?.dTag;
    if (pk && dt) {
        void loadZapsForStack(pk, dt);
        setTimeout(() => void loadZapsForStack(pk, dt), 2500);
    }
}
async function handleCommentSubmit(event) {
    const userPubkey = getCurrentPubkey();
    if (!userPubkey || !stack)
        return;
    const { text, emojiTags: submitEmojiTags, parentId, replyToPubkey, rootPubkey, parentKind, mediaUrls: submitMediaUrls } = event;
    const tempId = `pending-${Date.now()}`;
    const optimistic = {
        id: tempId,
        pubkey: userPubkey,
        content: text,
        contentHtml: "",
        emojiTags: submitEmojiTags ?? [],
        mediaUrls: submitMediaUrls ?? [],
        createdAt: Math.floor(Date.now() / 1000),
        parentId: parentId ?? null,
        isReply: parentId != null,
        pending: true,
        npub: nip19.npubEncode(userPubkey),
    };
    comments = [...comments, optimistic];
    try {
        const signed = await publishComment(text, { contentType: "stack", pubkey: stack.pubkey, identifier: stack.dTag }, signEvent, submitEmojiTags, parentId, replyToPubkey ?? rootPubkey, parentKind, event.mentions, undefined, submitMediaUrls);
        const parsed = parseComment(signed);
        parsed.npub = nip19.npubEncode(signed.pubkey);
        comments = comments.filter((c) => c.id !== tempId);
        comments = [...comments, parsed];
        // Ensure current user's profile is loaded for the new comment
        if (!profiles[userPubkey]) {
            try {
                const existing = await queryEvent({ kinds: [0], authors: [userPubkey], limit: 1 });
                if (existing?.content) {
                    const c = JSON.parse(existing.content);
                    profiles = { ...profiles, [userPubkey]: { displayName: c.display_name ?? c.displayName, name: c.name, picture: c.picture } };
                } else {
                    const batch = await fetchProfilesBatch([userPubkey], { timeout: 3000 });
                    const ev = batch.get(userPubkey);
                    if (ev?.content) {
                        const c = JSON.parse(ev.content);
                        profiles = { ...profiles, [userPubkey]: { displayName: c.display_name ?? c.displayName, name: c.name, picture: c.picture } };
                    }
                }
            } catch (_) {}
        }
    }
    catch (err) {
        console.error("Failed to publish comment:", err);
        comments = comments.filter((c) => c.id !== tempId);
        commentsError =
            err instanceof Error ? err.message : "Comment could not be published to any relay.";
    }
}
function getAppUrl(app) {
    return `/apps/${app.dTag}`;
}
// Group apps into columns of 3 for horizontal scroll
function getAppColumns(appList, itemsPerColumn = 3) {
    const columns = [];
    for (let i = 0; i < appList.length; i += itemsPerColumn) {
        columns.push(appList.slice(i, i + itemsPerColumn));
    }
    return columns;
}
const appColumns = $derived(getAppColumns(apps, 3));
// Recompute scroll affordances after apps render (container width vs content)
$effect(() => {
    if (!browser)
        return;
    void apps.length;
    void appColumns;
    if (!appsScrollContainer)
        return;
    const id = requestAnimationFrame(() => {
        requestAnimationFrame(handleStackAppsScroll);
    });
    return () => cancelAnimationFrame(id);
});
// Computed display values for stack (same rules as AppStackCard)
const displayTitle = $derived(
    stack ? stackDisplayTitle({ title: stack.title, description: stack.description }) : ""
);
const displayDescription = $derived(
    stack
        ? stackDisplayDescription({ title: stack.title, description: stack.description }, displayTitle)
        : ""
);
</script>

<SeoHead
  title="{stack?.title || 'Stack'} — Zapstore"
  description={stack?.description || "A curated collection of apps on Zapstore"}
/>

<section class="stack-page">
  <div class="container mx-auto px-3 sm:px-6 lg:px-8 pt-4 md:pt-[18px] pb-24">
    {#if loading}
      <!-- Loading State -->
      <div class="skeleton-publisher-row">
        <div class="skeleton-publisher">
          <div class="skeleton-avatar"><SkeletonLoader /></div>
          <div class="skeleton-name-small"></div>
        </div>
      </div>
      <div class="stack-header-skeleton">
        <div class="skeleton-title"><SkeletonLoader /></div>
        <div class="skeleton-desc"></div>
      </div>

      <div class="section-container">
        <div class="horizontal-scroll">
          <div class="scroll-content">
            {#each Array(3) as _, colIndex (colIndex)}
              <div class="app-column">
                {#each Array(3) as _, cardIndex (cardIndex)}
                  <div class="skeleton-card">
                    <div class="skeleton-icon"><SkeletonLoader /></div>
                    <div class="skeleton-info">
                      <div class="skeleton-name"><SkeletonLoader /></div>
                      <div class="skeleton-desc-small"></div>
                    </div>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      </div>
    {:else if error}
      <!-- Error State -->
      <div class="flex items-center justify-center py-24">
        <div class="text-center">
          <div
            class="rounded-lg bg-destructive/10 border border-destructive/20 p-6 max-w-md"
          >
            <h3 class="text-lg font-semibold text-destructive mb-2">
              Error Loading Stack
            </h3>
            <p class="text-muted-foreground mb-4">{error}</p>
            <a href="/apps" class="btn-primary"> Back to Apps </a>
          </div>
        </div>
      </div>
    {:else if stack}
      <!-- Publisher row above title (author left, timestamp right) -->
      <div class="detail-publisher-row">
        {#if stack?.creator}
          <a
            href={stack.creator?.npub ? `/profile/${stack.creator.npub}` : "#"}
            class="detail-publisher-link"
          >
            <ProfilePic
              pictureUrl={stack.creator.picture}
              name={stack.creator.name}
              pubkey={stack.creator.pubkey}
              size="sm"
            />
            <span class="detail-publisher-name">By {stack.creator.name || stack.creator.npub?.slice(0, 12) + '...'}</span>
          </a>
        {:else}
          <div></div>
        {/if}
        {#if stack?.createdAt}
          <Timestamp timestamp={stack.createdAt} size="xs" className="detail-publisher-timestamp" />
        {/if}
      </div>
      <!-- Stack Header: title row, then description row -->
      <div class="stack-header">
        <div class="stack-title-row">
          <h1 class="stack-title">{displayTitle}</h1>
          {#if isOwner}
            <button
              type="button"
              class="edit-stack-btn"
              onclick={() => editStackModalOpen = true}
              aria-label="Edit stack"
            >
              <Pen size={14} variant="fill" color="hsl(var(--white66))" />
              <span class="edit-btn-text">Edit</span>
            </button>
          {/if}
        </div>
        <div class="stack-desc-row">
          <p class="stack-description">{displayDescription}</p>
          {#if apps.length > 0}
            <span class="stack-page-app-count">{apps.length} Apps</span>
          {/if}
        </div>
      </div>

      <!-- Apps Section -->
      <div class="section-container">
        {#if apps.length > 0}
          <div class="stack-apps-scroll-wrap">
            <div
              class="horizontal-scroll"
              bind:this={appsScrollContainer}
              onscroll={handleStackAppsScroll}
            >
              <div class="scroll-content">
                {#each appColumns as column, ci (ci)}
                  <div class="app-column">
                    {#each column as app (app.id)}
                      <AppSmallCard {app} href={getAppUrl(app)} />
                    {/each}
                  </div>
                {/each}
              </div>
            </div>
            {#if stackAppsScrolledRight}
              <button
                type="button"
                class="stack-apps-scroll-btn stack-apps-scroll-btn-left"
                onclick={() => scrollStackApps(-1)}
                aria-label="Scroll apps left"
              >
                <ChevronLeft size={14} strokeWidth={1.4} color="hsl(var(--white66))" />
              </button>
            {/if}
            {#if stackAppsCanScrollRight}
              <button
                type="button"
                class="stack-apps-scroll-btn stack-apps-scroll-btn-right"
                onclick={() => scrollStackApps(1)}
                aria-label="Scroll apps right"
              >
                <ChevronRight size={14} strokeWidth={1.4} color="hsl(var(--white66))" />
              </button>
            {/if}
          </div>
        {:else}
          <div class="placeholder-content">
            <p class="text-muted-foreground text-sm">
              No apps found in this stack.
            </p>
          </div>
        {/if}
      </div>

      <!-- Social tabs (Comments, Labels, etc.) -->
      <div class="mb-8">
        <SocialTabs
          stack={stack}
          app={{ pubkey: stack.pubkey, dTag: stack.dTag }}
          mainEventIds={[stack.id].filter(Boolean)}
          signEvent={signEvent}
          getStackSlug={encodeStackNaddr}
          getAppSlug={(p, d) => encodeAppNaddr(p, d)}
          pubkeyToNpub={(pk) => nip19.npubEncode(pk)}
          publisherProfile={stack.creator
            ? {
                displayName: stack.creator.name,
                name: stack.creator.name,
                picture: stack.creator.picture,
              }
            : null}
          zaps={zaps.map((z) => ({
            id: z.id,
            senderPubkey: z.senderPubkey || undefined,
            amountSats: z.amountSats,
            createdAt: z.createdAt,
            comment: z.comment,
            emojiTags: z.emojiTags ?? [],
            zappedEventId: z.zappedEventId ?? undefined,
            pending: z.pending === true,
          }))}
          {zapperProfiles}
          {zapsLoading}
          {comments}
          {commentsLoading}
          {commentsError}
          {profiles}
          {profilesLoading}
          {labelEntries}
          {labelsLoading}
          searchProfiles={searchProfiles}
          searchEmojis={searchEmojis}
          onCommentSubmit={handleCommentSubmit}
          onZapPending={handleStackZapPending}
          onZapPendingClear={handleStackZapPendingClear}
          onZapReceived={handleStackBottomBarZap}
          onGetStarted={() => (getStartedModalOpen = true)}
        />
      </div>
    {/if}
  </div>
</section>

<!-- Bottom Bar: shown for everyone; guests see "Get started to comment" and can zap with anon keypair. -->
{#if stack}
  {@const zapTarget = stack ? {
    name: stack.title || displayTitle,
    pubkey: stack.pubkey,
    dTag: stack.dTag,
    id: stack.id,
    pictureUrl: stack.creator?.picture,
    aTag: `${EVENT_KINDS.APP_STACK}:${stack.pubkey}:${stack.dTag}`,
  } : null}
  <BottomBar
    publisherName={stack?.creator?.name || ""}
    contentType="stack"
    {zapTarget}
    otherZaps={[]}
    isSignedIn={getIsSignedIn()}
    onGetStarted={() => (getStartedModalOpen = true)}
    getCurrentPubkey={getCurrentPubkey}
    signEvent={signEvent}
    searchProfiles={searchProfiles}
    searchEmojis={searchEmojis}
    oncommentSubmit={(e) =>
      handleCommentSubmit({ text: e.text, emojiTags: e.emojiTags, mentions: e.mentions, mediaUrls: e.mediaUrls, parentId: undefined })}
    onzapReceived={handleStackBottomBarZap}
    onZapPending={handleStackZapPending}
    onZapPendingClear={handleStackZapPendingClear}
    onLabelPublished={() => {
      if (stack?.pubkey && stack?.dTag)
        loadLabelsForStack(stack.pubkey, stack.dTag);
    }}
    onOwnContentDeleted={() => {
      goto(resolve("/stacks"));
    }}
  />
{/if}

<!-- Edit Stack Modal (only for stack owners) -->
{#if isOwner && stack}
  <EditStackModal
    bind:isOpen={editStackModalOpen}
    {stack}
    {apps}
    onSaved={(_newEvent) => {
      loadStack();
    }}
  />
{/if}

<!-- Onboarding modals (for Get Started flow from BottomBar) -->
<GetStartedModal
  bind:open={getStartedModalOpen}
  onconnected={handleGetStartedConnected}
/>
<SpinKeyModal
  bind:open={spinKeyModalOpen}
  profileName={onboardingProfileName}
  zIndex={55}
  onspinComplete={handleSpinComplete}
  onuseExistingKey={handleUseExistingKey}
/>
<OnboardingBuildingModal bind:open={onboardingBuildingModalOpen} zIndex={56} />

<style>
  .stack-page {
    min-height: 100vh;
  }

  /* ── Publisher info row (replaces DetailHeader) ── */
  .detail-publisher-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 0.5rem;
  }

  .detail-publisher-link {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    flex: 1;
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

  /* Stack Header: column with title, then row with description + count */
  .stack-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
    margin-bottom: 32px;
  }

  .stack-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .stack-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: hsl(var(--white));
    margin: 0;
    line-height: 1.2;
    flex: 1;
    min-width: 0;
  }

  .edit-stack-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 36px;
    height: 36px;
    padding: 0;
    background: var(--gradient-blurple);
    border: none;
    border-radius: 50%;
    color: hsl(var(--whiteEnforced));
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s ease, opacity 0.15s ease;
    flex-shrink: 0;
  }

  .edit-btn-text {
    display: none;
  }

  .edit-stack-btn:hover {
    transform: scale(1.05);
  }

  .edit-stack-btn:active {
    transform: scale(0.95);
  }

  @media (min-width: 768px) {
    .edit-stack-btn {
      width: auto;
      height: auto;
      padding: 8px 14px;
      border-radius: var(--radius-12);
      gap: 8px;
    }

    .edit-btn-text {
      display: inline;
    }
  }

  .stack-desc-row {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .stack-description {
    flex: 1;
    min-width: 0;
    font-size: 1rem;
    color: hsl(var(--white66));
    margin: 0;
    line-height: 1.5;
  }

  .stack-page-app-count {
    flex-shrink: 0;
    font-size: 1rem;
    color: hsl(var(--white33));
  }

  @media (min-width: 768px) {
    .stack-title {
      font-size: 2rem;
    }

    .stack-description {
      font-size: 1.125rem;
    }

    .stack-page-app-count {
      font-size: 1.125rem;
    }
  }

  .section-container {
    margin-bottom: 24px;
    min-width: 0;
  }

  .stack-apps-scroll-wrap {
    position: relative;
  }

  /* Scroll arrows — desktop + fine pointer (same idea as /apps) */
  .stack-apps-scroll-btn {
    display: none;
  }

  @media (min-width: 768px) and (hover: hover) and (pointer: fine) {
    .stack-apps-scroll-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      top: 50%;
      transform: translateY(-50%) scale(1);
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: none;
      background: hsl(var(--white16));
      backdrop-filter: blur(var(--blur-sm));
      -webkit-backdrop-filter: blur(var(--blur-sm));
      cursor: pointer;
      z-index: 10;
      transition: transform 0.2s ease;
    }

    .stack-apps-scroll-btn:hover {
      transform: translateY(-50%) scale(1.08);
    }

    .stack-apps-scroll-btn:active {
      transform: translateY(-50%) scale(0.95);
    }

    .stack-apps-scroll-btn-right {
      right: -56px;
    }

    .stack-apps-scroll-btn-right :global(svg) {
      padding-left: 2px;
    }

    .stack-apps-scroll-btn-left {
      left: -56px;
    }

    .stack-apps-scroll-btn-left :global(svg) {
      padding-right: 2px;
    }
  }

  /* Horizontal scroll container — mirrors the apps page pattern */
  .horizontal-scroll {
    margin-left: -1rem;
    margin-right: -1rem;
    padding-left: 1rem;
    padding-right: 1rem;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
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

  .horizontal-scroll::-webkit-scrollbar {
    display: none;
  }

  @media (min-width: 640px) {
    .horizontal-scroll {
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

  @media (min-width: 768px) {
    .horizontal-scroll {
      margin-left: -38px;
      margin-right: -38px;
      padding-left: 38px;
      padding-right: 38px;

      mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 38px,
        black calc(100% - 38px),
        transparent 100%
      );
      -webkit-mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 38px,
        black calc(100% - 38px),
        transparent 100%
      );
    }
  }

  .scroll-content {
    display: flex;
    gap: 16px;
    padding-bottom: 8px;
  }

  .app-column {
    flex-shrink: 0;
    width: 280px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  @media (min-width: 768px) {
    .app-column {
      width: 320px;
      gap: 16px;
    }
  }

  .placeholder-content {
    padding: 24px;
    background-color: hsl(var(--gray66));
    border-radius: 16px;
    text-align: center;
  }

  /* Skeleton styles */
  .skeleton-publisher-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .skeleton-publisher {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .skeleton-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    overflow: hidden;
  }

  .skeleton-name-small {
    width: 100px;
    height: 16px;
    border-radius: 6px;
    background-color: hsl(var(--gray33));
  }

  .stack-header-skeleton {
    margin-bottom: 32px;
  }

  .skeleton-title {
    width: 200px;
    height: 32px;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .skeleton-desc {
    width: 300px;
    height: 20px;
    border-radius: 6px;
    background-color: hsl(var(--gray33));
  }

  .skeleton-card {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .skeleton-icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .skeleton-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .skeleton-name {
    width: 120px;
    height: 18px;
    border-radius: 8px;
    overflow: hidden;
  }

  .skeleton-desc-small {
    width: 180px;
    height: 14px;
    border-radius: 6px;
    background-color: hsl(var(--gray33));
  }

  @media (min-width: 768px) {
    .skeleton-card {
      gap: 20px;
    }

    .skeleton-icon {
      width: 72px;
      height: 72px;
      border-radius: 24px;
    }
  }
</style>
