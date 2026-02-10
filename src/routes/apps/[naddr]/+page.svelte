<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { Package, X } from "lucide-svelte";
  import type { App, Release, NostrEvent } from "$lib/nostr";
  import {
    queryStore,
    queryStoreOne,
    queryCommentsFromStore,
    watchEvent,
    fetchEvents,
    parseApp,
    parseRelease,
    initNostrService,
    fetchProfile,
    fetchComments,
    fetchCommentRepliesByE,
    fetchZaps,
    parseComment,
    parseZapReceipt,
    encodeAppNaddr,
    publishComment,
  } from "$lib/nostr";
  import { parseAppStack } from "$lib/nostr/models";
  import { getApps } from "$lib/stores/nostr.svelte";
  import AppSmallCard from "$lib/components/cards/AppSmallCard.svelte";
  import SkeletonLoader from "$lib/components/common/SkeletonLoader.svelte";
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
  import { createSearchProfilesFunction, ZAPSTORE_PUBKEY } from "$lib/services/profile-search";
  import { createSearchEmojisFunction } from "$lib/services/emoji-search";
  import { getCurrentPubkey, getIsSignedIn, signEvent } from "$lib/stores/auth.svelte";

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
  let commentsLoading = $state(false);
  let commentsError = $state("");
  let profiles = $state<Record<string, { displayName?: string; name?: string; picture?: string } | null>>({});
  let profilesLoading = $state(false);

  let zaps = $state<(ReturnType<typeof parseZapReceipt> & { id: string })[]>([]);
  let zapsLoading = $state(false);
  let zapperProfiles = $state(new Map<string, { displayName?: string; name?: string; picture?: string }>());

  let releases = $state<Release[]>([]);
  let releasesLoading = $state(false);
  let releasesModalOpen = $state(false);
  let releaseNotesExpanded = $state<Set<string>>(new Set());
  let downloadModalOpen = $state(false);
  let getStartedModalOpen = $state(false);
  let securityModalOpen = $state(false);
  let suggestionApps = $state<App[]>([]);
  let suggestionsLoading = $state(true);
  let suggestionsModalOpen = $state(false);

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
  const hasRepository = $derived(!!app?.repository);
  const isZapstorePublisher = $derived(
    !!app?.pubkey && !!ZAPSTORE_PUBKEY && app.pubkey.toLowerCase() === ZAPSTORE_PUBKEY.toLowerCase()
  );
  /** Zapstore app we link to in GetTheAppSection: show "Published by Developer" (Zapstore is the developer) */
  const ZAPSTORE_APP_NADDR = "naddr1qvzqqqr7pvpzq7xwd748yfjrsu5yuerm56fcn9tntmyv04w95etn0e23xrczvvraqqgxgetk9eaxzurnw3hhyefwv9c8qakg5jt";
  const isZapstoreApp = $derived(!!app?.naddr && app.naddr === ZAPSTORE_APP_NADDR);
  const publishedByDeveloper = $derived(
    isZapstoreApp || (!isZapstorePublisher && hasRepository)
  );

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

  // Load comments (cached comments from store show immediately; only show loading when no cache)
  async function loadComments() {
    if (!app?.pubkey || !app?.dTag) return;

    const hadCached = comments.length > 0;
    if (!hadCached) commentsLoading = true;
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

  /** Load replies that reference our comments/zaps via #e (e.g. from other apps that don't add #a). Returns all comment ids after merge (so caller can fetch zaps on them). */
  async function loadCommentReplies(): Promise<string[]> {
    if (!app?.pubkey || !app?.dTag) return comments.map((c) => c.id);
    const commentIds = comments.map((c) => c.id);
    const zapIds = zaps.map((z) => z.id);
    const allIds = [...new Set([...commentIds, ...zapIds])];
    if (allIds.length === 0) return commentIds;
    try {
      const events = await fetchCommentRepliesByE(allIds);
      const existingIds = new Set(comments.map((c) => c.id.toLowerCase()));
      const newEvents = events.filter((ev) => !existingIds.has(ev.id.toLowerCase()));
      if (newEvents.length === 0) return comments.map((c) => c.id);
      const newParsed = newEvents.map((ev) => {
        const p = parseComment(ev) as ReturnType<typeof parseComment> & { npub?: string };
        p.npub = nip19.npubEncode(ev.pubkey);
        return p;
      });
      comments = [...comments, ...newParsed];
      return comments.map((c) => c.id);
    } catch (err) {
      console.error("Failed to load comment replies by #e:", err);
      return comments.map((c) => c.id);
    }
  }

  /** 1) Fetch zaps that tag the main app/stack (#a) → main feed zaps. 2) Then fetch zaps that tag any comment or zap in that main feed (#e) and merge. One level only; deeper zaps later. */
  async function loadZaps() {
    if (!app?.pubkey || !app?.dTag) return;

    zapsLoading = true;
    try {
      // Step 1: zaps on the main event (app/stack) only
      const initialEvents = await fetchZaps(app.pubkey, app.dTag);
      const byId = new Map(initialEvents.map((e) => [e.id, e]));

      const parseOne = (e: NostrEvent) => {
        const parsed = { ...parseZapReceipt(e), id: e.id };
        if (!parsed.zappedEventId && e.tags?.length) {
          const eTag = e.tags.find((t: string[]) => (t[0]?.toLowerCase() === 'e') && t[1]);
          if (eTag?.[1]) parsed.zappedEventId = eTag[1];
        }
        return parsed;
      };

      zaps = Array.from(byId.values()).map(parseOne);
      await hydrateZapperProfiles();
    } catch (err) {
      console.error("Failed to load zaps:", err);
    } finally {
      zapsLoading = false;
    }
  }

  /** Fetch zaps that tag any of the given event ids (#e) and merge into zaps. Used for zaps on main-feed comments and zaps. */
  async function loadZapsByMainFeedIds(mainFeedEventIds: string[]) {
    if (!app?.pubkey || !app?.dTag || mainFeedEventIds.length === 0) return;

    try {
      const events = await fetchZaps(app.pubkey, app.dTag, { eventIds: mainFeedEventIds });
      const existingIds = new Set(zaps.map((z) => z.id.toLowerCase()));
      const newEvents = events.filter((e) => !existingIds.has(e.id.toLowerCase()));
      if (newEvents.length === 0) return;

      const parseOne = (e: NostrEvent) => {
        const parsed = { ...parseZapReceipt(e), id: e.id };
        if (!parsed.zappedEventId && e.tags?.length) {
          const eTag = e.tags.find((t: string[]) => (t[0]?.toLowerCase() === 'e') && t[1]);
          if (eTag?.[1]) parsed.zappedEventId = eTag[1].toLowerCase();
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
    } catch (err) {
      console.error("Failed to load zaps by main feed ids:", err);
    }
  }

  async function hydrateZapperProfiles() {
    const uniqueSenders = [...new Set(zaps.map((z) => z.senderPubkey).filter(Boolean))] as string[];
    const nextZapperProfiles = new Map(zapperProfiles);
    for (const pk of uniqueSenders) {
      const ev = queryStoreOne({ kinds: [0], authors: [pk] });
      if (ev?.content) {
        try {
          const c = JSON.parse(ev.content) as Record<string, unknown>;
          nextZapperProfiles.set(pk, {
            displayName: (c.display_name as string) ?? (c.name as string),
            name: c.name as string,
            picture: c.picture as string,
          });
        } catch {
          /* ignore */
        }
      }
    }
    zapperProfiles = new Map(nextZapperProfiles);
    const missing = uniqueSenders.filter((pk) => !nextZapperProfiles.has(pk)).slice(0, 20);
    await Promise.all(
      missing.map(async (pubkey) => {
        try {
          const event = await fetchProfile(pubkey);
          if (event?.content) {
            const content = JSON.parse(event.content) as Record<string, unknown>;
            const profile = {
              displayName: (content.display_name as string) ?? (content.name as string),
              name: content.name as string,
              picture: content.picture as string,
            };
            nextZapperProfiles.set(pubkey, profile);
            zapperProfiles = new Map(nextZapperProfiles);
          }
        } catch {
          /* ignore */
        }
      })
    );
  }

  async function handleCommentSubmit(event: {
    text: string;
    emojiTags: { shortcode: string; url: string }[];
    mentions: string[];
    parentId?: string;
    replyToPubkey?: string;
    rootPubkey?: string;
    parentKind?: number;
  }) {
    const userPubkey = getCurrentPubkey();
    if (!userPubkey || !app) return;
    const { text, emojiTags: submitEmojiTags, parentId, replyToPubkey, rootPubkey, parentKind } = event;
    const tempId = `pending-${Date.now()}`;
    const optimistic: (ReturnType<typeof parseComment> & { pending?: boolean; npub?: string }) = {
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
      const signed = await publishComment(
        text,
        { contentType: "app", pubkey: app.pubkey, identifier: app.dTag },
        signEvent as (t: import("nostr-tools").EventTemplate) => Promise<import("nostr-tools").NostrEvent>,
        submitEmojiTags,
        parentId,
        replyToPubkey ?? rootPubkey,
        parentKind
      );
      const parsed = parseComment(signed) as ReturnType<typeof parseComment> & { npub?: string };
      parsed.npub = nip19.npubEncode(signed.pubkey);
      comments = comments.filter((c) => c.id !== tempId);
      comments = [...comments, parsed];
      // So the new comment shows our name/avatar: ensure current user's profile is in profiles (cache first, then fetch)
      const existing = queryStoreOne({ kinds: [0], authors: [userPubkey] });
      if (existing?.content) {
        try {
          const c = JSON.parse(existing.content) as Record<string, unknown>;
          profiles = { ...profiles, [userPubkey]: { displayName: (c.display_name as string) ?? (c.displayName as string), name: c.name as string, picture: c.picture as string } };
        } catch {
          /* ignore */
        }
      } else {
        try {
          const event = await fetchProfile(userPubkey);
          if (event?.content) {
            const content = JSON.parse(event.content) as Record<string, unknown>;
            profiles = { ...profiles, [userPubkey]: { displayName: (content.display_name as string) ?? (content.displayName as string), name: content.name as string, picture: content.picture as string } };
          }
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.error("Failed to publish comment:", err);
      comments = comments.filter((c) => c.id !== tempId);
      commentsError =
        err instanceof Error ? err.message : "Comment could not be published to any relay.";
    }
  }

  async function loadReleases(aTag: string) {
    releasesLoading = true;
    try {
      const events = await fetchEvents(
        { kinds: [EVENT_KINDS.RELEASE], "#a": [aTag], limit: 50 },
        { relays: [...DEFAULT_CATALOG_RELAYS] }
      );
      const sorted = events.sort((a, b) => b.created_at - a.created_at);
      releases = sorted.map((e) => parseRelease(e));
      // Re-fetch zaps with release/metadata ids so we get #e-tagged zaps (legacy, match previous behavior)
      const latest = releases[0];
      if (latest && app?.pubkey && app?.dTag) {
        const ids = [latest.id, ...(latest.artifacts ?? [])];
        loadZapsByMainFeedIds(ids);
      }
    } catch (err) {
      console.error("Failed to load releases:", err);
      releases = [];
    } finally {
      releasesLoading = false;
    }
  }

  async function loadSuggestions(currentApp: App) {
    suggestionsLoading = true;
    suggestionApps = [];
    const currentKey = `${currentApp.pubkey}:${currentApp.dTag}`;
    const seen = new Set<string>();
    const collected: App[] = [];
    function addApp(a: App) {
      const key = `${a.pubkey}:${a.dTag}`;
      if (key === currentKey || seen.has(key)) return;
      seen.add(key);
      collected.push(a);
    }

    const relays = [...DEFAULT_CATALOG_RELAYS];

    try {
      // 1. Apps in stacks by this publisher — fetch from relays
      const stackEvents = await fetchEvents(
        {
          kinds: [EVENT_KINDS.APP_STACK],
          authors: [currentApp.pubkey],
          limit: 30,
        },
        { relays }
      );
      for (const ev of stackEvents) {
        const stack = parseAppStack(ev);
        for (const ref of stack.appRefs) {
          if (ref.kind !== EVENT_KINDS.APP) continue;
          const appEvs = await fetchEvents(
            {
              kinds: [EVENT_KINDS.APP],
              authors: [ref.pubkey],
              "#d": [ref.identifier],
              limit: 1,
            },
            { relays }
          );
          const appEv = appEvs[0];
          if (appEv) addApp(parseApp(appEv));
        }
      }

      // 2. Apps with same t tags — fetch from relays
      const raw = currentApp.rawEvent as { tags?: string[][] } | undefined;
      const tTags = (raw?.tags?.filter((t) => t[0] === "t").map((t) => t[1]).filter(Boolean) ?? []) as string[];
      for (const t of tTags) {
        const events = await fetchEvents(
          { kinds: [EVENT_KINDS.APP], "#t": [t], limit: 25 },
          { relays }
        );
        for (const ev of events) addApp(parseApp(ev));
      }

      // 3. Fetch apps from relays, then filter by first 10 (4+ letter) words from description
      const words = (currentApp.description ?? "")
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .slice(0, 10);
      if (words.length > 0) {
        const allAppEvents = await fetchEvents(
          { kinds: [EVENT_KINDS.APP], limit: 150 },
          { relays }
        );
        for (const ev of allAppEvents) {
          const a = parseApp(ev);
          const key = `${a.pubkey}:${a.dTag}`;
          if (key === currentKey) continue;
          const lowerDesc = (a.description ?? "").toLowerCase();
          const lowerName = (a.name ?? "").toLowerCase();
          const aRaw = a.rawEvent as { tags?: string[][] } | undefined;
          const inTags =
            aRaw?.tags?.some((tag) =>
              tag.some(
                (v, i) =>
                  i > 0 &&
                  words.some((w) => String(v).toLowerCase().includes(w.toLowerCase()))
              )
            ) ?? false;
          const matches =
            !!lowerDesc &&
            words.some(
              (w) =>
                lowerDesc.includes(w.toLowerCase()) ||
                lowerName.includes(w.toLowerCase()) ||
                inTags
            );
          if (matches) addApp(a);
        }
      }

      let result = collected.slice(0, 8);

      // Only if we didn't find enough related apps, load fallback (recent apps from relays)
      if (result.length < 8) {
        const fallbackEvents = await fetchEvents(
          { kinds: [EVENT_KINDS.APP], limit: 30 },
          { relays }
        );
        const byCreated = fallbackEvents
          .map((ev) => parseApp(ev))
          .filter((a) => {
            const k = `${a.pubkey}:${a.dTag}`;
            return k !== currentKey && !seen.has(k);
          })
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 8 - result.length);
        result = [...result, ...byCreated];
      }

      suggestionApps = result;
    } catch (e) {
      console.error("Suggestions load failed", e);
      const fromStore = getApps().filter((a) => `${a.pubkey}:${a.dTag}` !== currentKey).slice(0, 8);
      if (fromStore.length > 0) {
        suggestionApps = fromStore;
      } else {
        const allAppEvents = queryStore({ kinds: [EVENT_KINDS.APP], limit: 30 });
        suggestionApps = allAppEvents
          .map((ev) => parseApp(ev))
          .filter((a) => `${a.pubkey}:${a.dTag}` !== currentKey)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 8);
      }
    } finally {
      suggestionsLoading = false;
    }
  }

  onMount(async () => {
    if (!browser || !data.app) return;

    // Ensure IndexedDB cache (including profiles) is in EventStore before any queries (ARCHITECTURE: local-first)
    await initNostrService();

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
      // Sync: hydrate comment-author profiles from store so names/pics show immediately
      const nextProfiles = { ...profiles };
      const pubkeys = [...new Set(comments.map((c) => c.pubkey))];
      for (const pk of pubkeys) {
        const ev = queryStoreOne({ kinds: [0], authors: [pk] });
        if (ev?.content) {
          try {
            const c = JSON.parse(ev.content) as Record<string, unknown>;
            nextProfiles[pk] = {
              displayName: (c.display_name as string) ?? (c.displayName as string),
              name: c.name as string,
              picture: c.picture as string,
            };
          } catch {
            /* ignore */
          }
        }
      }
      profiles = nextProfiles;
    }

    // Load publisher profile
    if (data.app?.pubkey) {
      loadPublisherProfile(data.app.pubkey);
    }

    // Async cascade: comments, zaps, then replies by #e (so other apps’ replies show)
    Promise.all([loadComments(), loadZaps()]).then(async () => {
      const mainFeedZapIds = zaps.filter((z) => !z.zappedEventId).map((z) => z.id);
      const allCommentIds = await loadCommentReplies();
      loadZapsByMainFeedIds([...allCommentIds, ...mainFeedZapIds]);
    });

    // Background refresh from relays and load releases
    const schedule =
      "requestIdleCallback" in window
        ? window.requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1);

    schedule(async () => {
      await initNostrService();
      loadReleases(aTagValue);
      loadSuggestions(data.app!);

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
        <!-- Security Panel (opens Security modal on click) -->
        <button type="button" class="info-panel panel-security text-left w-full" onclick={() => (securityModalOpen = true)}>
          <div class="panel-header">
            <span class="text-base font-semibold" style="color: hsl(var(--foreground));">Security</span>
          </div>
          <div class="panel-list flex flex-col">
            <!-- 1. Published by Developer (check) or Published by Indexer (line) -->
            <div class="panel-list-item flex items-center gap-2" style="color: hsl(var(--white66));">
              {#if publishedByDeveloper}
                <svg class="security-check flex-shrink-0" width="14" height="10" viewBox="0 0 18 12" fill="none">
                  <path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" stroke="hsl(var(--blurpleColor))" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span class="text-sm">Published by Developer</span>
              {:else}
                <span class="security-line flex-shrink-0" aria-hidden="true"></span>
                <span class="text-sm">Published by Indexer</span>
              {/if}
            </div>
            <!-- 2. Open source (check) or Closed-source (line) -->
            <div class="panel-list-item flex items-center gap-2" style="color: hsl(var(--white66)); opacity: 0.9; transform: scale(0.98); transform-origin: left;">
              {#if hasRepository}
                <svg class="security-check flex-shrink-0" width="14" height="10" viewBox="0 0 18 12" fill="none">
                  <path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" stroke="hsl(var(--blurpleColor))" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span class="text-sm">Open source</span>
              {:else}
                <span class="security-line flex-shrink-0" aria-hidden="true"></span>
                <span class="text-sm">Closed-source</span>
              {/if}
            </div>
            <!-- 3. Trusted Catalog: always for all apps -->
            <div class="panel-list-item panel-list-item-last flex items-center gap-2" style="color: hsl(var(--white66)); opacity: 0.85; transform: scale(0.96); transform-origin: left;">
              <svg class="security-check flex-shrink-0" width="14" height="10" viewBox="0 0 18 12" fill="none">
                <path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" stroke="hsl(var(--blurpleColor))" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
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

        <!-- Suggestions Panel (desktop only; opens modal on click) -->
        <button type="button" class="info-panel panel-similar-desktop text-left w-full" onclick={() => (suggestionsModalOpen = true)}>
          <div class="panel-header">
            <span class="text-base font-semibold" style="color: hsl(var(--foreground));">Suggestions</span>
          </div>
          <div class="similar-apps-row flex gap-2">
            {#if suggestionsLoading}
              {#each Array(8) as _}
                <div class="suggestion-skeleton">
                  <SkeletonLoader />
                </div>
              {/each}
            {:else}
              {#each suggestionApps as sug}
                <AppPic size="md" name={sug.name} iconUrl={sug.icon} identifier={sug.dTag} />
              {/each}
            {/if}
          </div>
        </button>
      </div>

      <!-- Suggestions Panel (mobile only; opens modal on click) -->
      <div class="info-panels-secondary">
        <button type="button" class="info-panel panel-similar-mobile text-left w-full" onclick={() => (suggestionsModalOpen = true)}>
          <div class="panel-header">
            <span class="text-base font-semibold" style="color: hsl(var(--foreground));">Suggestions</span>
          </div>
          <div class="similar-apps-row flex gap-2">
            {#if suggestionsLoading}
              {#each Array(8) as _}
                <div class="suggestion-skeleton suggestion-skeleton-xs">
                  <SkeletonLoader />
                </div>
              {/each}
            {:else}
              {#each suggestionApps as sug}
                <AppPic size="xs" name={sug.name} iconUrl={sug.icon} identifier={sug.dTag} />
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
        mainEventIds={[app?.id, latestRelease?.id].filter(Boolean) as string[]}
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

    <!-- Releases Modal (dividers, same bg; header includes repo/website) -->
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
            <h2 class="text-display text-4xl text-foreground text-center mb-3">Releases</h2>
            {#if app.repository || app.url}
              <div class="releases-modal-app-info">
                {#if app.repository}
                  <div class="release-meta-row">
                    <span class="meta-label">Repository</span>
                    <a href={app.repository} target="_blank" rel="noopener noreferrer" class="meta-link">{app.repository}</a>
                  </div>
                {/if}
                {#if app.url}
                  <div class="release-meta-row">
                    <span class="meta-label">Website</span>
                    <a href={app.url} target="_blank" rel="noopener noreferrer" class="meta-link">{app.url}</a>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
          <div class="releases-modal-divider"></div>
          <div class="releases-modal-list">
            {#each releases as release, i}
              {@const notesExpanded = releaseNotesExpanded.has(release.id)}
              <div class="release-block">
                <h3 class="release-panel-version" style="color: hsl(var(--foreground));">{release.version}</h3>
                <div class="release-panel-meta">
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
                    {#if !notesExpanded}
                      <button
                        type="button"
                        class="read-more-btn"
                        onclick={(e) => { e.stopPropagation(); toggleReleaseNotesExpanded(release.id); }}
                      >
                        Read more
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="read-more-btn release-read-more-inline"
                        onclick={(e) => { e.stopPropagation(); toggleReleaseNotesExpanded(release.id); }}
                      >
                        Show less
                      </button>
                    {/if}
                  </div>
                {:else}
                  <p class="text-sm" style="color: hsl(var(--white33));">No release notes.</p>
                {/if}
              </div>
              {#if i < releases.length - 1}
                <div class="releases-modal-divider"></div>
              {/if}
            {/each}
          </div>
        </div>
      </Modal>
    {/if}

    <!-- Security Modal (simple: header + coming soon) -->
    {#if app}
      <Modal
        bind:open={securityModalOpen}
        ariaLabel="Security"
        maxHeight={90}
        class="security-modal"
      >
        <div class="security-modal-inner">
          <div class="security-modal-header">
            <h2 class="text-display text-4xl text-foreground text-center mb-3">Security</h2>
            <p class="text-sm text-center" style="color: hsl(var(--white66));">More Security metrics and tooling coming soon.</p>
          </div>
        </div>
      </Modal>
    {/if}

    <!-- Suggestions Modal -->
    <Modal
      bind:open={suggestionsModalOpen}
      ariaLabel="Suggestions"
      maxHeight={90}
      class="suggestions-modal"
    >
      <div class="suggestions-modal-inner">
        <div class="suggestions-modal-header">
          <h2 class="text-display text-4xl text-foreground text-center mb-3">Suggestions</h2>
          <p class="suggestions-modal-desc text-sm text-center" style="color: hsl(var(--white66));">
            The suggestion filter is very basic and dumb for now, while we are building smart search and suggestions.
          </p>
        </div>
        <div class="suggestions-modal-list">
          {#each suggestionApps as sug}
            {@const sugHref = sug.naddr ? `/apps/${sug.naddr}` : `/apps/${encodeAppNaddr(sug.pubkey, sug.dTag)}`}
            <AppSmallCard
              app={{ name: sug.name, icon: sug.icon, description: sug.description, descriptionHtml: sug.descriptionHtml, dTag: sug.dTag }}
              href={sugHref}
            />
          {/each}
        </div>
      </div>
    </Modal>

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

  .security-check {
    width: 14px;
    height: 10px;
  }

  .security-line {
    display: inline-block;
    width: 14px;
    height: 2.8px;
    background-color: hsl(var(--white33));
    border-radius: 1.4px;
  }

  .security-modal-inner {
    padding: 0;
  }

  .security-modal-header {
    padding: 1rem 1.5rem;
  }

  @media (min-width: 768px) {
    .security-modal-header {
      padding: 1.5rem 2rem;
    }
  }

  .suggestion-skeleton {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    overflow: hidden;
  }
  .suggestion-skeleton-xs {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }
  .suggestions-modal-inner {
    padding: 0;
  }
  .suggestions-modal-header {
    padding: 1rem 1.5rem;
  }
  .suggestions-modal-desc {
    max-width: 36rem;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.5;
  }
  .suggestions-modal-list {
    padding: 0 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow-y: auto;
  }
  @media (min-width: 768px) {
    .suggestions-modal-header {
      padding: 1.5rem 2rem;
    }
    .suggestions-modal-list {
      padding: 0 2rem 2rem;
      gap: 0.75rem;
    }
  }

  .panel-releases {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
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
    overflow: hidden;
  }

  .panel-similar-mobile {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .panel-similar-mobile .panel-header {
    margin-bottom: 6px;
  }

  .similar-apps-row {
    min-width: 0;
    overflow: hidden;
    /* Full-bleed to panel container edge so clip is at border, not inside padding */
    margin-left: -16px;
    margin-right: -16px;
    padding-left: 16px;
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

  /* Releases modal: zero padding so dividers full width; same bg throughout */
  .releases-modal-inner {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    padding: 0;
  }

  .releases-modal-header {
    flex-shrink: 0;
    padding: 1rem 1.5rem;
  }

  @media (min-width: 768px) {
    .releases-modal-header {
      padding: 1.5rem 2rem;
    }
  }

  .releases-modal-app-info {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    font-size: 0.875rem;
    color: hsl(var(--white66));
    justify-content: center;
  }

  .releases-modal-divider {
    flex-shrink: 0;
    width: 100%;
    height: 1px;
    background-color: hsl(var(--white16));
  }

  .releases-modal-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .release-block {
    padding: 0.5rem 1.25rem;
  }

  @media (min-width: 768px) {
    .release-block {
      padding: 0.75rem 1.5rem;
    }
  }

  .release-panel-version {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
  }

  .release-panel-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    margin-bottom: 0.5rem;
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
    color: hsl(var(--blurpleLightColor));
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
    -webkit-mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
    mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
  }

  .release-notes {
    font-size: 0.875rem;
    line-height: 1.5;
    color: hsl(var(--foreground) / 0.9);
    white-space: pre-wrap;
    margin: 0;
  }

  .release-notes-container:not(.expanded) {
    padding-bottom: 2.25rem;
  }

  .release-notes-container .read-more-btn {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
  }

  .release-notes-container .read-more-btn:hover {
    transform: translateX(-50%) scale(1.025);
  }

  .release-notes-container .read-more-btn:active {
    transform: translateX(-50%) scale(0.98);
  }

  .release-read-more-inline {
    position: relative !important;
    margin-top: 0.5rem;
    left: 0 !important;
    transform: none !important;
  }

  .release-read-more-inline:hover {
    transform: scale(1.025) !important;
  }

  .release-read-more-inline:active {
    transform: scale(0.98) !important;
  }

  @media (min-width: 768px) {
    .release-notes-container .read-more-btn {
      left: 0;
      transform: none;
    }

    .release-notes-container .read-more-btn:hover {
      transform: scale(1.025);
    }

    .release-notes-container .read-more-btn:active {
      transform: scale(0.98);
    }

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
