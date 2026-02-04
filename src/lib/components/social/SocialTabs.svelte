<script lang="ts">
  /**
   * SocialTabs - Tabbed interface for social content
   *
   * Displays tabs for: Comments, Zaps, Labels, Stacks, Details
   * Only loads content for the currently selected tab.
   */
  import { Loader2, AlertCircle } from "lucide-svelte";
  import { wheelScroll } from "$lib/actions/wheelScroll.js";
  import RootComment from "./RootComment.svelte";
  import ZapBubble from "./ZapBubble.svelte";
  import DetailsTab from "./DetailsTab.svelte";
  import { Zap } from "$lib/components/icons";

  interface App {
    pubkey?: string;
    dTag?: string;
    icon?: string;
    name?: string;
    rawEvent?: unknown;
  }

  interface Stack {
    pubkey?: string;
    dTag?: string;
    title?: string;
    rawEvent?: unknown;
  }

  interface Profile {
    displayName?: string;
    name?: string;
    picture?: string;
  }

  interface Comment {
    id: string;
    pubkey: string;
    npub?: string;
    createdAt?: number;
    content?: string;
    contentHtml?: string;
    emojiTags?: { shortcode: string; url: string }[];
    parentId?: string | null;
    isReply?: boolean;
    /** True while the comment is being published (optimistic) */
    pending?: boolean;
  }

  interface ZapData {
    id: string;
    senderPubkey?: string;
    amountSats?: number;
    createdAt?: number;
    comment?: string;
  }

  interface Props {
    app?: App;
    stack?: Stack | null;
    version?: string;
    publisherProfile?: Profile | null;
    zaps?: ZapData[];
    zapperProfiles?: Map<string, Profile>;
    className?: string;
    comments?: Comment[];
    commentsLoading?: boolean;
    commentsError?: string;
    profiles?: Record<string, Profile | null>;
    profilesLoading?: boolean;
    getAppSlug?: (pubkey: string, dTag: string) => string;
    getStackSlug?: (pubkey: string, dTag: string) => string;
    pubkeyToNpub?: (pubkey: string) => string;
  }

  let {
    app = {},
    stack = null,
    version = "",
    publisherProfile = null,
    zaps = [],
    zapperProfiles = new Map(),
    className = "",
    comments = [],
    commentsLoading = false,
    commentsError = "",
    profiles = {},
    profilesLoading = false,
    getAppSlug = () => "",
    getStackSlug = () => "",
    pubkeyToNpub = () => "",
  }: Props = $props();

  const staticTabs = [
    { id: "comments", label: "Comments" },
    { id: "zaps", label: "Zaps" },
    { id: "labels", label: "Labels" },
    { id: "stacks", label: "Stacks" },
    { id: "details", label: "Details" },
  ];

  let activeTab = $state("comments");

  const totalZapAmount = $derived(zaps.reduce((sum, zap) => sum + (zap.amountSats || 0), 0));

  function formatSats(amount: number): string {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toLocaleString();
  }

  function enrichComment(comment: Comment) {
    const profile = profiles[comment.pubkey];
    const hasProfile = profile !== undefined;
    const npub = comment.npub ?? pubkeyToNpub(comment.pubkey);
    return {
      ...comment,
      displayName:
        profile?.displayName ||
        profile?.name ||
        (npub ? `${npub.slice(0, 12)}...` : "Anonymous"),
      avatarUrl: profile?.picture || null,
      profileUrl: npub ? `/profile/${npub}` : "",
      profileLoading: profilesLoading && !hasProfile,
    };
  }

  // Only treat as root if no parent, or parent is not in this comment set (e.g. reply-to-app)
  const commentIds = $derived(new Set(comments.map((c) => c.id)));
  const isRoot = (c: Comment) => !c.parentId || !commentIds.has(c.parentId);

  const rootComments = $derived(
    comments
      .filter(isRoot)
      .map(enrichComment)
  );

  const repliesByParent = $derived.by(() => {
    const map = new Map<string, ReturnType<typeof enrichComment>[]>();
    comments
      .filter((c) => c.parentId && commentIds.has(c.parentId))
      .forEach((reply) => {
        const parentId = reply.parentId!;
        if (!map.has(parentId)) {
          map.set(parentId, []);
        }
        map.get(parentId)!.push(enrichComment(reply));
      });
    return map;
  });

  const rootCommentsWithReplies = $derived(
    rootComments.map((comment) => ({
      ...comment,
      replies: repliesByParent.get(comment.id) || [],
    }))
  );

  const enrichedZaps = $derived(
    zaps
      .map((zap) => {
        const profile = zapperProfiles.get(zap.senderPubkey || "");
        return {
          ...zap,
          type: "zap" as const,
          displayName: profile?.displayName || profile?.name || "Anonymous",
          avatarUrl: profile?.picture || null,
          profileUrl: zap.senderPubkey ? `/profile/${pubkeyToNpub(zap.senderPubkey)}` : "",
          timestamp: zap.createdAt,
        };
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  );

  const combinedFeed = $derived.by(() => {
    const commentsWithType = rootCommentsWithReplies.map((c) => ({
      ...c,
      type: "comment" as const,
      timestamp: c.createdAt,
    }));

    const zapsWithComments = enrichedZaps.filter((zap) => zap.comment && zap.comment.trim());
    const combined = [...commentsWithType, ...zapsWithComments];

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
          {#if totalZapAmount > 0}
            <span class="tab-stats">
              <Zap variant="fill" size={12} color="hsl(0 0% 100% / 0.44)" />
              <span>{formatSats(totalZapAmount).replace(' sats', '')}</span>
            </span>
          {/if}
        {:else if tab.id === "comments"}
          <span>Comments</span>
          {#if rootCommentsWithReplies.length > 0}
            <span class="tab-stats">{rootCommentsWithReplies.length}</span>
          {/if}
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

      {#if commentsLoading}
        <div class="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 class="h-4 w-4 animate-spin" />
          <span>Loading comments...</span>
        </div>
      {:else if combinedFeed.length === 0}
        <p class="text-sm text-muted-foreground">
          No comments yet. Be the first to share feedback.
        </p>
      {:else}
        <div class="space-y-4">
          {#each combinedFeed as item (item.type === "zap" ? `zap-${item.id}` : item.id)}
            {#if item.type === "zap"}
              <ZapBubble
                pictureUrl={item.avatarUrl}
                name={item.displayName}
                pubkey={item.senderPubkey}
                amount={item.amountSats || 0}
                timestamp={item.createdAt}
                profileUrl={item.profileUrl}
                message={item.comment || ""}
              />
            {:else}
              <RootComment
                pictureUrl={item.avatarUrl}
                name={item.displayName}
                pubkey={item.pubkey}
                timestamp={item.createdAt}
                profileUrl={item.profileUrl}
                loading={item.profileLoading}
                pending={item.pending}
                replies={item.replies}
                authorPubkey={app?.pubkey}
                content={item.content}
                emojiTags={item.emojiTags}
                resolveMentionLabel={(pk) => profiles[pk]?.displayName ?? profiles[pk]?.name}
                appIconUrl={app?.icon}
                appName={app?.name}
                appIdentifier={app?.dTag}
                {version}
              >
              </RootComment>
            {/if}
          {/each}
        </div>
      {/if}
    {:else if activeTab === "zaps"}
      {#if enrichedZaps.length === 0}
        <p class="text-sm text-muted-foreground">
          No zaps yet. Be the first to zap this app.
        </p>
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
            />
          {/each}
        </div>
      {/if}
    {:else if activeTab === "labels"}
      <p class="text-sm text-muted-foreground">Labels coming soon...</p>
    {:else if activeTab === "stacks"}
      <p class="text-sm text-muted-foreground">Stacks coming soon...</p>
    {:else if activeTab === "details"}
      <DetailsTab
        shareableId={stack
          ? (stack.pubkey && stack.dTag ? getStackSlug(stack.pubkey, stack.dTag) : "")
          : (app?.pubkey && app?.dTag ? getAppSlug(app.pubkey, app.dTag) : "")}
        publicationLabel={stack ? "Stack" : "App"}
        npub={(stack?.pubkey ?? app?.pubkey) ? pubkeyToNpub(stack?.pubkey ?? app?.pubkey ?? "") : ""}
        pubkey={stack?.pubkey ?? app?.pubkey ?? ""}
        rawData={stack ? (stack.rawEvent ?? stack) : (app?.rawEvent ?? app)}
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
</style>
