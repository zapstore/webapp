<script lang="js">
/**
 * SocialTabs - Tabbed interface for social content
 *
 * Displays tabs for: Comments, Zaps, Labels, Stacks, Details
 * Only loads content for the currently selected tab.
 *
 * Comments and zaps are loaded by parent routes via `fetchComments` / `fetchZaps` from the Zapstore relay.
 */
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { AlertCircle } from "lucide-svelte";
import { wheelScroll } from "$lib/actions/wheelScroll.js";
import RootComment from "./RootComment.svelte";
import ZapBubble from "./ZapBubble.svelte";
import BubbleSkeleton from "./BubbleSkeleton.svelte";
import DetailsTab from "./DetailsTab.svelte";
import EmptyState from "$lib/components/common/EmptyState.svelte";
import Spinner from "$lib/components/common/Spinner.svelte";
import Label from "$lib/components/common/Label.svelte";
import ProfilePicStack from "$lib/components/common/ProfilePicStack.svelte";
import { Zap } from "$lib/components/icons";
import { queryEvent, queryEvents, parseRelease } from "$lib/nostr";
import { EVENT_KINDS, PLATFORM_FILTER } from "$lib/config";
import { nip19 } from "nostr-tools";
let {
    app = {}, stack = null, version = "", publisherProfile: _publisherProfile = null,
    zaps = [], zapperProfiles = new SvelteMap(), className = "",
    comments = [], commentsLoading = false, commentsError = "",
    zapsLoading = false, profiles = {}, profilesLoading = false,
    getAppSlug = () => "", getStackSlug = () => "",
    pubkeyToNpub = () => "", searchProfiles = async () => [],
    searchEmojis = async () => [], signEvent = null, onCommentSubmit, onZapReceived, onZapPending, onZapPendingClear, onGetStarted,
    mainEventIds = [],
    // Details tab overrides — when provided, skip Dexie auto-fetch.
    // Accepts the same props as chateau-web's SocialTabs for a unified API.
    detailsRawData: detailsRawDataProp = null,
    detailsShareableId = "",
    detailsPublicationLabel = "",
    detailsNpub = "",
    detailsPubkey = "",
    detailsShareLink = "",
    detailsRepository = "",
    showDetailsTab = true,
    /** @type {Array<{ label: string, pubkeys: string[] }>} */
    labelEntries = [],
    labelsLoading = false,
    /** When set (e.g. from Activity ?comment=id), open the thread modal that contains this comment */
    openCommentId = null,
} = $props();

/** Root comment id whose thread contains openCommentId; used to open that thread modal on load */
const openThreadRootId = $derived.by(() => {
    const cid = openCommentId;
    const postId = mainEventIds?.[0];
    if (!cid || !postId || !comments.length) return null;
    let c = comments.find((x) => x.id === cid);
    if (!c) return null;
    while (c.parentId && c.parentId !== postId) {
        c = comments.find((x) => x.id === c.parentId);
        if (!c) return null;
    }
    return c.parentId === postId ? c.id : null;
});

const tabs = $derived([
    { id: "comments", label: "Comments" },
    { id: "zaps", label: "Zaps" },
    { id: "labels", label: "Labels" },
    ...(showDetailsTab ? [{ id: "details", label: "Details" }] : []),
]);
let activeTab = $state("comments");
/** Full Nostr event auto-fetched from Dexie when no detailsRawData prop is supplied. */
let autoFetchedDetails = $state(null);
$effect(() => {
    if (activeTab !== "details") {
        autoFetchedDetails = null;
        return;
    }
    // If a pre-fetched event was supplied as a prop, skip the Dexie lookup.
    if (detailsRawDataProp) {
        autoFetchedDetails = null;
        return;
    }
    const target = stack ?? app;
    if (!target?.pubkey || !target?.dTag) {
        autoFetchedDetails = null;
        return;
    }
    // Always fetch from Dexie — no rawEvent embedded in models
    const kind = stack ? EVENT_KINDS.APP_STACK : EVENT_KINDS.APP;
    const filter = {
        kinds: [kind],
        authors: [target.pubkey],
        "#d": [target.dTag],
        ...(kind === EVENT_KINDS.APP ? PLATFORM_FILTER : {}),
    };
    queryEvent(filter).then((fromStore) => {
        autoFetchedDetails = fromStore ?? null;
    });
});
/** Resolved details data: explicit prop wins over Dexie auto-fetch. */
const resolvedDetailsRawData = $derived(detailsRawDataProp ?? autoFetchedDetails);
/** Release events auto-fetched from Dexie for the Details tab (apps only). */
let autoFetchedReleases = $state([]);
$effect(() => {
    if (activeTab !== "details" || stack || !app?.pubkey || !app?.dTag) {
        autoFetchedReleases = [];
        return;
    }
    const aTagValue = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
    Promise.all([
        queryEvents({ kinds: [EVENT_KINDS.RELEASE], "#a": [aTagValue], limit: 50 }),
        queryEvents({ kinds: [EVENT_KINDS.RELEASE], "#i": [app.dTag], limit: 50 }),
    ]).then(([byA, byI]) => {
        const seen = new SvelteSet();
        const merged = [];
        for (const e of [...byA, ...byI]) {
            if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
        }
        merged.sort((a, b) => b.created_at - a.created_at);
        autoFetchedReleases = merged.slice(0, 50).map((e) => {
            const parsed = parseRelease(e);
            let naddr = '';
            try {
                naddr = nip19.naddrEncode({
                    kind: EVENT_KINDS.RELEASE,
                    pubkey: e.pubkey,
                    identifier: parsed.dTag,
                });
            } catch { /* ignore encoding errors */ }
            return { ...parsed, naddr, rawEvent: e };
        });
    });
});
const totalZapAmount = $derived(zaps.reduce((sum, zap) => sum + (zap.amountSats || 0), 0));
const zapsInCommentsFeed = $derived(
    zaps.filter((z) =>
        z.pending === true ||
        !!(z.comment && z.comment.trim()) ||
        ((z.emojiTags?.length ?? 0) > 0)
    )
);
const totalCommentCount = $derived(comments.length + zapsInCommentsFeed.length);
const totalLabelCount = $derived(labelEntries.length);
function safeNpubFromPubkey(pubkey) {
    if (typeof pubkey !== "string")
        return "";
    const normalized = pubkey.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalized))
        return "";
    try {
        return pubkeyToNpub(normalized) || "";
    }
    catch {
        return "";
    }
}
/** Same trimmed npub format as profile page: npub1xxx......yyyyyy */
function formatNpubDisplay(npubStr) {
    if (!npubStr || typeof npubStr !== "string") return "";
    const s = npubStr.trim();
    if (s.length < 14) return s;
    const afterPrefix = s.startsWith("npub1") ? s.slice(5, 8) : s.slice(0, 3);
    return s.startsWith("npub1") ? `npub1${afterPrefix}......${s.slice(-6)}` : `${afterPrefix}......${s.slice(-6)}`;
}
function formatSats(amount) {
    if (amount >= 1000000)
        return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000)
        return `${(amount / 1000).toFixed(1)}K`;
    return amount.toLocaleString();
}
function enrichComment(comment) {
    const profile = profiles[comment.pubkey] ?? zapperProfiles.get(comment.pubkey) ?? undefined;
    const hasProfile = profile !== undefined && profile !== null;
    const npub = comment.npub || safeNpubFromPubkey(comment.pubkey);
    return {
        ...comment,
        displayName: profile?.displayName ||
            profile?.name ||
            (npub ? formatNpubDisplay(npub) : "Anonymous"),
        avatarUrl: profile?.picture ?? null,
        profileUrl: npub ? `/profile/${npub}` : "",
        profileLoading: profilesLoading && !hasProfile,
    };
}
const commentIds = $derived(new SvelteSet(comments.map((c) => c.id)));
const zapIds = $derived(new SvelteSet(zaps.map((z) => (z.id ?? '').toLowerCase())));
// Model: main feed = zaps on the main event + root comments.
// A comment is a root if it has no parentId, AND its parentId is not another comment's ID,
// AND its parentId is not a zap receipt ID (zap-reply comments only appear inside the zap thread).
const isRoot = (c) => !c.parentId || (!commentIds.has(c.parentId) && !zapIds.has((c.parentId ?? '').toLowerCase()));
const rootComments = $derived(comments
    .filter(isRoot)
    .map(enrichComment));
const repliesByParent = $derived.by(() => {
    const map = new SvelteMap();
    comments
        .filter((c) => c.parentId && commentIds.has(c.parentId))
        .forEach((reply) => {
        const parentId = reply.parentId;
        if (!map.has(parentId)) {
            map.set(parentId, []);
        }
        map.get(parentId).push(enrichComment(reply));
    });
    return map;
});
const rootCommentsWithReplies = $derived(rootComments.map((comment) => ({
    ...comment,
    replies: repliesByParent.get(comment.id) || [],
})));
/** Full thread (root + all descendants) per root id, chronological, for the thread modal */
const threadByRootId = $derived.by(() => {
    const map = new SvelteMap();
    for (const root of rootCommentsWithReplies) {
        const collected = [root];
        const queue = [root.id];
        while (queue.length) {
            const parentId = queue.shift();
            const children = comments.filter((c) => c.parentId === parentId);
            for (const c of children) {
                const enriched = enrichComment(c);
                collected.push(enriched);
                queue.push(c.id);
            }
        }
        map.set(root.id, collected.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)));
    }
    return map;
});
/** Replies (and their descendants) per zap id, for zap thread modal. Zaps are not in comments, so key by zap id. */
const threadByZapId = $derived.by(() => {
    const allZapIds = new SvelteSet(zaps.map((z) => z.id.toLowerCase()));
    const map = new SvelteMap();
    const norm = (id) => (id ?? "").toLowerCase();
    for (const zap of enrichedZaps) {
        const zapIdNorm = zap.id.toLowerCase();
        if (!allZapIds.has(zapIdNorm))
            continue;
        const direct = comments.filter((c) => norm(c.parentId) === zapIdNorm);
        const allIds = new SvelteSet(direct.map((c) => c.id));
        let queue = [...direct.map((c) => c.id)];
        while (queue.length) {
            const parentId = queue.shift();
            const parentNorm = norm(parentId);
            const children = comments.filter((c) => norm(c.parentId) === parentNorm);
            for (const c of children) {
                allIds.add(c.id);
                queue.push(c.id);
            }
        }
        const thread = comments.filter((c) => allIds.has(c.id)).map((c) => enrichComment(c));
        map.set(zap.id, thread.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)));
    }
    return map;
});
/** For each root zap in the feed: zaps on that zap (e-tag = this receipt id). Modal shows these when opened. */
const threadZapsByZapId = $derived.by(() => {
    const norm = (id) => (id ?? "").toLowerCase();
    const byParent = new SvelteMap();
    for (const z of enrichedZaps) {
        const pid = norm(z.zappedEventId);
        if (!pid)
            continue;
        if (!byParent.has(pid))
            byParent.set(pid, []);
        byParent.get(pid).push(z);
    }
    const map = new SvelteMap();
    function collectDescendants(rootId) {
        const out = [];
        let queue = [rootId.toLowerCase()];
        while (queue.length) {
            const pid = queue.shift();
            const children = byParent.get(pid) ?? [];
            for (const z of children) {
                out.push(z);
                queue.push(z.id.toLowerCase());
            }
        }
        return out.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    }
    for (const zap of enrichedZaps) {
        const descendants = collectDescendants(zap.id.toLowerCase());
        if (descendants.length > 0)
            map.set(zap.id, descendants);
    }
    return map;
});
/** For each root comment in the feed: zaps on any event in that thread. Used when opening the modal for that root comment. */
const threadZapsByRootId = $derived.by(() => {
    const norm = (id) => (id ?? "").toLowerCase();
    const map = new SvelteMap();
    for (const root of rootCommentsWithReplies) {
        const threadCommentIds = new SvelteSet();
        let queue = [root.id];
        while (queue.length) {
            const cid = queue.shift();
            threadCommentIds.add(norm(cid));
            const kids = comments.filter((c) => norm(c.parentId) === norm(cid)).map((c) => c.id);
            queue.push(...kids);
        }
        const zapsInThread = enrichedZaps.filter((z) => z.zappedEventId && threadCommentIds.has(norm(z.zappedEventId)));
        if (zapsInThread.length > 0) {
            map.set(root.id, zapsInThread.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)));
        }
    }
    return map;
});
const enrichedZaps = $derived(zaps
    .map((zap) => {
    const profile = zap.senderPubkey ? zapperProfiles.get(zap.senderPubkey) : undefined;
    const senderNpub = safeNpubFromPubkey(zap.senderPubkey);
    const displayName = profile?.displayName?.trim() ||
        profile?.name?.trim() ||
        (senderNpub ? formatNpubDisplay(senderNpub) : "Anonymous");
    return {
        ...zap,
        type: "zap",
        displayName,
        avatarUrl: profile?.picture?.trim() || null,
        profileUrl: senderNpub ? `/profile/${senderNpub}` : "",
        timestamp: zap.createdAt,
    };
})
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
const combinedFeed = $derived.by(() => {
    const commentsWithType = rootCommentsWithReplies.map((c) => ({
        ...c,
        type: "comment",
        timestamp: c.createdAt,
    }));
    /** Comments tab includes text/emoji zaps and all pending zaps for immediate optimistic feedback. */
    const zapsForComments = enrichedZaps.filter((z) =>
        z.pending === true ||
        !!(z.comment && z.comment.trim()) ||
        ((z.emojiTags?.length ?? 0) > 0)
    );
    const combined = [...commentsWithType, ...zapsForComments];
    return combined.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
});
</script>

<div class="social-tabs {className}">
  <div class="tab-row" use:wheelScroll>
    {#each tabs as tab (tab.id)}
      <button
        type="button"
        class={activeTab === tab.id ? "btn-primary-small tab-selected" : "btn-secondary-small"}
        onclick={() => (activeTab = tab.id)}
      >
        {#if tab.id === "zaps"}
          <span>Zaps</span>
          <span class="tab-stats">
            {#if zapsLoading}
              <Spinner color="hsl(0 0% 100% / 0.44)" size={14} />
            {:else if totalZapAmount > 0}
              <Zap variant="fill" size={12} color="hsl(0 0% 100% / 0.44)" />
              <span>{formatSats(totalZapAmount).replace(' sats', '')}</span>
            {:else}
              0
            {/if}
          </span>
        {:else if tab.id === "comments"}
          <span>Comments</span>
          <span class="tab-stats">
            {#if commentsLoading}
              <Spinner color="hsl(0 0% 100% / 0.44)" size={14} />
            {:else}
              {totalCommentCount}
            {/if}
          </span>
        {:else if tab.id === "labels"}
          <span>Labels</span>
          <span class="tab-stats">
            {#if labelsLoading}
              <Spinner color="hsl(0 0% 100% / 0.44)" size={14} />
            {:else}
              {totalLabelCount}
            {/if}
          </span>
        {:else}
          {tab.label}
        {/if}
      </button>
    {/each}
  </div>

  <div class="tab-content">
    {#if activeTab === "comments"}
      {#if commentsError}
        <div class="mb-4 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-3 regular14 text-destructive">
          <AlertCircle class="h-4 w-4 mt-0.5" />
          <div class="flex-1">{commentsError}</div>
        </div>
      {/if}

      {#if commentsLoading && combinedFeed.length === 0}
        <BubbleSkeleton />
      {:else if combinedFeed.length === 0}
        <EmptyState message="No comments yet" minHeight={300} topAlign={true} />
      {:else}
        <div class="space-y-4">
          {#each combinedFeed as item (item.type === "zap" ? `zap-${item.id}` : item.id)}
            {#if item.type === "zap"}
              <RootComment
                id={item.id}
                pictureUrl={item.avatarUrl}
                name={item.displayName}
                pubkey={item.senderPubkey}
                timestamp={item.createdAt}
                profileUrl={item.profileUrl}
                content={item.comment || ""}
                emojiTags={item.emojiTags}
                isZapRoot={true}
                zapAmount={item.amountSats ?? 0}
                pending={item.pending === true}
                threadComments={threadByZapId.get(item.id) ?? []}
                threadZaps={threadZapsByZapId.get(item.id) ?? []}
                authorPubkey={app?.pubkey}
                openThreadOnMount={false}
                resolveMentionLabel={(pk) => profiles[pk]?.displayName ?? profiles[pk]?.name}
                appIconUrl={app?.icon}
                appName={app?.name}
                appIdentifier={app?.dTag}
                {version}
                {searchProfiles}
                {searchEmojis}
                signEvent={signEvent}
                onReplySubmit={onCommentSubmit
                  ? (e) => onCommentSubmit({
                      text: e.text,
                      emojiTags: e.emojiTags,
                      mentions: e.mentions,
                      mediaUrls: e.mediaUrls,
                      parentId: e.parentId,
                      replyToPubkey: e.replyToPubkey,
                      rootPubkey: e.rootPubkey,
                      parentKind: e.parentKind,
                    })
                  : undefined}
                onZapReceived={onZapReceived}
                {onZapPending}
                {onZapPendingClear}
                onGetStarted={onGetStarted}
              />
            {:else}
              <RootComment
                id={item.id}
                pictureUrl={item.avatarUrl}
                name={item.displayName}
                pubkey={item.pubkey}
                timestamp={item.createdAt}
                profileUrl={item.profileUrl}
                loading={item.profileLoading}
                pending={item.pending}
                replies={item.replies}
                threadComments={threadByRootId.get(item.id) ?? []}
                threadZaps={threadZapsByRootId.get(item.id) ?? []}
                authorPubkey={app?.pubkey}
                content={item.content}
                emojiTags={item.emojiTags}
                mediaUrls={item.mediaUrls ?? []}
                openThreadOnMount={item.id === openThreadRootId}
                expandCommentId={item.id === openThreadRootId ? openCommentId : null}
                resolveMentionLabel={(pk) => profiles[pk]?.displayName ?? profiles[pk]?.name}
                appIconUrl={app?.icon}
                appName={app?.name}
                appIdentifier={app?.dTag}
                version={item.version ?? ''}
                {searchProfiles}
                {searchEmojis}
                signEvent={signEvent}
                onReplySubmit={onCommentSubmit ? (e) => onCommentSubmit({ text: e.text, emojiTags: e.emojiTags, mentions: e.mentions, mediaUrls: e.mediaUrls, parentId: e.parentId, replyToPubkey: e.replyToPubkey, rootPubkey: e.rootPubkey, parentKind: e.parentKind }) : undefined}
                onZapReceived={onZapReceived}
                {onZapPending}
                {onZapPendingClear}
                onGetStarted={onGetStarted}
              >
              </RootComment>
            {/if}
          {/each}
        </div>
      {/if}
    {:else if activeTab === "zaps"}
      {#if zapsLoading && enrichedZaps.length === 0}
        <BubbleSkeleton />
      {:else if enrichedZaps.length === 0}
        <EmptyState message="No zaps yet" minHeight={300} topAlign={true} />
      {:else}
        <div class="space-y-4">
          {#each enrichedZaps as zap (zap.id)}
            <ZapBubble
              pictureUrl={zap.avatarUrl}
              name={zap.displayName}
              pubkey={zap.senderPubkey}
              amount={zap.amountSats || 0}
              timestamp={zap.createdAt}
              profileUrl={zap.profileUrl}
              pending={zap.pending === true}
              message={zap.comment || ""}
              emojiTags={zap.emojiTags}
              resolveMentionLabel={(pk) => profiles[pk]?.displayName ?? profiles[pk]?.name}
            />
          {/each}
        </div>
      {/if}
    {:else if activeTab === "labels"}
      {#if labelsLoading && labelEntries.length === 0}
        <BubbleSkeleton />
      {:else if labelEntries.length === 0}
        <EmptyState message="No labels yet" minHeight={150} topAlign={true} />
      {:else}
        <div class="labels-list">
          {#each labelEntries as entry (entry.label)}
            {@const stackProfiles = entry.pubkeys.slice(0, 3).map(pk => ({
              pubkey: pk,
              name: profiles[pk]?.displayName ?? profiles[pk]?.name ?? '',
              pictureUrl: profiles[pk]?.picture ?? undefined
            }))}
            {@const stackText = entry.pubkeys.length === 1
              ? (profiles[entry.pubkeys[0]]?.displayName ?? profiles[entry.pubkeys[0]]?.name ?? 'Someone')
              : entry.pubkeys.length === 2
                ? `${profiles[entry.pubkeys[0]]?.displayName ?? 'Someone'} & ${profiles[entry.pubkeys[1]]?.displayName ?? 'Someone'}`
                : `${profiles[entry.pubkeys[0]]?.displayName ?? 'Someone'} & others`}
            <div class="label-entry">
              <Label text={entry.label} isEmphasized={true} />
              <ProfilePicStack
                profiles={stackProfiles}
                text={stackText}
                suffix={entry.pubkeys.length > 1 ? String(entry.pubkeys.length) : ''}
                size="sm"
                onclick={() => {}}
              />
            </div>
          {/each}
        </div>
      {/if}
    {:else if activeTab === "details"}
      <DetailsTab
        shareableId={detailsShareableId || (stack
          ? (stack.pubkey && stack.dTag ? getStackSlug(stack.pubkey, stack.dTag) : "")
          : (app?.pubkey && app?.dTag ? getAppSlug(app.pubkey, app.dTag) : ""))}
        publicationLabel={detailsPublicationLabel || (stack ? "Stack" : "App")}
        npub={detailsNpub || safeNpubFromPubkey(stack?.pubkey ?? app?.pubkey)}
        pubkey={detailsPubkey || stack?.pubkey || app?.pubkey || ""}
        rawData={resolvedDetailsRawData}
        shareLink={detailsShareLink}
        repository={detailsRepository || app?.repository || ""}
        releases={autoFetchedReleases}
      />
    {/if}
  </div>
</div>

<style>
  .social-tabs {
    display: flex;
    flex-direction: column;
  }

  .tab-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 4px 2px;
    margin: -4px -2px;
  }

  .tab-row::-webkit-scrollbar {
    display: none;
  }

  .tab-row :global(.tab-selected) {
    background-image: var(--gradient-blurple66);
  }

  .tab-content {
    min-height: 100px;
    padding-top: 16px;
  }

  .tab-row :global(button) {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tab-row :global(button:hover) {
    box-shadow: none;
  }

  .labels-list {
    display: flex;
    flex-direction: column;
    background: var(--gray33);
    border-radius: 16px;
    overflow: hidden;
  }

  .label-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--white8);
  }

  .label-entry:last-child {
    border-bottom: none;
  }

  .tab-stats {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-left: 2px;
    color: hsl(0 0% 100% / 0.44);
  }

</style>
