<script lang="js">
/**
 * SocialTabs - Tabbed interface for social content
 *
 * Displays tabs for: Comments, Zaps, Labels, Stacks, Details
 * Only loads content for the currently selected tab.
 */
import { AlertCircle } from "lucide-svelte";
import { wheelScroll } from "$lib/actions/wheelScroll.js";
import RootComment from "./RootComment.svelte";
import ZapBubble from "./ZapBubble.svelte";
import BubbleSkeleton from "./BubbleSkeleton.svelte";
import DetailsTab from "./DetailsTab.svelte";
import Spinner from "$lib/components/common/Spinner.svelte";
import { Zap } from "$lib/components/icons";
import { queryEvent } from "$lib/nostr";
import { EVENT_KINDS, PLATFORM_FILTER } from "$lib/config";
let { app = {}, stack = null, version = "", publisherProfile = null, zaps = [], zapperProfiles = new Map(), className = "", comments = [], commentsLoading = false, commentsError = "", zapsLoading = false, profiles = {}, profilesLoading = false, getAppSlug = () => "", getStackSlug = () => "", pubkeyToNpub = () => "", searchProfiles = async () => [], searchEmojis = async () => [], onCommentSubmit, onZapReceived, onGetStarted, mainEventIds = [], } = $props();
const staticTabs = [
    { id: "comments", label: "Comments" },
    { id: "zaps", label: "Zaps" },
    { id: "labels", label: "Labels" },
    { id: "stacks", label: "Stacks" },
    { id: "details", label: "Details" },
];
let activeTab = $state("comments");
/** Full Nostr event fetched only when Details tab is opened (perf: avoid loading full event until needed). */
let detailsRawData = $state(null);
$effect(() => {
    if (activeTab !== "details") {
        detailsRawData = null;
        return;
    }
    const target = stack ?? app;
    if (!target?.pubkey || !target?.dTag) {
        detailsRawData = null;
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
    // queryEvent is async (Dexie) — fire and update state when resolved
    queryEvent(filter).then((fromStore) => {
        if (fromStore) {
            detailsRawData = fromStore;
        } else {
            detailsRawData = null;
        }
    });
});
const totalZapAmount = $derived(zaps.reduce((sum, zap) => sum + (zap.amountSats || 0), 0));
/** Main feed: zaps on the main event (app/stack). Include zaps with no e-tag or e-tag in mainEventIds (e.g. app id, release id). */
const mainIdsSet = $derived(new Set((mainEventIds ?? []).map((id) => id.toLowerCase())));
const zapsOnMainEvent = $derived(zaps.filter((z) => z.comment &&
    z.comment.trim() &&
    (!z.zappedEventId || (z.zappedEventId && mainIdsSet.has(z.zappedEventId.toLowerCase())))));
const totalCommentCount = $derived(comments.length + zapsOnMainEvent.length);
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
            (npub ? `${npub.slice(0, 12)}...` : "Anonymous"),
        avatarUrl: profile?.picture ?? null,
        profileUrl: npub ? `/profile/${npub}` : "",
        profileLoading: profilesLoading && !hasProfile,
    };
}
const commentIds = $derived(new Set(comments.map((c) => c.id)));
// Model: main feed = zaps on the main event (app/stack) + root comments. For each item in the feed we have zaps (and comments) on that event; when you open its modal we reuse that same data.
// Only top-level comments (no parent) are roots in the main feed. Replies to comments or zaps must never appear as roots, so we require !c.parentId. This also avoids zap-thread replies flashing in the main feed before zaps are loaded.
const isRoot = (c) => !c.parentId;
const rootComments = $derived(comments
    .filter(isRoot)
    .map(enrichComment));
const repliesByParent = $derived.by(() => {
    const map = new Map();
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
    const map = new Map();
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
    const allZapIds = new Set(zaps.map((z) => z.id.toLowerCase()));
    const map = new Map();
    const norm = (id) => (id ?? "").toLowerCase();
    for (const zap of enrichedZaps) {
        const zapIdNorm = zap.id.toLowerCase();
        if (!allZapIds.has(zapIdNorm))
            continue;
        const direct = comments.filter((c) => norm(c.parentId) === zapIdNorm);
        const allIds = new Set(direct.map((c) => c.id));
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
    const byParent = new Map();
    for (const z of enrichedZaps) {
        const pid = norm(z.zappedEventId);
        if (!pid)
            continue;
        if (!byParent.has(pid))
            byParent.set(pid, []);
        byParent.get(pid).push(z);
    }
    const map = new Map();
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
    const map = new Map();
    for (const root of rootCommentsWithReplies) {
        const threadCommentIds = new Set();
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
        (senderNpub ? `${senderNpub.slice(0, 12)}…` : "Anonymous");
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
    /** Main feed: root comments + zaps on the main event (app/stack). Include zaps with no e-tag or e-tag in mainEventIds. */
    const mainIds = new Set((mainEventIds ?? []).map((id) => id.toLowerCase()));
    const mainEventZapsWithComments = enrichedZaps.filter((z) => z.comment &&
        z.comment.trim() &&
        (!z.zappedEventId || (z.zappedEventId && mainIds.has(z.zappedEventId.toLowerCase()))));
    const combined = [...commentsWithType, ...mainEventZapsWithComments];
    return combined.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
});
</script>

<div class="social-tabs {className}">
  <div class="tab-row" use:wheelScroll>
    {#each staticTabs as tab}
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
        {:else}
          {tab.label}
        {/if}
      </button>
    {/each}
  </div>

  <div class="tab-content">
    {#if activeTab === "comments"}
      {#if commentsError}
        <div class="mb-4 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle class="h-4 w-4 mt-0.5" />
          <div class="flex-1">{commentsError}</div>
        </div>
      {/if}

      {#if commentsLoading && combinedFeed.length === 0}
        <BubbleSkeleton />
      {:else if combinedFeed.length === 0}
        <div class="empty-state-panel">
          <p class="empty-state-text">No comments yet</p>
        </div>
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
                threadComments={threadByZapId.get(item.id) ?? []}
                threadZaps={threadZapsByZapId.get(item.id) ?? []}
                authorPubkey={app?.pubkey}
                resolveMentionLabel={(pk) => profiles[pk]?.displayName ?? profiles[pk]?.name}
                appIconUrl={app?.icon}
                appName={app?.name}
                appIdentifier={app?.dTag}
                {version}
                {searchProfiles}
                {searchEmojis}
                onReplySubmit={onCommentSubmit
                  ? (e) => onCommentSubmit({
                      text: e.text,
                      emojiTags: e.emojiTags,
                      mentions: e.mentions,
                      parentId: e.parentId,
                      replyToPubkey: e.replyToPubkey,
                      rootPubkey: e.rootPubkey,
                      parentKind: e.parentKind,
                    })
                  : undefined}
                onZapReceived={onZapReceived}
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
                resolveMentionLabel={(pk) => profiles[pk]?.displayName ?? profiles[pk]?.name}
                appIconUrl={app?.icon}
                appName={app?.name}
                appIdentifier={app?.dTag}
                {version}
                {searchProfiles}
                {searchEmojis}
                onReplySubmit={onCommentSubmit ? (e) => onCommentSubmit({ text: e.text, emojiTags: e.emojiTags, mentions: e.mentions, parentId: e.parentId, replyToPubkey: e.replyToPubkey }) : undefined}
                onZapReceived={onZapReceived}
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
        <div class="empty-state-panel">
          <p class="empty-state-text">No zaps yet</p>
        </div>
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
              message={zap.comment || ""}
              emojiTags={zap.emojiTags}
              resolveMentionLabel={(pk) => profiles[pk]?.displayName ?? profiles[pk]?.name}
            />
          {/each}
        </div>
      {/if}
    {:else if activeTab === "labels"}
      <div class="empty-state-panel">
        <p class="empty-state-text">Labels coming soon</p>
      </div>
    {:else if activeTab === "stacks"}
      <div class="empty-state-panel">
        <p class="empty-state-text">Stacks coming soon</p>
      </div>
    {:else if activeTab === "details"}
      <DetailsTab
        shareableId={stack
          ? (stack.pubkey && stack.dTag ? getStackSlug(stack.pubkey, stack.dTag) : "")
          : (app?.pubkey && app?.dTag ? getAppSlug(app.pubkey, app.dTag) : "")}
        publicationLabel={stack ? "Stack" : "App"}
        npub={safeNpubFromPubkey(stack?.pubkey ?? app?.pubkey)}
        pubkey={stack?.pubkey ?? app?.pubkey ?? ""}
        rawData={detailsRawData}
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

  .tab-stats {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-left: 2px;
    color: hsl(0 0% 100% / 0.44);
  }

  .empty-state-panel {
    width: 100%;
    min-height: 600px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    background: hsl(var(--gray16));
    border-radius: var(--radius-16, 16px);
  }

  .empty-state-text {
    font-size: 1.5rem;
    font-weight: 600;
    color: hsl(var(--white16));
    text-align: center;
    padding: 100px 0 48px;
    margin: 0;
  }
</style>
