<script lang="js">
import { browser } from '$app/environment';
import SeoHead from '$lib/components/layout/SeoHead.svelte';
import { fetchProfile, createProfileDetailQuery } from '$lib/purpleweb';
import { encodeStackNaddr } from '$lib/nostr';
import { SITE_URL } from '$lib/config';
import { nip19 } from 'nostr-tools';
import { wheelScrollPassthrough } from '$lib/actions/wheelScrollPassthrough.js';
import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
import '$lib/styles/bordered-detail-column.css';
import { parseShortText } from '$lib/utils/short-text-parser.js';
import { getCurrentPubkey } from '$lib/stores/auth.svelte.js';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import ProfileAppsBrowseSections from '$lib/components/profile/ProfileAppsBrowseSections.svelte';
import ShortTextRenderer from '$lib/components/common/ShortTextRenderer.svelte';
import Modal from '$lib/components/common/Modal.svelte';
import ProfileActivityTab from '$lib/components/profile/ProfileActivityTab.svelte';
import ProfileDetailsTab from '$lib/components/profile/ProfileDetailsTab.svelte';
import ActivityFeedSkeleton from '$lib/components/community/ActivityFeedSkeleton.svelte';

let { data } = $props();
const npub = $derived(data.npub ?? '');
const pubkey = $derived(data.pubkey);

// Local-first profile data via purpleweb (Dexie liveQuery + relay hydration).
const detail = createProfileDetailQuery(() => ({
	pubkey: pubkey ?? '',
	appFilterPrefix: data.appFilterPrefix ?? null,
	seedProfile: data.profile,
	seedApps: data.apps,
	seedStacks: data.stacks,
	seedResolvedStacks: data.resolvedStacks,
	seedEvents: data.seedEvents
}));
const profile = $derived(detail.profile);
const apps = $derived(detail.apps);
const resolvedStacks = $derived(detail.resolvedStacks);
const profileLoading = $derived(!profile && detail.loading);
const appsLoading = $derived(apps.length === 0 && detail.loading);
const stacksLoading = $derived(resolvedStacks.length === 0 && detail.loading);

let detailsModalOpen = $state(false);
let activityMounted = $state(false);
let activitySentinel = $state(/** @type {HTMLElement | null} */ (null));
let mentionProfiles = $state({});

const profileName = $derived(
	profile?.displayName || profile?.name || (npub ? `${npub.slice(0, 12)}...` : 'Anonymous')
);
const profileNameForPic = $derived(profile?.displayName || profile?.name || null);
const profilePictureUrl = $derived(profile?.picture ?? '');
const _isConnected = $derived(getCurrentPubkey() !== null);

async function loadMentionProfiles(about) {
	const segments = parseShortText({ text: about, emojiTags: [] });
	const pubkeys = [...new Set(segments.filter((s) => s.type === 'mention').map((s) => s.pubkey))];
	if (pubkeys.length === 0) return;
	const results = await Promise.all(
		pubkeys.map(async (pk) => {
			try {
				const event = await fetchProfile(pk);
				if (event?.content) {
					const c = JSON.parse(event.content);
					const name = c.display_name || c.name;
					if (name) return [pk, name];
				}
			} catch {
				/* ignore */
			}
			return null;
		})
	);
	const next = {};
	for (const result of results) {
		if (result) next[result[0]] = result[1];
	}
	if (Object.keys(next).length > 0) mentionProfiles = { ...mentionProfiles, ...next };
}

$effect(() => {
	const about = profile?.about?.trim();
	if (about && browser) loadMentionProfiles(about);
});

/** Reset lazy activity when navigating to another profile. */
let lastActivityPubkey = '';
$effect(() => {
	const pk = pubkey ?? '';
	if (pk !== lastActivityPubkey) {
		lastActivityPubkey = pk;
		activityMounted = false;
	}
});

/** Defer ProfileActivityTab until Activity nears the viewport (viewport IO — works with nested scroll). */
$effect(() => {
	if (!browser || activityMounted || !pubkey) return;
	const el = activitySentinel;
	if (!el) return;

	const observer = new IntersectionObserver(
		(entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				activityMounted = true;
				observer.disconnect();
			}
		},
		{ rootMargin: '200px 0px', threshold: 0 }
	);
	observer.observe(el);
	return () => observer.disconnect();
});

function stackToCard(s, resolvedApps) {
	const creatorNpub = pubkey ? nip19.npubEncode(pubkey) : '';
	const appRefs = s.appRefs || [];
	const appsList =
		resolvedApps && resolvedApps.length > 0
			? resolvedApps.map((a) => ({ name: a.name || a.dTag || '', icon: a.icon, dTag: a.dTag }))
			: appRefs.map((ref) => ({ name: ref.identifier, dTag: ref.identifier }));
	return {
		name: s.title || s.dTag || 'Untitled',
		description: s.description || '',
		apps: appsList,
		creator: pubkey
			? { name: profileName, picture: profilePictureUrl, pubkey, npub: creatorNpub }
			: undefined,
		pubkey: s.pubkey,
		dTag: s.dTag
	};
}

const stackCards = $derived(
	resolvedStacks.map(({ stack, apps: resolvedApps }) => stackToCard(stack, resolvedApps))
);

function getAppUrl(app) {
	return app.dTag ? `/apps/${app.dTag}` : '#';
}

function getStackUrl(stack) {
	const naddr = encodeStackNaddr(stack?.pubkey, stack?.dTag);
	return naddr ? `/stacks/${naddr}` : '#';
}
</script>

<SeoHead
	title="{profileName} — Profile — Zapstore"
	description={profile?.about || `${profileName}'s profile on Zapstore`}
	image={profilePictureUrl || null}
	imageAlt="{profileName} profile picture"
	url="{SITE_URL}/profile/{npub}"
	type="profile"
/>

{#if !pubkey}
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
		<div class="rounded-lg bg-destructive/10 border border-destructive/20 p-6 max-w-md mx-auto text-center">
			<h3 class="semibold18 text-destructive mb-2">Invalid profile</h3>
			<p class="text-muted-foreground">The profile address (npub) is not valid.</p>
		</div>
	</div>
{:else}
	<div class="app-detail-page" use:wheelScrollPassthrough>
		<div class="app-detail-outer container mx-auto px-0 sm:px-6 lg:px-8">
			<div class="app-detail-frame">
				<div class="app-detail-scroll profile-detail-scroll" data-main-scroll>
					<div class="profile-header">
						<div class="profile-pic-cell">
							<ProfilePic
								pictureUrl={profilePictureUrl || undefined}
								{pubkey}
								name={profileNameForPic}
								size="3xl"
								loading={profileLoading}
							/>
						</div>

						<div class="profile-info">
							<h1 class="profile-name">{profileName}</h1>

							{#if profile?.about?.trim()}
								<div class="profile-about-clamp">
									<ShortTextRenderer
										content={profile.about}
										resolveMentionLabel={(pk) => mentionProfiles[pk]}
									/>
								</div>
							{:else if !profileLoading}
								<p class="profile-about-empty">No description</p>
							{/if}

							<button
								type="button"
								class="btn-secondary-small profile-details-btn"
								onclick={() => (detailsModalOpen = true)}
							>
								Details
							</button>
						</div>
					</div>

					<div class="profile-section-divider" aria-hidden="true"></div>

					<div class="profile-browse-content">
						<ProfileAppsBrowseSections
							{apps}
							{appsLoading}
							{stackCards}
							{stacksLoading}
							{getAppUrl}
							{getStackUrl}
						/>
					</div>

					<section class="profile-activity-section" aria-label="Activity">
						<SectionHeader title="Activity" />
						<div class="profile-activity-content">
							<div bind:this={activitySentinel} class="profile-activity-sentinel" aria-hidden="true"></div>
							{#if activityMounted}
								{#key pubkey}
									<ProfileActivityTab
										{pubkey}
										profileName={profileName}
										profilePicture={profilePictureUrl}
									/>
								{/key}
							{:else}
								<div class="profile-activity-skeleton-wrap">
									<ActivityFeedSkeleton rows={4} />
								</div>
							{/if}
						</div>
					</section>
				</div>
			</div>
		</div>
	</div>

	<Modal bind:open={detailsModalOpen} title="Details" ariaLabel="Profile details" align="bottom" wide>
		<div class="modal-sheet-body">
			{#if detailsModalOpen}
				<ProfileDetailsTab
					{npub}
					{pubkey}
					about={profile?.about ?? ''}
					panelBackground="black33"
					resolveMentionLabel={(pk) => mentionProfiles[pk]}
				/>
			{/if}
		</div>
	</Modal>
{/if}

<style>
	.profile-detail-scroll {
		padding-top: 0;
	}

	/* ── Profile header ───────────────────────────────────────────────────── */
	.profile-header {
		--profile-pic-size: 104px;
		--profile-pic-cell-pad: 20px;
		display: flex;
		align-items: flex-start;
		margin-left: calc(-1 * var(--page-content-pad-x, 0px));
		margin-right: calc(-1 * var(--page-content-pad-x, 0px));
		width: calc(100% + 2 * var(--page-content-pad-x, 0px));
	}

	@media (min-width: 768px) {
		.profile-header {
			--profile-pic-size: 140px;
			--profile-pic-cell-pad: 24px;
		}
	}

	.profile-pic-cell {
		flex-shrink: 0;
		padding: var(--profile-pic-cell-pad);
		border-right: 1px solid var(--white16);
		box-sizing: border-box;
	}

	.profile-pic-cell :global(.profile-pic) {
		display: block;
		width: var(--profile-pic-size) !important;
		height: var(--profile-pic-size) !important;
		min-width: var(--profile-pic-size) !important;
		min-height: var(--profile-pic-size) !important;
	}

	.profile-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: var(--profile-pic-cell-pad);
		padding-right: var(--detail-pad-x, 12px);
	}

	@media (max-width: 767px) {
		.profile-info {
			padding-bottom: 12px;
		}
	}

	.profile-name {
		font-size: 1.5rem;
		font-weight: 900;
		color: var(--white);
		line-height: 1.15;
		margin: 0 0 8px;
		word-break: break-word;
	}

	@media (min-width: 640px) {
		.profile-name {
			font-size: 1.75rem;
		}
	}
	@media (min-width: 768px) {
		.profile-name {
			font-size: 2.25rem;
		}
	}

	.profile-about-clamp {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 0.875rem;
		line-height: 1.4;
		color: var(--white66);
		margin-bottom: 8px;
	}

	.profile-about-clamp :global(.short-text-renderer),
	.profile-about-clamp :global(.short-text-text) {
		color: var(--white66);
	}

	.profile-about-empty {
		margin: 0 0 8px;
		font-size: 0.875rem;
		color: var(--white33);
	}

	.profile-details-btn {
		align-self: flex-start;
		flex-shrink: 0;
	}

	@media (max-width: 767px) {
		.profile-details-btn {
			height: auto;
			padding: 0;
			background: none;
			border-radius: 0;
			font-size: 0.875rem;
			font-weight: 500;
			color: var(--white33);
			transform: none;
		}

		.profile-details-btn:hover,
		.profile-details-btn:active {
			transform: none;
			color: var(--white66);
		}
	}

	@media (min-width: 768px) {
		.profile-details-btn {
			color: var(--white66);
		}
	}

	.profile-section-divider {
		flex-shrink: 0;
		height: 1.4px;
		margin: 0 calc(-1 * var(--page-content-pad-x, 0px)) 0;
		width: calc(100% + 2 * var(--page-content-pad-x, 0px));
		background-color: var(--white11);
		border: none;
	}

	.profile-browse-content {
		margin-left: calc(-1 * var(--page-content-pad-x, 0px));
		margin-right: calc(-1 * var(--page-content-pad-x, 0px));
		width: calc(100% + 2 * var(--page-content-pad-x, 0px));
	}

	.profile-activity-section {
		margin-top: 24px;
		margin-left: calc(-1 * var(--page-content-pad-x, 0px));
		margin-right: calc(-1 * var(--page-content-pad-x, 0px));
		width: calc(100% + 2 * var(--page-content-pad-x, 0px));
	}

	.profile-activity-section :global(.section-header) {
		padding-left: var(--detail-pad-x, 12px);
		padding-right: var(--detail-pad-x, 12px);
		margin: 0 0 12px;
	}

	@media (min-width: 768px) {
		.profile-activity-section :global(.section-header) {
			padding-left: 20px;
			padding-right: 20px;
		}
	}

	.profile-activity-content {
		border-top: 1px solid var(--white16);
	}

	.profile-activity-sentinel {
		height: 1px;
		width: 100%;
		margin: 0;
		padding: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.profile-activity-content :global(.activity-feed-skeleton) {
		padding: 0;
	}

	.profile-activity-skeleton-wrap {
		padding: 0;
	}

	.profile-activity-skeleton-wrap :global(.activity-feed-skeleton) {
		padding: 0;
	}

	.modal-sheet-body {
		padding: 12px 12px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	@media (min-width: 768px) {
		.modal-sheet-body {
			padding: 16px 16px max(20px, env(safe-area-inset-bottom, 0px));
		}
	}
</style>
