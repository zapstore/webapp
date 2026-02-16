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
import { browser } from "$app/environment";
import { beforeNavigate } from "$app/navigation";
import { fetchProfile, fetchProfilesBatch, queryEvent, queryEvents, queryCommentsFromStore, fetchComments, encodeAppNaddr, encodeStackNaddr, parseProfile, parseComment, publishComment, decodeNaddr, parseAppStack, parseApp, } from "$lib/nostr";
import { fetchFromRelays } from "$lib/nostr/service";
import { DEFAULT_CATALOG_RELAYS } from "$lib/config";
import { EVENT_KINDS, PLATFORM_FILTER } from "$lib/config";
import { isOnline } from "$lib/stores/online.svelte.js";
import { nip19 } from "nostr-tools";
import { wheelScroll } from "$lib/actions/wheelScroll.js";
import AppSmallCard from "$lib/components/cards/AppSmallCard.svelte";
import SocialTabs from "$lib/components/social/SocialTabs.svelte";
import BottomBar from "$lib/components/social/BottomBar.svelte";
import SkeletonLoader from "$lib/components/common/SkeletonLoader.svelte";
import DetailHeader from "$lib/components/layout/DetailHeader.svelte";
import { createSearchProfilesFunction } from "$lib/services/profile-search";
import { createSearchEmojisFunction } from "$lib/services/emoji-search";
import { getCurrentPubkey, getIsSignedIn, signEvent } from "$lib/stores/auth.svelte.js";
import { persistEventsInBackground } from "$lib/nostr/cache-writer.js";
let { data } = $props();
// Catalog for this stack - currently just Zapstore
const catalogs = [
    {
        name: "Zapstore",
        pictureUrl: "https://zapstore.dev/zapstore-icon.png",
        pubkey: "78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55f2fe2202182",
    },
];
let stack = $state(null);
let apps = $state([]);
let loading = $state(false); // Start false, only show loading if no cached data
let error = $state(null);
let comments = $state([]);
let commentsLoading = $state(false);
let commentsError = $state("");
let getStartedModalOpen = $state(false);
let profiles = $state({});
let profilesLoading = $state(false);
const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
const searchEmojis = $derived(createSearchEmojisFunction(getCurrentPubkey()));
const stackNaddr = $derived($page.params.naddr);
// Ref for horizontal scroll container
let appsScrollContainer = $state(null);
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
        catch (e) {
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
            const events = await fetchFromRelays(DEFAULT_CATALOG_RELAYS, {
                kinds: [EVENT_KINDS.APP_STACK],
                authors: [pointer.pubkey],
                '#d': [pointer.identifier],
                ...PLATFORM_FILTER,
                limit: 1
            });
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
            catch (e) {
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
        // Resolve apps: use server data or query Dexie
        if (data.apps?.length > 0) {
            apps = data.apps;
        }
        else if (foundStack.appRefs?.length > 0) {
            const ids = foundStack.appRefs.filter((r) => r.kind === 32267).map((r) => r.identifier);
            if (ids.length > 0) {
                const events = await queryEvents({ kinds: [32267], '#d': ids });
                apps = events.map(parseApp);
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
        const events = await fetchComments(pubkey, dTag, { aTagKind: EVENT_KINDS.APP_STACK });
        comments = events.map(parseComment);
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
async function handleCommentSubmit(event) {
    const userPubkey = getCurrentPubkey();
    if (!userPubkey || !stack)
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
        const signed = await publishComment(text, { contentType: "stack", pubkey: stack.pubkey, identifier: stack.dTag }, signEvent, submitEmojiTags, parentId, replyToPubkey ?? rootPubkey, parentKind);
        const parsed = parseComment(signed);
        parsed.npub = nip19.npubEncode(signed.pubkey);
        comments = comments.filter((c) => c.id !== tempId);
        comments = [...comments, parsed];
    }
    catch (err) {
        console.error("Failed to publish comment:", err);
        comments = comments.filter((c) => c.id !== tempId);
        commentsError =
            err instanceof Error ? err.message : "Comment could not be published to any relay.";
    }
}
function getAppUrl(app) {
    return `/apps/${encodeAppNaddr(app.pubkey, app.dTag)}`;
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
// Helper to capitalize a string (first letter uppercase)
function capitalize(text) {
    if (!text)
        return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
}
// Helper to get first N words from a string
function getFirstWords(text, count = 5) {
    if (!text)
        return "";
    const words = text.trim().split(/\s+/);
    const result = words.slice(0, count).join(" ");
    return words.length > count ? result + "…" : result;
}
// Check if description is essentially the same as the name (case-insensitive)
function isDescriptionSameAsName(name, description) {
    if (!name || !description)
        return false;
    return name.toLowerCase().trim() === description.toLowerCase().trim();
}
// Computed display values for stack
const displayTitle = $derived(capitalize(stack?.title) ||
    capitalize(getFirstWords(stack?.description, 5)) ||
    "Untitled Stack");
const displayDescription = $derived(!stack?.title ||
    !stack?.description ||
    isDescriptionSameAsName(stack?.title, stack?.description)
    ? `A stack of curated ${displayTitle} applications`
    : stack?.description);
</script>

<svelte:head>
  <title>{stack?.title || "Stack"} — Zapstore</title>
  <meta
    name="description"
    content={stack?.description || "A curated collection of apps on Zapstore"}
  />
</svelte:head>

<!-- Contextual header with back button, creator info, and catalog -->
{#if stack?.creator}
  <DetailHeader
    publisherPic={stack.creator.picture}
    publisherName={stack.creator.name}
    publisherPubkey={stack.creator.pubkey}
    publisherUrl={stack.creator?.npub ? `/profile/${stack.creator.npub}` : "#"}
    timestamp={stack.createdAt}
    {catalogs}
    catalogText="In Zapstore"
    showPublisher={true}
    bind:getStartedModalOpen
  />
{:else if stack}
  <DetailHeader {catalogs} catalogText="In Zapstore" showPublisher={false} bind:getStartedModalOpen />
{/if}

<section class="stack-page">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-24">
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
        <div class="horizontal-scroll" use:wheelScroll>
          <div class="scroll-content">
            {#each Array(3) as _, colIndex}
              <div class="app-column">
                {#each Array(3) as _, cardIndex}
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
            <a href="/discover" class="btn-primary"> Back to Discover </a>
          </div>
        </div>
      </div>
    {:else if stack}
      <!-- Stack Header: name in column, then description row (description left, count right) -->
      <div class="stack-header">
        <h1 class="stack-title">{displayTitle}</h1>
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
          <div class="horizontal-scroll" use:wheelScroll bind:this={appsScrollContainer}>
            <div class="scroll-content">
              {#each appColumns as column}
                <div class="app-column">
                  {#each column as app}
                    <AppSmallCard {app} href={getAppUrl(app)} />
                  {/each}
                </div>
              {/each}
            </div>
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
          {comments}
          {commentsLoading}
          {commentsError}
          {profiles}
          {profilesLoading}
          searchProfiles={searchProfiles}
          searchEmojis={searchEmojis}
          onCommentSubmit={handleCommentSubmit}
          onZapReceived={() => {}}
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
  } : null}
  <BottomBar
    publisherName={stack?.creator?.name || ""}
    contentType="stack"
    {zapTarget}
    otherZaps={[]}
    isSignedIn={getIsSignedIn()}
    onGetStarted={() => (getStartedModalOpen = true)}
    searchProfiles={searchProfiles}
    searchEmojis={searchEmojis}
    oncommentSubmit={(e) =>
      handleCommentSubmit({ text: e.text, emojiTags: e.emojiTags, mentions: e.mentions, parentId: undefined })}
    onzapReceived={() => {}}
  />
{/if}

<style>
  .stack-page {
    min-height: 100vh;
  }

  /* Stack Header: column with title, then row with description + count */
  .stack-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 32px;
  }

  .stack-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0;
    line-height: 1.2;
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
  }

  /* Horizontal scroll container */
  .horizontal-scroll {
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

  @media (min-width: 1024px) {
    .horizontal-scroll {
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
