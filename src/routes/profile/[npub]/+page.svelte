<script lang="js">
import { onMount } from 'svelte';
import { SvelteSet, SvelteMap } from 'svelte/reactivity';
import { browser } from '$app/environment';
import SeoHead from '$lib/components/layout/SeoHead.svelte';
import { fetchProfile, queryEvents, encodeStackNaddr, parseApp, parseAppStack, fetchAppsByAuthorFromRelays, fetchAppFromRelays } from '$lib/nostr';
import { ZAPSTORE_RELAY, SAVED_APPS_STACK_D_TAG, SITE_URL } from '$lib/config';
import { nip19 } from 'nostr-tools';
import { wheelScroll } from '$lib/actions/wheelScroll.js';
import { wheelScrollPassthrough } from '$lib/actions/wheelScrollPassthrough.js';
import '$lib/styles/bordered-detail-column.css';
import { parseShortText } from '$lib/utils/short-text-parser.js';
import { getCurrentPubkey } from '$lib/stores/auth.svelte.js';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import ProfileAppsBrowseSections from '$lib/components/profile/ProfileAppsBrowseSections.svelte';
import ShortTextRenderer from '$lib/components/common/ShortTextRenderer.svelte';
import Modal from '$lib/components/common/Modal.svelte';
import ProfileActivityTab from '$lib/components/profile/ProfileActivityTab.svelte';
import ProfileDetailsTab from '$lib/components/profile/ProfileDetailsTab.svelte';
import { hexToColor } from '$lib/utils/color.js';
import { Copy, Check } from '$lib/components/icons';
let { data } = $props();
const npub = $derived(data.npub ?? '');
const pubkey = $derived(data.pubkey);
let profile = $state(null);
let profileLoading = $state(false);
let apps = $state([]);
let appsLoading = $state(true);
let stacks = $state([]);
let stacksLoading = $state(true);
let descriptionModalOpen = $state(false);
let colorCopied = $state(false);
let activeTab = $state('apps');
let mentionProfiles = $state({});
let resolvedStacks = $state([]);

const profileName = $derived(profile?.displayName || profile?.name || (npub ? `${npub.slice(0, 12)}...` : 'Anonymous'));
const profileNameForPic = $derived(profile?.displayName || profile?.name || null);
const profilePictureUrl = $derived(profile?.picture ?? '');
const _isConnected = $derived(getCurrentPubkey() !== null);
const profileColor = $derived(pubkey ? hexToColor(pubkey) : { r: 128, g: 128, b: 128 });
const profileColorHex = $derived(
	`#${profileColor.r.toString(16).padStart(2, '0')}${profileColor.g.toString(16).padStart(2, '0')}${profileColor.b.toString(16).padStart(2, '0')}`.toUpperCase()
);

async function loadProfile(pk) {
	profileLoading = true;
	try {
		const event = await fetchProfile(pk);
		if (event?.content) {
			const c = JSON.parse(event.content);
			profile = { name: c.name, displayName: c.display_name || c.name, picture: c.picture, about: c.about };
		} else {
			profile = {};
		}
	} catch {
		profile = {};
	} finally {
		profileLoading = false;
	}
}

async function loadMentionProfiles(about) {
	const segments = parseShortText({ text: about, emojiTags: [] });
	const pubkeys = [...new Set(segments.filter((s) => s.type === 'mention').map((s) => s.pubkey))];
	if (pubkeys.length === 0) return;
	const results = await Promise.all(pubkeys.map(async (pk) => {
		try {
			const event = await fetchProfile(pk);
			if (event?.content) {
				const c = JSON.parse(event.content);
				const name = c.display_name || c.name;
				if (name) return [pk, name];
			}
		} catch { /* ignore */ }
		return null;
	}));
	const next = {};
	for (const result of results) { if (result) next[result[0]] = result[1]; }
	if (Object.keys(next).length > 0) mentionProfiles = { ...mentionProfiles, ...next };
}

let npubCopied = $state(false);
let npubOverlayOpen = $state(false);

async function copyNpub() {
	if (!npub) return;
	try {
		await navigator.clipboard.writeText(npub);
		npubCopied = true;
		setTimeout(() => (npubCopied = false), 1500);
	} catch { /* ignore */ }
}

async function copyProfileColor() {
	if (!pubkey) return;
	try {
		await navigator.clipboard.writeText(profileColorHex);
		colorCopied = true;
		setTimeout(() => (colorCopied = false), 1500);
	} catch { /* ignore */ }
}

onMount(async () => {
	if (!pubkey || !browser) return;
	profile = data.profile ?? null;
	apps = data.apps ?? [];
	stacks = data.stacks ?? [];
	resolvedStacks = data.resolvedStacks ?? [];
	if (!profile) await loadProfile(pubkey);
	// Always fetch apps — local-first then relay update.
	// Skip platform filter: profile pages show ALL apps a developer published,
	// not just the platform the browser happens to be on.
	// Query both catalog relays so apps on either relay are found.
	appsLoading = true;
	try {
		const prefix = data.appFilterPrefix ?? null;
		const applyPrefix = (evts) => {
			const parsed = evts.map(parseApp);
			return prefix ? parsed.filter((a) => a.dTag?.startsWith(prefix)) : parsed;
		};

		// Show whatever is already in Dexie immediately (may be empty on first visit).
		const local = await queryEvents({ kinds: [32267], authors: [pubkey] });
		if (local.length > 0) {
			apps = applyPrefix(local);
			appsLoading = false;
		}

		// Only zapstore relay has app events — vertexlab is profiles-only.
		const fetched = await fetchAppsByAuthorFromRelays([ZAPSTORE_RELAY], pubkey, {
			limit: 100,
			skipPlatformFilter: true,
			timeout: 6000
		});

		// fetchAppsByAuthorFromRelays writes to Dexie; re-query for a clean deduped list.
		const fresh = fetched.length > 0
			? await queryEvents({ kinds: [32267], authors: [pubkey] })
			: local;
		apps = applyPrefix(fresh);
	} finally {
		appsLoading = false;
	}
	if (stacks.length === 0) {
		stacksLoading = true;
		try {
			const stackEvents = await queryEvents({ kinds: [30267], authors: [pubkey] });
			const parsedStacks = stackEvents.map(parseAppStack).filter((s) => s.dTag !== SAVED_APPS_STACK_D_TAG);
			stacks = parsedStacks;
			const allIds = new SvelteSet();
			for (const s of parsedStacks) {
				for (const ref of s.appRefs || []) {
					if (ref.kind === 32267) allIds.add(ref.identifier);
				}
			}
			if (allIds.size > 0) {
				const appEvents = await queryEvents({ kinds: [32267], '#d': [...allIds] });
				const byPubkeyAndD = new SvelteMap();
				for (const e of appEvents) {
					const a = parseApp(e);
					if (a.pubkey && a.dTag) byPubkeyAndD.set(`${a.pubkey}:${a.dTag}`, a);
				}
				const missingRefs = [];
				for (const st of parsedStacks) {
					for (const r of st.appRefs || []) {
						if (r.kind === 32267 && r.pubkey && r.identifier && !byPubkeyAndD.get(`${r.pubkey}:${r.identifier}`))
							missingRefs.push(r);
					}
				}
				const seen = new SvelteSet();
				for (const ref of missingRefs) {
					const key = `${ref.pubkey}:${ref.identifier}`;
					if (seen.has(key)) continue;
					seen.add(key);
					const ev = await fetchAppFromRelays([ZAPSTORE_RELAY], ref.pubkey, ref.identifier);
					if (ev) {
						const a = parseApp(ev);
						if (a.pubkey && a.dTag) byPubkeyAndD.set(`${a.pubkey}:${a.dTag}`, a);
					}
				}
				resolvedStacks = parsedStacks.map((s) => ({
					stack: s,
					apps: (s.appRefs || []).filter((r) => r.kind === 32267).map((r) => byPubkeyAndD.get(`${r.pubkey}:${r.identifier}`)).filter(Boolean)
				}));
			} else {
				resolvedStacks = parsedStacks.map((s) => ({ stack: s, apps: [] }));
			}
		} finally {
			stacksLoading = false;
		}
	}
});

$effect(() => {
	const about = profile?.about?.trim();
	if (about && browser) loadMentionProfiles(about);
});

function stackToCard(s, resolvedApps) {
	const creatorNpub = pubkey ? nip19.npubEncode(pubkey) : '';
	const appRefs = s.appRefs || [];
	const appsList = resolvedApps && resolvedApps.length > 0
		? resolvedApps.map((a) => ({ name: a.name || a.dTag || '', icon: a.icon, dTag: a.dTag }))
		: appRefs.map((ref) => ({ name: ref.identifier, dTag: ref.identifier }));
	return {
		name: s.title || s.dTag || 'Untitled',
		description: s.description || '',
		apps: appsList,
		creator: pubkey ? { name: profileName, picture: profilePictureUrl, pubkey, npub: creatorNpub } : undefined,
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
						<div class="profile-pic-wrap">
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
								<button
									type="button"
									class="profile-about-btn"
									onclick={() => (descriptionModalOpen = true)}
									aria-label="View full description"
								>
									<div class="profile-about-clamp">
										<ShortTextRenderer
											content={profile.about}
											resolveMentionLabel={(pk) => mentionProfiles[pk]}
										/>
									</div>
								</button>
							{:else if !profileLoading}
								<p class="profile-about-empty">No description</p>
							{/if}

							<div class="npub-row">
								<div
									class="npub-hover-wrap"
									role="group"
									aria-label="Public identifier and profile color"
									onmouseenter={() => (npubOverlayOpen = true)}
									onmouseleave={() => (npubOverlayOpen = false)}
								>
									<span
										class="profile-dot"
										style="background-color: rgb({profileColor.r}, {profileColor.g}, {profileColor.b});"
									></span>
									<span class="npub-text">{npub ? `${npub.slice(0, 12)}...${npub.slice(-6)}` : ''}</span>

									<div
										class="npub-overlay"
										class:open={npubOverlayOpen}
										role="group"
										aria-label="Npub and color details"
										onmouseenter={() => (npubOverlayOpen = true)}
										onmouseleave={() => (npubOverlayOpen = false)}
									>
										<p class="overlay-desc">
											This is a Public Nostr Identifier (npub). The profile color is uniquely derived from it for visual recognition.
										</p>
										<div class="overlay-divider"></div>
										<div class="overlay-row">
											<span class="overlay-val npub-mono" title={npub}>{npub}</span>
											<button type="button" class="overlay-copy" onclick={(e) => { e.stopPropagation(); copyNpub(); }} aria-label="Copy npub">
												{#if npubCopied}
													<Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
												{:else}
													<Copy variant="outline" size={14} color="var(--white66)" />
												{/if}
											</button>
										</div>
										<div class="overlay-divider"></div>
										<div class="overlay-row">
											<span class="overlay-val color-hex" style="color: rgb({profileColor.r}, {profileColor.g}, {profileColor.b});">{profileColorHex}</span>
											<button type="button" class="overlay-copy" onclick={(e) => { e.stopPropagation(); copyProfileColor(); }} aria-label="Copy color">
												{#if colorCopied}
													<Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
												{:else}
													<Copy variant="outline" size={14} color="var(--white66)" />
												{/if}
											</button>
										</div>
									</div>
								</div>

								<button type="button" class="npub-copy-btn" onclick={copyNpub} aria-label="Copy npub">
									{#if npubCopied}
										<span class="check-pop"><Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" /></span>
									{:else}
										<Copy variant="outline" size={16} color="var(--white66)" />
									{/if}
								</button>
							</div>
						</div>
					</div>

					<div class="profile-tab-divider" aria-hidden="true"></div>

					<div class="tab-bar" use:wheelScroll>
						<button
							type="button"
							class={activeTab === 'apps' ? 'btn-primary-small' : 'btn-secondary-small'}
							onclick={() => (activeTab = 'apps')}
						>Apps</button>
						<button
							type="button"
							class={activeTab === 'activity' ? 'btn-primary-small' : 'btn-secondary-small'}
							onclick={() => (activeTab = 'activity')}
						>Activity</button>
						<button
							type="button"
							class={activeTab === 'details' ? 'btn-primary-small' : 'btn-secondary-small'}
							onclick={() => (activeTab = 'details')}
						>Details</button>
					</div>

					<div class="profile-tab-divider" aria-hidden="true"></div>

					<div
						class="profile-tab-content"
						class:profile-tab-content--activity={activeTab === 'activity'}
						class:profile-tab-content--apps={activeTab === 'apps'}
					>
		{#if activeTab === 'apps'}
			<ProfileAppsBrowseSections
				{apps}
				{appsLoading}
				{stackCards}
				{stacksLoading}
				{getAppUrl}
				{getStackUrl}
			/>
	{:else if activeTab === 'activity'}
			<ProfileActivityTab {pubkey} profileName={profileName} profilePicture={profilePictureUrl} />

		{:else if activeTab === 'details'}
			<ProfileDetailsTab {npub} {pubkey} />
		{/if}
					</div>
				</div>
			</div>
		</div>
	</div>

	{#if profile?.about?.trim()}
		<Modal bind:open={descriptionModalOpen} ariaLabel="Profile Description" maxHeight={90}>
			<div class="desc-modal">
				<h2 class="modal-heading mb-4">About</h2>
				<div class="desc-modal-text">
					<ShortTextRenderer content={profile.about} resolveMentionLabel={(pk) => mentionProfiles[pk]} />
				</div>
			</div>
		</Modal>
	{/if}
{/if}

<style>
	/* ── Profile header ───────────────────────────────────────────────────── */
	.profile-header {
		display: flex;
		align-items: center;
		gap: 20px;
		padding-bottom: 4px;
	}

	@media (min-width: 768px) {
		.profile-header {
			gap: 28px;
		}
	}

	.profile-pic-wrap { flex-shrink: 0; }

	@media (max-width: 767px) {
		.profile-pic-wrap :global(.profile-pic) {
			width: 100px !important;
			height: 100px !important;
			min-width: 100px !important;
			min-height: 100px !important;
		}
	}

	.profile-info { flex: 1; min-width: 0; }

	.profile-name {
		font-size: 1.5rem;
		font-weight: 900;
		color: var(--white);
		line-height: 1.15;
		margin: 0 0 8px;
		word-break: break-word;
	}

	@media (min-width: 640px)  { .profile-name { font-size: 1.75rem; } }
	@media (min-width: 768px)  { .profile-name { font-size: 2.25rem; } }

	.profile-about-btn {
		display: block;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		color: var(--white66);
		font-size: 0.875rem;
		line-height: 1.4;
		margin-bottom: 8px;
	}

	.profile-about-clamp {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.profile-about-empty {
		margin: 0 0 8px;
		font-size: 0.875rem;
		color: var(--white33);
	}

	/* npub row */
	.npub-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.npub-hover-wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		cursor: default;
	}

	.profile-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 0.33px solid var(--white16);
		flex-shrink: 0;
	}

	.npub-text { font-size: 0.875rem; color: var(--white66); white-space: nowrap; }

	.npub-overlay {
		display: none;
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		min-width: 300px;
		max-width: min(380px, 90vw);
		background: var(--gray66);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 0.33px solid var(--white16);
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 8px 32px var(--black33);
		z-index: 200;
		pointer-events: auto;
	}

	.npub-overlay.open { display: block; }

	.overlay-desc {
		margin: 0;
		padding: 10px 14px;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--white66);
	}

	.overlay-divider {
		height: 0.33px;
		background: var(--white16);
	}

	.overlay-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 14px;
	}

	.overlay-val {
		font-size: 0.8125rem;
		color: var(--white66);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.npub-mono { font-family: ui-monospace, monospace; }
	.color-hex { font-weight: 600; }

	.overlay-copy {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border: none;
		background: none;
		cursor: pointer;
		flex-shrink: 0;
	}

	.npub-copy-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border: none;
		background: none;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.npub-copy-btn:hover { opacity: 0.7; }

	.check-pop { display: flex; animation: popIn 0.3s ease-out; }

	@keyframes popIn {
		0%   { transform: scale(0); }
		50%  { transform: scale(1.2); }
		100% { transform: scale(1); }
	}

	/* Full-width dividers framing tab pills */
	.profile-tab-divider {
		flex-shrink: 0;
		height: 1.4px;
		margin-left: calc(-1 * var(--page-content-pad-x, 0px));
		margin-right: calc(-1 * var(--page-content-pad-x, 0px));
		width: calc(100% + 2 * var(--page-content-pad-x, 0px));
		background-color: var(--white11);
		border: none;
	}

	.profile-header + .profile-tab-divider {
		margin-top: 12px;
		margin-bottom: 16px;
	}

	.tab-bar + .profile-tab-divider {
		margin-top: 16px;
		margin-bottom: 0;
	}

	/* ── Tab bar ──────────────────────────────────────────────────────────── */
	.tab-bar {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
		-ms-overflow-style: none;
		padding: 4px 2px;
		margin: -4px -2px;
	}

	.tab-bar::-webkit-scrollbar { display: none; }

	.profile-tab-content {
		padding-top: 16px;
	}

	.profile-tab-content--apps {
		padding-top: 0;
		margin-left: calc(-1 * var(--page-content-pad-x, 0px));
		margin-right: calc(-1 * var(--page-content-pad-x, 0px));
		width: calc(100% + 2 * var(--page-content-pad-x, 0px));
	}

	.profile-tab-content--activity {
		padding-top: 0;
		margin-left: calc(-1 * var(--page-content-pad-x, 0px));
		margin-right: calc(-1 * var(--page-content-pad-x, 0px));
		width: calc(100% + 2 * var(--page-content-pad-x, 0px));
	}

	.profile-tab-content--activity :global(.activity-feed-skeleton) {
		padding: 0;
	}

	/* ── Description modal ───────────────────────────────────────────────── */
	.desc-modal { padding: 16px; }
	@media (min-width: 768px) { .desc-modal { padding: 24px; } }
	.desc-modal-text { font-size: 1rem; line-height: 1.5; color: var(--white66); }
</style>
