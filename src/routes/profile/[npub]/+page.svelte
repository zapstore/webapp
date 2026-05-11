<script lang="js">
import { onMount } from 'svelte';
import { SvelteSet, SvelteMap } from 'svelte/reactivity';
import { browser } from '$app/environment';
import SeoHead from '$lib/components/layout/SeoHead.svelte';
import { fetchProfile, queryEvents, encodeStackNaddr, parseApp, parseAppStack, fetchAppsByAuthorFromRelays, fetchAppFromRelays } from '$lib/nostr';
import { ZAPSTORE_RELAY, SAVED_APPS_STACK_D_TAG, SITE_URL } from '$lib/config';
import { nip19 } from 'nostr-tools';
import { wheelScroll } from '$lib/actions/wheelScroll.js';
import { parseShortText } from '$lib/utils/short-text-parser.js';
import { getCurrentPubkey } from '$lib/stores/auth.svelte.js';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
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
	if (apps.length === 0) {
		appsLoading = true;
		try {
			let events = await queryEvents({ kinds: [32267], authors: [pubkey] });
			if (events.length === 0) {
				await fetchAppsByAuthorFromRelays([ZAPSTORE_RELAY], pubkey, { limit: 50 });
				events = await queryEvents({ kinds: [32267], authors: [pubkey] });
			}
			const parsed = events.map(parseApp);
			const prefix = data.appFilterPrefix ?? null;
			apps = prefix ? parsed.filter((a) => a.dTag?.startsWith(prefix)) : parsed;
		} finally {
			appsLoading = false;
		}
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
		creator: pubkey ? { name: profileName, picture: profilePictureUrl, pubkey, npub: creatorNpub } : undefined
	};
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
	<div class="page-wrap container mx-auto px-4 sm:px-6 lg:px-8">

		<!-- ── Profile panel ─────────────────────────────────────────── -->
		<div class="bento-panel profile-panel">
			{#if profilePictureUrl}
				<div class="profile-bg" aria-hidden="true">
					<div class="profile-bg-img" style="background-image: url('{profilePictureUrl}');"></div>
				</div>
			{/if}

			<div class="profile-inner">
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

					<!-- npub row -->
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
									A Public Identifier (npub) on the Nostr protocol. The profile color is derived from it for extra recognisability.
								</p>
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
		</div>

		<!-- ── Tab row ───────────────────────────────────────────────── -->
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

		<!-- ── Tab: Apps ─────────────────────────────────────────────── -->
		{#if activeTab === 'apps'}
			<div class="apps-stack">

				<!-- Published -->
				<div class="bento-panel content-panel">
					<h2 class="panel-title">Published</h2>
					{#if appsLoading}
						<div class="panel-item">
							<div class="sk-row">
								<div class="sk-icon"><SkeletonLoader /></div>
								<div class="sk-info">
									<div class="sk-name"><SkeletonLoader /></div>
									<div class="sk-desc"><SkeletonLoader /></div>
								</div>
							</div>
						</div>
					{:else if apps.length === 0}
						<p class="panel-empty">No apps published</p>
					{:else}
						{#each apps as app, i (app.id)}
							{#if i > 0}<div class="item-divider"></div>{/if}
							<div class="panel-item">
								<AppSmallCard
									app={{ name: app.name, icon: app.icon, description: app.description, dTag: app.dTag }}
									href="/apps/{app.dTag}"
								/>
							</div>
						{/each}
					{/if}
				</div>

				<!-- Stacks -->
				<div class="bento-panel content-panel">
					<h2 class="panel-title">Stacks</h2>
					{#if stacksLoading}
						{#each Array(3) as _, i (i)}
							{#if i > 0}<div class="item-divider"></div>{/if}
							<div class="panel-item">
								<div class="sk-row">
									<div class="sk-stack-grid"><SkeletonLoader /></div>
									<div class="sk-info">
										<div class="sk-name"><SkeletonLoader /></div>
										<div class="sk-desc"><SkeletonLoader /></div>
									</div>
								</div>
							</div>
						{/each}
					{:else if resolvedStacks.length === 0}
						<p class="panel-empty">No stacks created</p>
					{:else}
						{#each resolvedStacks as { stack, apps: resolvedApps }, i (`${stack.id}-${i}`)}
							{#if i > 0}<div class="item-divider"></div>{/if}
							<div class="panel-item">
								<AppStackCard
									stack={stackToCard(stack, resolvedApps)}
									href="/stacks/{encodeStackNaddr(stack.pubkey, stack.dTag)}"
								/>
							</div>
						{/each}
					{/if}
				</div>

			</div>

		<!-- ── Tab: Activity ─────────────────────────────────────────── -->
		{:else if activeTab === 'activity'}
			<ProfileActivityTab {pubkey} profileName={profileName} profilePicture={profilePictureUrl} />

		<!-- ── Tab: Details ──────────────────────────────────────────── -->
		{:else if activeTab === 'details'}
			<ProfileDetailsTab {npub} {pubkey} />
		{/if}

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
	/* ── Page wrapper ─────────────────────────────────────────────────────── */
	.page-wrap {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 12px;
		padding-bottom: 48px;
	}

	/* ── Bento panel base ─────────────────────────────────────────────────── */
	.bento-panel {
		background: var(--gray33);
		border-radius: 20px;
		overflow: hidden;
	}

	/* ── Profile panel ─────────────────────────────────────────────────────── */
	.profile-panel {
		position: relative;
	}

	.profile-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
	}

	.profile-bg-img {
		position: absolute;
		inset: -20%;
		background-size: cover;
		background-position: center;
		filter: blur(40px);
		opacity: 0.18;
	}

	.profile-inner {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: flex-start;
		gap: 20px;
		padding: 24px 20px;
	}

	@media (min-width: 768px) {
		.profile-inner {
			align-items: center;
			gap: 28px;
			padding: 32px 28px;
		}
	}

	.profile-pic-wrap { flex-shrink: 0; }

	@media (max-width: 767px) {
		.profile-pic-wrap { transform: scale(0.8); transform-origin: top left; }
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
		font-size: 1rem;
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
		font-size: 1rem;
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
		bottom: calc(100% + 6px);
		left: 0;
		min-width: 280px;
		max-width: min(360px, 90vw);
		padding: 12px 14px 8px;
		background: hsl(241 15% 18%);
		border: 1px solid var(--white16);
		border-radius: 12px;
		box-shadow: 0 8px 24px color-mix(in srgb, var(--black66) 40%, transparent);
		z-index: 100;
		pointer-events: auto;
	}

	.npub-overlay.open { display: block; }

	.overlay-desc { margin: 0 0 10px; font-size: 0.8125rem; line-height: 1.45; color: var(--white66); }

	.overlay-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		min-height: 28px;
		padding: 2px 0;
		border-bottom: 1px solid var(--white11);
	}

	.overlay-row:last-child { border-bottom: none; }

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

	/* ── Tab bar ──────────────────────────────────────────────────────────── */
	.tab-bar {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
		-ms-overflow-style: none;
		padding: 2px 0;
	}

	.tab-bar::-webkit-scrollbar { display: none; }

	/* ── Apps stack (always single column) ───────────────────────────────── */
	.apps-stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	/* ── Content panel (Published / Stacks) ───────────────────────────────── */
	.content-panel {
		/* panels grow with their content */
	}

	.panel-title {
		margin: 0;
		/* 14px top (2px less than before), 0 bottom so the gap to the first card
		   comes entirely from panel-item's 16px top padding → exactly 16px total */
		padding: 14px 16px 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--white);
	}

	.panel-item {
		padding: 16px;
	}

	/* Zero out AppStackCard's own 8px top/bottom padding so the panel-item's
	   16px is the only spacing — prevents the "more padding" on the last card. */
	.panel-item :global(.app-stack-card) {
		padding-top: 0;
		padding-bottom: 0;
	}

	.item-divider {
		height: 1px;
		background: var(--white11);
		margin: 0 16px;
	}

	/* Empty state: same typography as EmptyState.svelte but no extra background */
	.panel-empty {
		margin: 0;
		padding: 40px 16px;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--white16);
		text-align: center;
		width: 100%;
	}

	/* ── Skeletons ────────────────────────────────────────────────────────── */
	.sk-row { display: flex; align-items: flex-start; gap: 16px; }

	.sk-icon {
		width: 56px;
		height: 56px;
		border-radius: 14px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.sk-stack-grid {
		width: 70px;
		height: 70px;
		border-radius: 14px;
		overflow: hidden;
		flex-shrink: 0;
	}

	@media (min-width: 768px) {
		.sk-icon { width: 72px; height: 72px; border-radius: 18px; }
		.sk-stack-grid { width: 86px; height: 86px; border-radius: 18px; }
		.sk-row { gap: 20px; }
	}

	.sk-info { flex: 1; display: flex; flex-direction: column; gap: 8px; padding-top: 6px; }
	.sk-name { width: 110px; height: 16px; border-radius: 8px; overflow: hidden; }
	.sk-desc { width: 180px; height: 12px; border-radius: 8px; overflow: hidden; }

	/* ── Description modal ───────────────────────────────────────────────── */
	.desc-modal { padding: 16px; }
	@media (min-width: 768px) { .desc-modal { padding: 24px; } }
	.desc-modal-text { font-size: 1rem; line-height: 1.5; color: var(--white66); }
</style>
