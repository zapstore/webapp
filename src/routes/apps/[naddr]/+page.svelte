<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { Package, X } from "lucide-svelte";
  import type { App, Release } from "$lib/nostr";
  import {
    queryStoreOne,
    queryCommentsFromStore,
    watchEvent,
    fetchEvents,
    parseApp,
    parseRelease,
    initNostrService,
    fetchProfile,
    fetchComments,
    fetchZaps,
    parseComment,
    parseZapReceipt,
    encodeAppNaddr,
    publishComment,
  } from "$lib/nostr";
  import { nip19 } from "nostr-tools";
  import { EVENT_KINDS, DEFAULT_CATALOG_RELAYS } from "$lib/config";
  import { wheelScroll } from "$lib/actions/wheelScroll.js";
  import type { PageData } from "./$types";
  import AppPic from "$lib/components/common/AppPic.svelte";
  import ProfilePic from "$lib/components/common/ProfilePic.svelte";
  import DetailHeader from "$lib/components/layout/DetailHeader.svelte";
  import { SocialTabs, BottomBar } from "$lib/components/social";
  import Modal from "$lib/components/common/Modal.svelte";
  import DownloadModal from "$lib/components/common/DownloadModal.svelte";
  import { createSearchProfilesFunction } from "$lib/services/profile-search";
  import { createSearchEmojisFunction } from "$lib/services/emoji-search";
  import { getCurrentPubkey, signEvent } from "$lib/stores/auth.svelte";

  let { data }: { data: PageData } = $props();

  const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
  const searchEmojis = $derived(createSearchEmojisFunction(getCurrentPubkey()));

  const error = $derived(data.error ?? null);

  // Local state - start with prerendered data
  let app = $state<App | null>(data.app);
  let latestRelease = $state<Release | null>(data.latestRelease);
  let refreshing = $state(false);

  // Publisher profile
  let publisherProfile = $state<{
    displayName?: string;
    name?: string;
    picture?: string;
  } | null>(null);

  // Description expand state
  let descriptionExpanded = $state(false);
  let isTruncated = $state(false);

  // Screenshot carousel state
  let carouselOpen = $state(false);
  let currentImageIndex = $state(0);
  let carouselImageLoaded = $state(false);

  // Comments and zaps state (comments may have pending + npub for display)
  let comments = $state<(ReturnType<typeof parseComment> & { pending?: boolean; npub?: string })[]>([]);
  let commentsLoading = $state(true);
  let commentsError = $state("");
  let profiles = $state<Record<string, { displayName?: string; name?: string; picture?: string } | null>>({});
  let profilesLoading = $state(false);

  let zaps = $state<ReturnType<typeof parseZapReceipt>[]>([]);
  let zapperProfiles = $state(new Map<string, { displayName?: string; name?: string; picture?: string }>());

  let releases = $state<Release[]>([]);
  let releasesLoading = $state(false);
  let releasesModalOpen = $state(false);
  let releaseNotesExpanded = $state<Set<string>>(new Set());
  let downloadModalOpen = $state(false);

  const otherZaps = $derived(
    zaps.map((z) => {
      const prof = z.senderPubkey ? zapperProfiles.get(z.senderPubkey) : undefined;
      return {
        amount: z.amountSats,
        profile: z.senderPubkey
          ? { pictureUrl: prof?.picture, name: prof?.displayName ?? prof?.name, pubkey: z.senderPubkey }
          : undefined,
      };
    })
  );

  // Catalog for this app
  const catalogs = [
    {
      name: "Zapstore",
      pictureUrl: "https://zapstore.dev/zapstore-icon.png",
      pubkey: "78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55f2fe2202182",
    },
  ];

  // Derived values
  const truncatedNpub = $derived(
    app?.npub ? `${app.npub.slice(0, 12)}...${app.npub.slice(-6)}` : ""
  );
  const publisherName = $derived(
    publisherProfile?.displayName || publisherProfile?.name || truncatedNpub
  );
  const publisherPictureUrl = $derived(publisherProfile?.picture || "");
  const publisherUrl = $derived(app?.npub ? `/profile/${app.npub}` : "#");
  const platforms = $derived(app?.platform ? [app.platform] : ["Android"]);

  // Check if description is truncated
  function checkTruncation(node: HTMLElement) {
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
  function openCarousel(index: number) {
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

  function handleKeydown(event: KeyboardEvent) {
    if (!carouselOpen) return;

    if (event.key === "Escape") {
      closeCarousel();
    } else if (event.key === "ArrowRight") {
      nextImage();
    } else if (event.key === "ArrowLeft") {
      prevImage();
    }
  }

  // Strip markdown formatting
  function stripMarkdown(text: string) {
    if (!text) return "";
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
  function releaseNotesPreview(notes: string | undefined): string {
    if (!notes) return "";
    const onOneLine = notes.replace(/\n/g, " ").trim();
    const stripped = stripMarkdown(onOneLine);
    if (!stripped) return "";
    const firstSentence = stripped.split(/[.!?]/)[0]?.trim() ?? stripped;
    return (firstSentence.length > 50 ? firstSentence.slice(0, 50) : firstSentence) || "";
  }

  // Load publisher profile
  async function loadPublisherProfile(pubkey: string) {
    if (!pubkey) return;
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
    } catch (err) {
      console.error("Error fetching publisher profile:", err);
    }
  }

  // Load comments
  async function loadComments() {
    if (!app?.pubkey || !app?.dTag) return;

    commentsLoading = true;
    commentsError = "";

    try {
      const events = await fetchComments(app.pubkey, app.dTag);
      comments = events.map(parseComment);

      // Load profiles for comment authors
      const uniquePubkeys = [...new Set(comments.map((c) => c.pubkey))];
      profilesLoading = true;

      await Promise.all(
        uniquePubkeys.map(async (pubkey) => {
          try {
            const event = await fetchProfile(pubkey);
            if (event) {
              const content = JSON.parse(event.content);
              profiles[pubkey] = {
                displayName: content.display_name || content.displayName,
                name: content.name,
                picture: content.picture,
              };
              profiles = profiles;
            }
          } catch {
            profiles[pubkey] = null;
          }
        })
      );

      profilesLoading = false;
    } catch (err) {
      commentsError = "Failed to load comments";
      console.error(err);
    } finally {
      commentsLoading = false;
    }
  }

  // Load zaps
  async function loadZaps() {
    if (!app?.pubkey || !app?.dTag) return;

    try {
      const events = await fetchZaps(app.pubkey, app.dTag);
      zaps = events.map(parseZapReceipt);

      // Load profiles for zappers
      const uniqueSenders = [...new Set(zaps.map((z) => z.senderPubkey).filter(Boolean))] as string[];

      await Promise.all(
        uniqueSenders.slice(0, 20).map(async (pubkey) => {
          try {
            const event = await fetchProfile(pubkey);
            if (event) {
              const content = JSON.parse(event.content);
              zapperProfiles.set(pubkey, {
                displayName: content.display_name || content.displayName,
                name: content.name,
                picture: content.picture,
              });
              zapperProfiles = zapperProfiles;
            }
          } catch {
            // Ignore
          }
        })
      );
    } catch (err) {
      console.error("Failed to load zaps:", err);
    }
  }

  async function loadReleases(aTag: string) {
    releasesLoading = true;
    try {
      const events = await fetchEvents(
        { kinds: [EVENT_KINDS.RELEASE], "#a": [aTag], limit: 50 },
        { relays: DEFAULT_CATALOG_RELAYS }
      );
      const sorted = events.sort((a, b) => b.created_at - a.created_at);
      releases = sorted.map((e) => parseRelease(e));
    } catch (err) {
      console.error("Failed to load releases:", err);
      releases = [];
    } finally {
      releasesLoading = false;
    }
  }

  onMount(() => {
    if (!browser || !data.app) return;

    const aTagValue = `${EVENT_KINDS.APP}:${data.app.pubkey}:${data.app.dTag}`;

    // Sync: query EventStore immediately
    const cachedRelease = queryStoreOne({ kinds: [EVENT_KINDS.RELEASE], "#a": [aTagValue] });
    if (cachedRelease) {
      latestRelease = parseRelease(cachedRelease);
    }

    const cachedApp = queryStoreOne({
      kinds: [EVENT_KINDS.APP],
      authors: [data.app.pubkey],
      "#d": [data.app.dTag],
    });
    if (cachedApp) {
      app = parseApp(cachedApp);
    }

    // Sync: comments from EventStore (local-first, 0ms)
    const cachedCommentEvents = queryCommentsFromStore(data.app.pubkey, data.app.dTag);
    if (cachedCommentEvents.length > 0) {
      comments = cachedCommentEvents.map(parseComment);
    }

    // Load publisher profile
    if (data.app?.pubkey) {
      loadPublisherProfile(data.app.pubkey);
    }

    // Async cascade: comments and zaps (EventStore → IndexedDB → Relays)
    loadComments();
    loadZaps();

    // Background refresh from relays and load releases
    const schedule =
      "requestIdleCallback" in window
        ? window.requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1);

    schedule(async () => {
      await initNostrService();
      loadReleases(aTagValue);

      refreshing = true;
      let pending = 2;

      const done = () => {
        pending--;
        if (pending === 0) refreshing = false;
      };

      watchEvent(
        { kinds: [EVENT_KINDS.APP], authors: [data.app!.pubkey], "#d": [data.app!.dTag] },
        { relays: DEFAULT_CATALOG_RELAYS },
        (freshEvent) => {
          if (freshEvent) app = parseApp(freshEvent);
          done();
        }
      );

      watchEvent(
        { kinds: [EVENT_KINDS.RELEASE], "#a": [aTagValue] },
        { relays: DEFAULT_CATALOG_RELAYS },
        (freshEvent) => {
          if (freshEvent) latestRelease = parseRelease(freshEvent);
          done();
        }
      );
    });
  });

  function retryLoad() {
    window.location.reload();
  }

  function formatReleaseDate(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function toggleReleaseNotesExpanded(id: string) {
    releaseNotesExpanded = new Set(releaseNotesExpanded);
    if (releaseNotesExpanded.has(id)) releaseNotesExpanded.delete(id);
    else releaseNotesExpanded.add(id);
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
    publisherPubkey={app.pubkey}
    {publisherUrl}
    timestamp={app.createdAt}
    {catalogs}
    catalogText="In Zapstore"
    showPublisher={true}
  />

  <div class="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-6 pb-8">
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
          <button type="button" class="install-btn-desktop btn-primary flex-shrink-0" onclick={() => (downloadModalOpen = true)}>
            Download
          </button>
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

          <button type="button" class="install-btn-mobile btn-primary-small flex-shrink-0" onclick={() => (downloadModalOpen = true)}>
            Download
          </button>
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
              <img src={image} alt="Screenshot {index + 1}" class="w-full h-auto object-cover" loading="lazy" />
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Description -->
    <div class="description-container" class:expanded={descriptionExpanded}>
      <div class="app-description prose prose-invert max-w-none" use:checkTruncation>
        <p>{app.description}</p>
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
        <!-- Security Panel -->
        <button type="button" class="info-panel panel-security text-left">
          <div class="panel-header">
            <span class="text-base font-semibold" style="color: hsl(var(--foreground));">Security</span>
          </div>
          <div class="panel-list flex flex-col">
            <div class="panel-list-item flex items-center gap-2" style="color: hsl(var(--white66));">
              <svg class="flex-shrink-0" width="14" height="10" viewBox="0 0 18 12" fill="none">
                <path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" stroke="hsl(var(--blurpleColor))" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="text-sm">Signed by developer</span>
            </div>
            <div class="panel-list-item flex items-center gap-2" style="color: hsl(var(--white66)); opacity: 0.8; transform: scale(0.95); transform-origin: left;">
              <svg class="flex-shrink-0" width="14" height="10" viewBox="0 0 18 12" fill="none">
                <path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" stroke="hsl(var(--blurpleColor))" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="text-sm">Verified source</span>
            </div>
            <div class="panel-list-item panel-list-item-last flex items-center gap-2" style="color: hsl(var(--white66)); opacity: 0.64; transform: scale(0.9); transform-origin: left;">
              <svg class="flex-shrink-0" width="14" height="10" viewBox="0 0 18 12" fill="none">
                <path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" stroke="hsl(var(--blurpleColor))" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="text-sm">Open source</span>
            </div>
          </div>
        </button>

        <!-- Releases Panel -->
        <div class="info-panel panel-releases text-left">
          <div class="panel-header">
            <span class="text-base font-semibold" style="color: hsl(var(--foreground));">Releases</span>
          </div>
          <div class="panel-list flex flex-col">
            {#if releasesLoading}
              <p class="text-sm" style="color: hsl(var(--white33));">Loading releases...</p>
            {:else if releases.length === 0}
              <p class="text-sm" style="color: hsl(var(--white33));">No releases found.</p>
            {:else}
              {#each releases as release, i}
                {@const preview = releaseNotesPreview(release.notes)}
                <button
                  type="button"
                  class="panel-list-item flex items-center gap-2 min-w-0 w-full text-left cursor-pointer border-0 bg-transparent p-0"
                  class:panel-list-item-last={i === releases.length - 1}
                  style="opacity: {1 - i * 0.18}; transform: scale({1 - i * 0.05}); transform-origin: left;"
                  onclick={() => (releasesModalOpen = true)}
                >
                  <span class="text-sm font-medium flex-shrink-0" style="color: hsl(var(--white33));">
                    {release.version}
                  </span>
                  <span class="text-sm truncate" style="color: hsl(var(--white66)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    {preview || "No notes"}
                  </span>
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Suggestions Panel (desktop only) -->
        <button type="button" class="info-panel panel-similar-desktop text-left">
          <div class="panel-header">
            <span class="text-base font-semibold" style="color: hsl(var(--foreground));">Suggestions</span>
          </div>
          <div class="similar-apps-row flex gap-2">
            <AppPic size="md" name="App 1" />
            <AppPic size="md" name="App 2" />
            <AppPic size="md" name="App 3" />
            <AppPic size="md" name="App 4" />
          </div>
        </button>
      </div>

      <!-- Suggestions Panel (mobile only) -->
      <div class="info-panels-secondary">
        <button type="button" class="info-panel panel-similar-mobile text-left">
          <div class="panel-header">
            <span class="text-base font-semibold" style="color: hsl(var(--foreground));">Suggestions</span>
          </div>
          <div class="similar-apps-row flex gap-2">
            <AppPic size="xs" name="App 1" />
            <AppPic size="xs" name="App 2" />
            <AppPic size="xs" name="App 3" />
            <AppPic size="xs" name="App 4" />
          </div>
        </button>
      </div>
    </div>

    <!-- Social tabs -->
    <div class="mb-8">
      <SocialTabs
        app={app}
        version={latestRelease?.version}
        {publisherProfile}
        getAppSlug={(p, d) => (app ? (app.naddr || encodeAppNaddr(p, d)) : "")}
        pubkeyToNpub={(pk) => nip19.npubEncode(pk)}
        zaps={zaps.map((z) => ({
          id: String(z.createdAt),
          senderPubkey: z.senderPubkey || undefined,
          amountSats: z.amountSats,
          createdAt: z.createdAt,
          comment: z.comment,
        }))}
        {zapperProfiles}
        {comments}
        {commentsLoading}
        {commentsError}
        {profiles}
        {profilesLoading}
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

    <!-- Releases Modal (tall, scrollable list of release panels) -->
    {#if app}
      <Modal
        bind:open={releasesModalOpen}
        ariaLabel="Releases"
        maxHeight={90}
        fillHeight={true}
        class="releases-modal"
      >
        <div class="releases-modal-inner">
        <div class="releases-modal-header">
          <h2 class="text-lg font-semibold" style="color: hsl(var(--foreground));">Releases</h2>
          <p class="text-sm" style="color: hsl(var(--white66));">{app.name}</p>
        </div>
        <div class="releases-modal-list">
          {#each releases as release}
            {@const notesExpanded = releaseNotesExpanded.has(release.id)}
            <div class="release-panel">
              <h3 class="release-panel-version" style="color: hsl(var(--foreground));">{release.version}</h3>
              <div class="release-panel-meta">
                {#if app.repository}
                  <div class="release-meta-row">
                    <span class="meta-label">Repo</span>
                    <a href={app.repository} target="_blank" rel="noopener noreferrer" class="meta-link">{app.repository}</a>
                  </div>
                {/if}
                {#if app.url}
                  <div class="release-meta-row">
                    <span class="meta-label">Website</span>
                    <a href={app.url} target="_blank" rel="noopener noreferrer" class="meta-link">{app.url}</a>
                  </div>
                {/if}
                <div class="release-meta-row">
                  <span class="meta-label">Date</span>
                  <span>{formatReleaseDate(release.createdAt)}</span>
                </div>
                {#if release.url}
                  <div class="release-meta-row">
                    <span class="meta-label">Release URL</span>
                    <a href={release.url} target="_blank" rel="noopener noreferrer" class="meta-link">{release.url}</a>
                  </div>
                {/if}
              </div>
              {#if release.notes}
                <div class="release-notes-container" class:expanded={notesExpanded}>
                  <div class="release-notes prose prose-invert max-w-none" class:release-notes-collapsed={!notesExpanded}>
                    {release.notes}
                  </div>
                  <button
                    type="button"
                    class="read-more-btn release-read-more"
                    onclick={() => toggleReleaseNotesExpanded(release.id)}
                  >
                    {notesExpanded ? "Show less" : "Read more"}
                  </button>
                </div>
              {:else}
                <p class="text-sm" style="color: hsl(var(--white33));">No release notes.</p>
              {/if}
            </div>
          {/each}
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

  <!-- Bottom Bar (owns Comment + ZapSlider modals; bar slides out when either open) -->
  {@const zapTarget = app ? { name: app.name, pubkey: app.pubkey, dTag: app.dTag, id: app.id, pictureUrl: publisherPictureUrl } : null}
  <BottomBar
    appName={app.name || ""}
    {publisherName}
    contentType="app"
    {zapTarget}
    {otherZaps}
    searchProfiles={searchProfiles}
    searchEmojis={searchEmojis}
    oncommentSubmit={async ({ text, emojiTags: submitEmojiTags, mentions, target }) => {
      const userPubkey = getCurrentPubkey();
      if (!userPubkey || !app) return;
      const tempId = `pending-${Date.now()}`;
      const optimistic: (ReturnType<typeof parseComment> & { pending?: boolean; npub?: string }) = {
        id: tempId,
        pubkey: userPubkey,
        content: text,
        contentHtml: "",
        emojiTags: submitEmojiTags ?? [],
        createdAt: Math.floor(Date.now() / 1000),
        parentId: null,
        isReply: false,
        pending: true,
        npub: nip19.npubEncode(userPubkey),
      };
      comments = [...comments, optimistic];
      try {
        const signed = await publishComment(
          text,
          { contentType: "app", pubkey: app.pubkey, identifier: app.dTag },
          signEvent as (t: import("nostr-tools").EventTemplate) => Promise<import("nostr-tools").NostrEvent>,
          submitEmojiTags
        );
        const parsed = parseComment(signed) as ReturnType<typeof parseComment> & { npub?: string };
        parsed.npub = nip19.npubEncode(signed.pubkey);
        comments = comments.filter((c) => c.id !== tempId);
        comments = [...comments, parsed];
      } catch (err) {
        console.error("Failed to publish comment:", err);
        comments = comments.filter((c) => c.id !== tempId);
      }
    }}
    onzapReceived={() => {
      // TODO: Refetch zaps when zap receipt is received
    }}
  />
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
    align-items: flex-start;
  }

  @media (min-width: 768px) {
    .info-panels-main {
      align-items: stretch;
    }
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

  .panel-releases {
    flex: 1;
    min-width: 0;
  }

  .info-panels-secondary {
    display: flex;
    gap: 12px;
  }

  @media (min-width: 768px) {
    .info-panels-secondary {
      display: none;
    }

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

  .panel-similar-desktop {
    display: none;
  }

  .panel-similar-mobile {
    flex: 1;
    min-width: 0;
  }

  .panel-similar-mobile .panel-header {
    margin-bottom: 6px;
  }

  @media (min-width: 768px) {
    .panel-similar-desktop {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      flex: 1;
      min-width: 0;
      padding-bottom: 16px;
    }
  }

  /* Responsive install buttons */
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

  .read-more-btn {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
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
    transform: translateX(-50%) scale(1.025);
  }

  .read-more-btn:active {
    transform: translateX(-50%) scale(0.98);
  }

  /* Releases modal */
  .releases-modal-inner {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    padding: 0;
  }

  .releases-modal-header {
    flex-shrink: 0;
    margin-bottom: 1rem;
  }

  .releases-modal-header h2 {
    margin: 0 0 0.25rem 0;
  }

  .releases-modal-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .release-panel {
    padding: 1rem;
    border-radius: 12px;
    background: hsl(var(--white8));
    border: 0.33px solid hsl(var(--white16));
  }

  .release-panel-version {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
  }

  .release-panel-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
    color: hsl(var(--white66));
  }

  .release-meta-row {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    min-width: 0;
  }

  .meta-label {
    flex-shrink: 0;
    color: hsl(var(--white33));
  }

  .meta-link {
    color: hsl(var(--blurpleColor));
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta-link:hover {
    text-decoration: underline;
  }

  .release-notes-container {
    position: relative;
  }

  .release-notes.release-notes-collapsed {
    max-height: 120px;
    overflow: hidden;
  }

  .release-notes {
    font-size: 0.875rem;
    line-height: 1.5;
    color: hsl(var(--foreground) / 0.9);
    white-space: pre-wrap;
    margin: 0;
  }

  .release-read-more {
    position: relative;
    margin-top: 0.5rem;
    left: 0;
    transform: none;
  }

  .release-read-more:hover {
    transform: none;
  }

  .release-read-more:active {
    transform: none;
  }

  @media (min-width: 768px) {
    .read-more-btn {
      left: 0;
      transform: none;
    }

    .read-more-btn:hover {
      transform: scale(1.025);
    }

    .read-more-btn:active {
      transform: scale(0.98);
    }
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
