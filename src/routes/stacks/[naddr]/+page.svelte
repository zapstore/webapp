<script lang="js">
/**
 * Stack Detail Page
 *
 * Displays a curated collection of apps with:
 * - Stack header with title and description
 * - App results grid (search-style cards, expandable when long)
 * - Social engagement (comments, zaps)
 * - Bottom bar for interactions
 */
import { page } from "$app/stores";
import { onMount } from "svelte";
import { SvelteSet, SvelteMap } from "svelte/reactivity";
import SeoHead from "$lib/components/layout/SeoHead.svelte";
import { browser } from "$app/environment";
import { beforeNavigate, goto } from "$app/navigation";
import {
	fetchProfilesBatch,
	queryEvent,
	parseComment,
	publishComment,
	parseZapReceipt,
	createStackDetailQuery,
	createStackSocialQuery
} from "$lib/purpleweb";
import { encodeAppNaddr, encodeStackNaddr, decodeNaddr } from "$lib/nostr";
import { stackDisplayDescription, stackDisplayTitle } from "$lib/nostr/models.js";
import { EVENT_KINDS, SITE_URL } from "$lib/config";
import { nip19 } from "nostr-tools";

import AppSmallCard from "$lib/components/cards/AppSmallCard.svelte";
import SocialTabs from "$lib/components/social/SocialTabs.svelte";
import DetailContentActions from "$lib/components/social/DetailContentActions.svelte";
import { resolve } from "$app/paths";
import SkeletonLoader from "$lib/components/common/SkeletonLoader.svelte";
import ProfilePic from "$lib/components/common/ProfilePic.svelte";
import ZappyError from "$lib/components/common/ZappyError.svelte";
import Timestamp from "$lib/components/common/Timestamp.svelte";
import { createSearchProfilesFunction } from "$lib/services/profile-search";
import { createSearchEmojisFunction } from "$lib/services/emoji-search";
import { getCurrentPubkey, getIsSignedIn, signEvent } from "$lib/stores/auth.svelte.js";
import SpinKeyModal from "$lib/components/modals/SpinKeyModal.svelte";
import GetStartedModal from "$lib/components/modals/GetStartedModal.svelte";
import OnboardingBuildingModal from "$lib/components/modals/OnboardingBuildingModal.svelte";
import Pen from "$lib/components/icons/Pen.svelte";
import { wheelScrollPassthrough } from "$lib/actions/wheelScrollPassthrough.js";
import "$lib/styles/bordered-detail-column.css";
let { data } = $props();
const stackNaddr = $derived($page.params.naddr ?? '');

const detail = createStackDetailQuery(() => ({
	naddr: stackNaddr,
	seedStack: data.stack,
	seedApps: data.apps,
	seedEvents: data.seedEvents,
	error: data.error ?? null
}));
const stack = $derived(detail.stack);
const apps = $derived(detail.apps);
const loading = $derived(detail.loading && !detail.stack);
const error = $derived(detail.error);
let comments = $state([]);
let commentsLoading = $state(false);
let commentsSyncing = $state(false);
let commentsError = $state("");
let getStartedModalOpen = $state(false);
let spinKeyModalOpen = $state(false);
let onboardingProfileName = $state('');
let onboardingBuildingModalOpen = $state(false);
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
const social = createStackSocialQuery(() => stack);
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
	for (const [pk, profile] of social.zapperProfiles) {
		zapperProfiles.set(pk, profile);
	}
});
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
// Check if current user owns this stack
const isOwner = $derived(
    getIsSignedIn() && 
    getCurrentPubkey() &&
    stack?.pubkey && 
    getCurrentPubkey() === stack.pubkey
);

/**
 * Merge the stack's own `t` tags (author-set labels) into the labelEntries list
 * so they show in the Labels tab alongside community kind-1985 labels.
 * Own tags appear first; if a community label uses the same text the pubkeys are merged.
 */
const mergedLabelEntries = $derived.by(() => {
    const tTags = (stack?.event?.tags ?? [])
        .filter((t) => t[0] === 't' && t[1])
        .map((t) => String(t[1]));

    if (!tTags.length) return labelEntries;

    const ownEntries = tTags.map((label) => {
        const existing = labelEntries.find((e) => e.label.toLowerCase() === label.toLowerCase());
        if (existing) {
            const pubkeys = existing.pubkeys.includes(stack.pubkey)
                ? existing.pubkeys
                : [stack.pubkey, ...existing.pubkeys];
            return { label: existing.label, pubkeys };
        }
        return { label, pubkeys: [stack.pubkey] };
    });

    const ownLabelsLower = new SvelteSet(ownEntries.map((e) => e.label.toLowerCase()));
    const remainingCommunity = labelEntries.filter(
        (e) => !ownLabelsLower.has(e.label.toLowerCase())
    );

    return [...ownEntries, ...remainingCommunity];
});
const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));
/** Collapsed preview: max cards before "View all" */
const STACK_APPS_PREVIEW_MAX = 6;
/** Max grid height when collapsed — must match CSS --stack-apps-clip-max-h per breakpoint */
const STACK_APPS_CLIP_MAX_HEIGHT_MOBILE_PX = 292;
const STACK_APPS_CLIP_MAX_HEIGHT_DESKTOP_PX = 400;

function getStackAppsClipMaxHeightPx() {
    if (!browser)
        return STACK_APPS_CLIP_MAX_HEIGHT_DESKTOP_PX;
    return window.matchMedia('(min-width: 768px)').matches
        ? STACK_APPS_CLIP_MAX_HEIGHT_DESKTOP_PX
        : STACK_APPS_CLIP_MAX_HEIGHT_MOBILE_PX;
}

let stackAppsExpanded = $state(false);
let stackAppsGridEl = $state(null);
let stackAppsHeightOverflow = $state(false);

const stackAppsNeedsViewAll = $derived(
    apps.length > STACK_APPS_PREVIEW_MAX || stackAppsHeightOverflow
);

/** Full list always; collapsed state clips via CSS max-height on the clip container */
const stackAppsDisplayList = $derived(apps);

$effect(() => {
    void stackNaddr;
    stackAppsExpanded = false;
});

$effect(() => {
    if (!browser || apps.length === 0) {
        stackAppsHeightOverflow = false;
        return;
    }
    if (stackAppsExpanded) {
        stackAppsHeightOverflow = apps.length > STACK_APPS_PREVIEW_MAX;
        return;
    }
    const el = stackAppsGridEl;
    if (!el)
        return;
    const measure = () => {
        if (stackAppsExpanded) {
            return;
        }
        const maxH = getStackAppsClipMaxHeightPx();
        stackAppsHeightOverflow =
            apps.length > STACK_APPS_PREVIEW_MAX || el.scrollHeight > maxH + 2;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mq = window.matchMedia('(min-width: 768px)');
    const onMqChange = () => measure();
    mq.addEventListener('change', onMqChange);
    void apps.length;
    return () => {
        ro.disconnect();
        mq.removeEventListener('change', onMqChange);
    };
});

// Save vertical scroll before navigating away
beforeNavigate(() => {
    if (!browser)
        return;
    const scrollState = {
        scrollY: window.scrollY,
        timestamp: Date.now(),
        stackNaddr
    };
    sessionStorage.setItem('stack_detail_scroll', JSON.stringify(scrollState));
});

function restoreScrollPositions() {
    if (!browser)
        return;
    const saved = sessionStorage.getItem('stack_detail_scroll');
    if (saved) {
        try {
            const scrollState = JSON.parse(saved);
            if (Date.now() - scrollState.timestamp < 5 * 60 * 1000 &&
                scrollState.stackNaddr === stackNaddr &&
                scrollState.scrollY > 0) {
                window.scrollTo(0, scrollState.scrollY);
            }
        }
        catch (_e) {
            /* ignore */
        }
        sessionStorage.removeItem('stack_detail_scroll');
    }
}
$effect(() => {
	if (!browser) return;
	const naddr = stackNaddr;
	if (!naddr) return;
	const pointer = decodeNaddr(naddr);
	if (!pointer && !naddr.startsWith('naddr1')) {
		goto(`/apps/${naddr}`, { replaceState: true });
		return;
	}
	if (pointer?.kind === EVENT_KINDS.APP) {
		goto(`/apps/${naddr}`, { replaceState: true });
	}
});

onMount(() => {
	restoreScrollPositions();
});

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
            } catch (_err) {
                /* ignore parse errors */
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
function getAppUrl(app) {
    return `/apps/${app.dTag}`;
}
// Computed display values for stack (same rules as AppStackCard)
const displayTitle = $derived(
    stack ? stackDisplayTitle({ title: stack.title, description: stack.description }) : ""
);
const displayDescription = $derived(
    stack
        ? stackDisplayDescription({ title: stack.title, description: stack.description }, displayTitle)
        : ""
);
const stackPublisherName = $derived(stack?.creator?.name || "");
const zapTarget = $derived(
    stack
        ? {
              name: stack.title || displayTitle,
              pubkey: stack.pubkey,
              dTag: stack.dTag,
              id: stack.id,
              pictureUrl: stack.creator?.picture,
              aTag: `${EVENT_KINDS.APP_STACK}:${stack.pubkey}:${stack.dTag}`,
          }
        : null
);
</script>

<SeoHead
  title="{stack?.title || 'Stack'} — Zapstore"
  description={stack?.description || "A curated collection of apps on Zapstore"}
  image={stack?.image || null}
  imageAlt="{stack?.title || 'Stack'} cover image"
  url="{SITE_URL}/stacks/{stackNaddr}"
  type="product"
/>

{#if error}
  <section class="stack-page stack-page--error">
    <ZappyError message="this stack wasn't found." />
  </section>
{:else}
<div class="app-detail-page" use:wheelScrollPassthrough>
  <div class="app-detail-outer container mx-auto px-0 sm:px-6 lg:px-8">
    <div class="app-detail-frame">
      <div class="app-detail-scroll stack-detail-scroll" data-main-scroll>
    {#if loading && !stack}
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

      <div class="section-container stack-apps-section">
        <ul class="stack-apps-grid stack-apps-grid--skeleton" aria-hidden="true">
          {#each Array(6) as _, i (i)}
            <li class="stack-apps-grid-item">
              <div class="skeleton-card">
                <div class="skeleton-icon"><SkeletonLoader /></div>
                <div class="skeleton-info">
                  <div class="skeleton-name"><SkeletonLoader /></div>
                  <div class="skeleton-desc-small"></div>
                </div>
              </div>
            </li>
          {/each}
        </ul>
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
              size="bubble"
            />
            <span class="detail-publisher-name">{stack.creator.name || stack.creator.npub?.slice(0, 12) + '...'}</span>
          </a>
        {:else}
          <div></div>
        {/if}
        {#if stack?.createdAt}
          <div class="detail-publisher-trailing">
            <Timestamp timestamp={stack.createdAt} size="xs" className="detail-publisher-timestamp" />
            {#if zapTarget}
              <DetailContentActions
                contentType="stack"
                target={zapTarget}
                appName={displayTitle}
                publisherName={stackPublisherName}
                searchProfiles={searchProfiles}
                searchEmojis={searchEmojis}
                onOwnContentDeleted={() => {
                  goto(resolve("/stacks"));
                }}
              />
            {/if}
          </div>
        {:else if zapTarget}
          <div class="detail-publisher-trailing">
            <DetailContentActions
              contentType="stack"
              target={zapTarget}
              appName={displayTitle}
              publisherName={stackPublisherName}
              searchProfiles={searchProfiles}
              searchEmojis={searchEmojis}
              onOwnContentDeleted={() => {
                goto(resolve("/stacks"));
              }}
            />
          </div>
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
              onclick={() => goto('/studio/stacks/' + stackNaddr)}
              aria-label="Edit stack"
            >
              <Pen size={14} variant="fill" color="var(--white66)" />
              <span class="edit-btn-text">Edit</span>
            </button>
          {/if}
        </div>
        {#if displayDescription}
          <p class="stack-description">{displayDescription}</p>
        {/if}
      </div>

      <!-- Apps Section -->
      <div class="section-container stack-apps-section">
        {#if apps.length > 0}
          <div
            class="stack-apps-clip"
            class:stack-apps-clip--collapsed={!stackAppsExpanded && stackAppsNeedsViewAll}
          >
            <ul class="stack-apps-grid" bind:this={stackAppsGridEl}>
              {#each stackAppsDisplayList as app (app.id)}
                <li class="stack-apps-grid-item">
                  <AppSmallCard {app} href={getAppUrl(app)} />
                </li>
              {/each}
            </ul>
            {#if !stackAppsExpanded && stackAppsNeedsViewAll}
              <div class="stack-apps-fade" aria-hidden="true"></div>
              <button
                type="button"
                class="stack-apps-view-all-btn"
                onclick={() => (stackAppsExpanded = true)}
              >
                View all {apps.length} {apps.length === 1 ? 'App' : 'Apps'}
              </button>
            {/if}
          </div>
        {:else}
          <div class="placeholder-content">
            <p class="text-muted-foreground regular14">
              No apps found in this stack.
            </p>
          </div>
        {/if}
      </div>

      <!-- Social tabs (Comments, Labels, etc.) -->
      <div class="stack-social-section">
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
          wrapperRoot={stack?.pubkey && stack?.dTag
            ? { kind: EVENT_KINDS.APP_STACK, pubkey: stack.pubkey, identifier: stack.dTag }
            : null}
          {zaps}
          {zapperProfiles}
          {zapsLoading}
          {comments}
          {commentsLoading}
          {commentsSyncing}
          {commentsError}
          {profiles}
          {profilesLoading}
          labelEntries={mergedLabelEntries}
          {labelsLoading}          searchProfiles={searchProfiles}
          searchEmojis={searchEmojis}
          onCommentSubmit={handleCommentSubmit}
          onZapPending={handleStackZapPending}
          onZapPendingClear={handleStackZapPendingClear}
          onZapReceived={handleStackBottomBarZap}
          onGetStarted={() => (getStartedModalOpen = true)}
          commentTarget={zapTarget}
          commentRecipientName={stackPublisherName}
          contentType="stack"
          {otherZaps}
          isSignedIn={getIsSignedIn()}
          getCurrentPubkey={getCurrentPubkey}
        />
      </div>
    {/if}
      </div>
    </div>
  </div>
</div>
{/if}

<!-- Onboarding modals (for Get Started flow from comment composer) -->
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
  .stack-page--error {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(100dvh - 64px);
    padding: 2rem;
  }

  /* Top inset above publisher row (stacks detail) */
  .app-detail-scroll.stack-detail-scroll {
    padding-top: 12px;
  }

  @media (min-width: 768px) {
    .app-detail-scroll.stack-detail-scroll {
      padding-top: 18px;
    }
  }

  /* ── Publisher info row (replaces DetailHeader) ── */
  .detail-publisher-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 0;
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
    color: var(--white66);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(.detail-publisher-timestamp) {
    color: var(--white33) !important;
    flex-shrink: 0;
  }

  .detail-publisher-trailing {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
    margin-left: auto;
  }

  /* Stack Header: column with title, then row with description + count */
  .stack-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
    margin-bottom: 16px;
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
    color: var(--white);
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
    color: var(--whiteEnforced);
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

  .stack-description {
    font-size: 1rem;
    color: var(--white66);
    margin: 0;
    line-height: 1.5;
  }

  @media (min-width: 768px) {
    .stack-title {
      font-size: 2rem;
    }

    .stack-description {
      font-size: 1.125rem;
    }
  }

  .section-container {
    margin-bottom: 24px;
    min-width: 0;
  }

  .stack-social-section {
    margin-top: 0;
    margin-bottom: 2rem;
  }

  .stack-apps-section {
    --stack-apps-clip-max-h: 292px;
    margin-left: calc(-1 * var(--detail-pad-x));
    margin-right: calc(-1 * var(--detail-pad-x));
    width: calc(100% + 2 * var(--detail-pad-x));
    margin-bottom: 16px;
    border-top: 1px solid var(--shell-border);
    border-bottom: 1px solid var(--shell-border);
  }

  @media (min-width: 768px) {
    .stack-apps-section {
      --stack-apps-clip-max-h: 400px;
    }
  }

  .stack-apps-section.section-container {
    margin-bottom: 16px;
  }

  .stack-apps-clip {
    position: relative;
  }

  .stack-apps-clip--collapsed {
    max-height: calc(var(--stack-apps-clip-max-h) + 48px);
    overflow: hidden;
    padding-bottom: 48px;
    box-sizing: border-box;
  }

  .stack-apps-grid {
    display: grid;
    grid-template-columns: 1fr;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  @media (min-width: 768px) {
    .stack-apps-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .stack-apps-grid-item {
    min-width: 0;
    padding: 14px 14px 8px;
    border-bottom: 1px solid var(--shell-border);
    box-sizing: border-box;
  }

  @media (min-width: 768px) {
    .stack-apps-grid-item {
      padding: 20px 20px 12px;
    }

    .stack-apps-grid-item:nth-child(odd) {
      border-right: 1px solid var(--shell-border);
    }
  }

  /* One section bottom border — clear last row cell borders (all states) */
  .stack-apps-section .stack-apps-grid-item:last-child {
    border-bottom: none;
  }

  @media (min-width: 768px) {
    /* Even app count: last row has two cells (penultimate is odd-indexed) */
    .stack-apps-section
      .stack-apps-grid-item:nth-last-child(2):nth-child(odd):not(:last-child) {
      border-bottom: none;
    }
  }

  .stack-apps-fade {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 72px;
    background: linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--black) 40%, transparent) 35%, var(--black) 100%);
    pointer-events: none;
    z-index: 2;
  }

  @media (min-width: 768px) {
    .stack-apps-fade {
      height: 120px;
    }
  }

  .stack-apps-view-all-btn {
    position: absolute;
    bottom: 16px;
    left: 14px;
    z-index: 3;
    height: 32px;
    padding: 0 14px;
    background-color: var(--gray66);
    border: none;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--white66);
    cursor: pointer;
    transition: transform 0.15s ease;
    white-space: nowrap;
  }

  .stack-apps-view-all-btn:hover {
    transform: scale(1.025);
    color: var(--white);
  }

  .stack-apps-view-all-btn:active {
    transform: scale(0.98);
  }

  @media (min-width: 768px) {
    .stack-apps-view-all-btn {
      left: 20px;
    }
  }

  .stack-apps-grid--skeleton .stack-apps-grid-item {
    padding: 14px 14px 8px;
  }

  @media (min-width: 768px) {
    .stack-apps-grid--skeleton .stack-apps-grid-item {
      padding: 20px 20px 12px;
    }
  }

  .placeholder-content {
    padding: 24px;
    background-color: var(--gray66);
    border-radius: 16px;
    text-align: center;
  }

  /* Skeleton styles */
  .skeleton-publisher-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
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
    background-color: var(--gray33);
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
    background-color: var(--gray33);
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
    background-color: var(--gray33);
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
