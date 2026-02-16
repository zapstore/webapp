<script lang="js">
/**
 * Profile page - header (pic, name, npub, Add button) + Published Apps & Stacks
 */
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import { fetchProfile, encodeAppNaddr, encodeStackNaddr, queryEvents, queryEvent, putEvents } from '$lib/nostr';
import { nip19 } from 'nostr-tools';
import { wheelScroll } from '$lib/actions/wheelScroll.js';
import { parseShortText } from '$lib/utils/short-text-parser.js';
import { getCurrentPubkey, signEvent } from '$lib/stores/auth.svelte.js';
import { DEFAULT_SOCIAL_RELAYS } from '$lib/config';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import NpubDisplay from '$lib/components/common/NpubDisplay.svelte';
import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
import ShortTextRenderer from '$lib/components/common/ShortTextRenderer.svelte';
import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
import Modal from '$lib/components/common/Modal.svelte';
import { Plus, Copy, Check } from '$lib/components/icons';
import { hexToColor } from '$lib/utils/color.js';
let { data } = $props();
const npub = $derived(data.npub ?? '');
const pubkey = $derived(data.pubkey);
let profile = $state(null);
let profileLoading = $state(false);
let apps = $state([]);
let appsLoading = $state(false);
let stacks = $state([]);
let stacksLoading = $state(false);
let addButtonLabel = $state('Add');
let addButtonDisabled = $state(false);
let isFollowing = $state(false);
let checkingFollowStatus = $state(false);
let listsModalOpen = $state(false);
let userLists = $state([]);
let listStates = $state({});
let loadingLists = $state(false);
let savingLists = $state(false);
/** Resolved display names for npubs mentioned in profile about (nostr:npub1...) */
let mentionProfiles = $state({});
/** Stacks with resolved app details (icons, names) for display */
let resolvedStacks = $state([]);
let descriptionModalOpen = $state(false);
let colorDropdownOpen = $state(false);
const profileName = $derived(profile?.displayName || profile?.name || (pubkey ? `${pubkey.slice(0, 8)}…` : 'Anonymous'));
const profilePictureUrl = $derived(profile?.picture ?? '');
const isConnected = $derived(getCurrentPubkey() !== null);
async function loadProfile(pk) {
    profileLoading = true;
    try {
        const event = await fetchProfile(pk);
        if (event?.content) {
            const c = JSON.parse(event.content);
            profile = {
                name: c.name,
                displayName: c.display_name || c.name,
                picture: c.picture,
                about: c.about
            };
        }
        else {
            profile = {};
        }
    }
    catch {
        profile = {};
    }
    finally {
        profileLoading = false;
    }
}
/** Load profiles for pubkeys mentioned in about (nostr:npub...) for resolveMentionLabel */
async function loadMentionProfiles(about) {
    const segments = parseShortText({ text: about, emojiTags: [] });
    const pubkeys = [
        ...new Set(segments
            .filter((s) => s.type === 'mention')
            .map((s) => s.pubkey))
    ];
    if (pubkeys.length === 0)
        return;
    // Fetch all mention profiles in parallel (not sequential)
    const results = await Promise.all(pubkeys.map(async (pk) => {
        try {
            const event = await fetchProfile(pk);
            if (event?.content) {
                const c = JSON.parse(event.content);
                const name = c.display_name || c.name;
                if (name)
                    return [pk, name];
            }
        }
        catch {
            // ignore
        }
        return null;
    }));
    const next = {};
    for (const result of results) {
        if (result)
            next[result[0]] = result[1];
    }
    if (Object.keys(next).length > 0) {
        mentionProfiles = { ...mentionProfiles, ...next };
    }
}
async function checkFollowStatus() {
    const userPubkey = getCurrentPubkey();
    if (!userPubkey || !pubkey) {
        isFollowing = false;
        return;
    }
    
    checkingFollowStatus = true;
    try {
        // Check kind 3 contact list
        const kind3 = await queryEvents({ kinds: [3], authors: [userPubkey], limit: 1 });
        for (const ev of kind3) {
            const pTags = ev.tags.filter((t) => t[0] === 'p' && t[1] === pubkey);
            if (pTags.length > 0) {
                isFollowing = true;
                checkingFollowStatus = false;
                return;
            }
        }
        
        // Check kind 30000 follow sets
        const kind30k = await queryEvents({ kinds: [30000], authors: [userPubkey], limit: 50 });
        for (const ev of kind30k) {
            const pTags = ev.tags.filter((t) => t[0] === 'p' && t[1] === pubkey);
            if (pTags.length > 0) {
                isFollowing = true;
                checkingFollowStatus = false;
                return;
            }
        }
        
        isFollowing = false;
    } catch (err) {
        console.error('Failed to check follow status:', err);
        isFollowing = false;
    } finally {
        checkingFollowStatus = false;
    }
}

async function loadUserLists() {
    const userPubkey = getCurrentPubkey();
    if (!userPubkey || !pubkey) return;
    
    loadingLists = true;
    try {
        const lists = [];
        const states = {};
        
        // Get kind 3 contact list
        const kind3Events = await queryEvents({ kinds: [3], authors: [userPubkey], limit: 1 });
        if (kind3Events.length > 0) {
            const ev = kind3Events[0];
            const hasPubkey = ev.tags.some((t) => t[0] === 'p' && t[1] === pubkey);
            lists.push({ id: 'kind3', name: 'Contacts', kind: 3, event: ev });
            states['kind3'] = hasPubkey;
        } else {
            lists.push({ id: 'kind3', name: 'Contacts', kind: 3, event: null });
            states['kind3'] = false;
        }
        
        // Get kind 30000 follow sets
        const kind30kEvents = await queryEvents({ kinds: [30000], authors: [userPubkey], limit: 50 });
        for (const ev of kind30kEvents) {
            const dTag = ev.tags.find((t) => t[0] === 'd')?.[1] || '';
            const title = ev.tags.find((t) => t[0] === 'title')?.[1] || ev.tags.find((t) => t[0] === 'name')?.[1] || dTag || 'Unnamed List';
            const hasPubkey = ev.tags.some((t) => t[0] === 'p' && t[1] === pubkey);
            const listId = `kind30000-${dTag}`;
            lists.push({ id: listId, name: title, kind: 30000, dTag, event: ev });
            states[listId] = hasPubkey;
        }
        
        userLists = lists;
        listStates = states;
    } catch (err) {
        console.error('Failed to load user lists:', err);
    } finally {
        loadingLists = false;
    }
}

function toggleList(listId) {
    listStates = { ...listStates, [listId]: !listStates[listId] };
}

async function saveListChanges() {
    const userPubkey = getCurrentPubkey();
    if (!userPubkey || !pubkey) return;
    
    savingLists = true;
    try {
        const eventsToPublish = [];
        
        for (const list of userLists) {
            const shouldHavePubkey = listStates[list.id];
            const currentlyHas = list.event?.tags.some((t) => t[0] === 'p' && t[1] === pubkey) || false;
            
            if (shouldHavePubkey !== currentlyHas) {
                // Need to update this list
                let tags = [];
                if (list.event) {
                    // Keep all existing tags except p tags for this pubkey
                    tags = list.event.tags.filter((t) => !(t[0] === 'p' && t[1] === pubkey));
                } else if (list.kind === 30000) {
                    // New kind 30000 list, add d tag
                    tags.push(['d', list.dTag || '']);
                }
                
                if (shouldHavePubkey) {
                    // Add the profile
                    tags.push(['p', pubkey]);
                }
                
                const event = {
                    kind: list.kind,
                    created_at: Math.floor(Date.now() / 1000),
                    tags,
                    content: list.event?.content || ''
                };
                
                const signed = await signEvent(event);
                eventsToPublish.push(signed);
            }
        }
        
        if (eventsToPublish.length > 0) {
            await putEvents(eventsToPublish);
        }
        
        // Update follow status
        await checkFollowStatus();
        listsModalOpen = false;
    } catch (err) {
        console.error('Failed to save list changes:', err);
    } finally {
        savingLists = false;
    }
}

async function handleAddClick() {
    if (!isFollowing) {
        // Quick add to kind 3
        const userPubkey = getCurrentPubkey();
        if (!userPubkey || !pubkey) return;
        
        addButtonDisabled = true;
        try {
            const kind3Events = await queryEvents({ kinds: [3], authors: [userPubkey], limit: 1 });
            const existingEvent = kind3Events[0];
            
            let tags = [];
            if (existingEvent) {
                tags = existingEvent.tags.filter((t) => !(t[0] === 'p' && t[1] === pubkey));
            }
            tags.push(['p', pubkey]);
            
            const event = {
                kind: 3,
                created_at: Math.floor(Date.now() / 1000),
                tags,
                content: existingEvent?.content || ''
            };
            
            const signed = await signEvent(event);
            await putEvents([signed]);
            
            await checkFollowStatus();
        } catch (err) {
            console.error('Failed to add to contacts:', err);
        } finally {
            addButtonDisabled = false;
        }
    } else {
        // Open modal to manage lists
        await loadUserLists();
        listsModalOpen = true;
    }
}
let npubCopied = $state(false);
let colorCopied = $state(false);

async function copyNpub() {
    if (!npub)
        return;
    try {
        await navigator.clipboard.writeText(npub);
        npubCopied = true;
        setTimeout(() => (npubCopied = false), 1500);
    }
    catch {
        // ignore
    }
}

const profileColor = $derived(pubkey ? hexToColor(pubkey) : { r: 128, g: 128, b: 128 });
const profileColorHex = $derived(`#${profileColor.r.toString(16).padStart(2, '0')}${profileColor.g.toString(16).padStart(2, '0')}${profileColor.b.toString(16).padStart(2, '0')}`.toUpperCase());

async function copyProfileColor() {
    if (!pubkey) return;
    try {
        await navigator.clipboard.writeText(profileColorHex);
        colorCopied = true;
        setTimeout(() => (colorCopied = false), 1500);
    }
    catch {
        // ignore
    }
}
onMount(() => {
    if (!pubkey || !browser)
        return;
    profile = data.profile ?? null;
    apps = data.apps ?? [];
    stacks = data.stacks ?? [];
    resolvedStacks = data.resolvedStacks ?? [];
    if (!profile)
        loadProfile(pubkey);
    
    // Check follow status if user is signed in
    if (getCurrentPubkey()) {
        checkFollowStatus();
    }
});
$effect(() => {
    const about = profile?.about?.trim();
    if (about && browser)
        loadMentionProfiles(about);
});

$effect(() => {
    addButtonLabel = isFollowing ? 'Added' : 'Add';
});
// Stack card shape for AppStackCard: name, description, apps[] (with icon), creator
function stackToCard(s, resolvedApps) {
    const creatorNpub = pubkey ? nip19.npubEncode(pubkey) : '';
    const appRefs = s.appRefs || [];
    const apps = resolvedApps && resolvedApps.length > 0
        ? resolvedApps.map((a) => ({ name: a.name || a.dTag || '', icon: a.icon, dTag: a.dTag }))
        : appRefs.map((ref) => ({ name: ref.identifier, dTag: ref.identifier }));
    return {
        name: s.title || s.dTag || 'Untitled',
        description: s.description || '',
        apps,
        creator: pubkey
            ? {
                name: profileName,
                picture: profilePictureUrl,
                pubkey,
                npub: creatorNpub
            }
            : undefined
    };
}
</script>

<svelte:head>
	<title>{profileName} - Profile - Zapstore</title>
</svelte:head>

{#if !pubkey}
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
		<div
			class="rounded-lg bg-destructive/10 border border-destructive/20 p-6 max-w-md mx-auto text-center"
		>
			<h3 class="text-lg font-semibold text-destructive mb-2">Invalid profile</h3>
			<p class="text-muted-foreground">The profile address (npub) is not valid.</p>
		</div>
	</div>
{:else}
	<!-- Profile hero: full-width, blurred pic bg at 16% on gray44, border bottom -->
	<section class="profile-hero border-t border-b border-border/50">
		<div class="profile-hero-bg" aria-hidden="true">
			{#if profilePictureUrl}
				<div
					class="profile-hero-bg-image"
					style="background-image: url('{profilePictureUrl}');"
				></div>
			{/if}
			<!-- Left and right shaders (fade blur into bg, like apps/stacks sections) -->
			<div class="profile-hero-shader profile-hero-shader-left"></div>
			<div class="profile-hero-shader profile-hero-shader-right"></div>
		</div>
		<div
			class="profile-hero-content container mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6 md:pt-10 md:pb-8"
		>
			<div class="profile-header flex items-center gap-6 sm:gap-8">
				<div class="profile-pic-column flex flex-col items-center flex-shrink-0">
					<div class="profile-pic-wrap">
						<ProfilePic
							pictureUrl={profilePictureUrl || undefined}
							{pubkey}
							name={profileName}
							size="3xl"
							loading={profileLoading}
						/>
					</div>
					{#if isConnected}
						<button
							type="button"
							class="add-btn install-btn-mobile btn-primary-small flex items-center justify-center gap-2 w-full"
							onclick={handleAddClick}
							disabled={addButtonDisabled || checkingFollowStatus}
							aria-label={addButtonLabel}
						>
							{#if isFollowing}
								<Check variant="outline" color="white" size={16} strokeWidth={2.8} />
							{:else}
								<Plus variant="outline" color="white" size={16} strokeWidth={2.5} />
							{/if}
							<span>{addButtonLabel}</span>
						</button>
					{/if}
				</div>

				<div class="profile-info flex-1 min-w-0">
					<div class="profile-name-row flex items-center justify-between gap-3 mb-3">
						<h1
							class="profile-name text-[1.625rem] sm:text-4xl font-black"
							style="color: hsl(var(--white));"
						>
							{profileName}
						</h1>
						{#if isConnected}
							<button
								type="button"
								class="add-btn install-btn-desktop btn-primary flex items-center gap-2 flex-shrink-0"
								onclick={handleAddClick}
								disabled={addButtonDisabled || checkingFollowStatus}
								aria-label={addButtonLabel}
							>
								{#if isFollowing}
									<Check variant="outline" color="white" size={18} strokeWidth={2.8} />
								{:else}
									<Plus variant="outline" color="white" size={18} strokeWidth={2.5} />
								{/if}
								<span>{addButtonLabel}</span>
							</button>
						{/if}
					</div>
					{#if profile?.about?.trim()}
						<button
							type="button"
							class="profile-description text-base mb-3 text-left"
							style="color: hsl(var(--white66)); cursor: pointer; background: none; border: none; padding: 0; width: 100%;"
							onclick={() => (descriptionModalOpen = true)}
						>
							<div class="profile-description-truncated">
								<ShortTextRenderer
									content={profile.about}
									resolveMentionLabel={(pk) => mentionProfiles[pk]}
								/>
							</div>
						</button>
					{/if}
					<div class="profile-npub-row profile-npub-row-fixed">
						<div class="profile-color-circle-wrap">
							<span
								class="profile-dot"
								style="background-color: rgb({profileColor.r}, {profileColor.g}, {profileColor.b});"
							></span>
							<div class="profile-color-dropdown">
								<div class="profile-color-dropdown-content">
									<div
										class="profile-color-hex"
										style="color: rgb({profileColor.r}, {profileColor.g}, {profileColor.b});"
									>
										{profileColorHex}
										<button
											type="button"
											class="color-copy-btn"
											onclick={copyProfileColor}
											aria-label="Copy color"
										>
											{#if colorCopied}
												<span class="color-copy-check">
													<Check
														variant="outline"
														size={12}
														strokeWidth={2.8}
														color="hsl(var(--blurpleLightColor))"
													/>
												</span>
											{:else}
												<Copy variant="outline" size={14} color="hsl(var(--white66))" />
											{/if}
										</button>
									</div>
									<p class="profile-color-desc">
										Profile color derived from the public identifier (pub) and serves as extra
										identification, for example in chat bubbles.
									</p>
								</div>
							</div>
						</div>
						<span class="npub-text">{npub ? `${npub.slice(0, 12)}...${npub.slice(-6)}` : ''}</span>
						<button
							type="button"
							class="profile-npub-copy"
							onclick={copyNpub}
							aria-label="Copy npub"
						>
							{#if npubCopied}
								<span class="profile-npub-copy-check">
									<Check
										variant="outline"
										size={14}
										strokeWidth={2.8}
										color="hsl(var(--blurpleLightColor))"
									/>
								</span>
							{:else}
								<Copy variant="outline" size={16} color="hsl(var(--white66))" />
							{/if}
						</button>
					</div>
				</div>
			</div>
		</div>
	</section>

	<div class="container mx-auto px-4 sm:px-6 lg:px-8 pt-8 md:pt-10 pb-8">
		<!-- Published Apps (one row, horizontal scroll like discover) -->
		<section class="profile-section">
			<SectionHeader title="Apps" />
			{#if appsLoading}
				<div class="horizontal-scroll profile-scroll" use:wheelScroll>
					<div class="scroll-content">
						{#each Array(5) as _}
							<div class="profile-app-item">
								<div class="skeleton-card">
									<div class="skeleton-icon">
										<SkeletonLoader />
									</div>
									<div class="skeleton-info">
										<div class="skeleton-name">
											<SkeletonLoader />
										</div>
										<div class="skeleton-desc-lines">
											<div class="skeleton-desc skeleton-desc-1"></div>
											<div class="skeleton-desc skeleton-desc-2 desktop-only"></div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if apps.length === 0}
				<div class="empty-state-panel">
					<p class="empty-state-text">No published apps</p>
				</div>
			{:else}
				<div class="horizontal-scroll profile-scroll" use:wheelScroll>
					<div class="scroll-content">
						{#each apps as app}
							{@const naddr = app.naddr || encodeAppNaddr(app.pubkey, app.dTag)}
							<div class="profile-app-item">
								<AppSmallCard
									app={{
										name: app.name,
										icon: app.icon,
										description: app.description,
										dTag: app.dTag
									}}
									href="/apps/{naddr}"
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<!-- Published Stacks (one row, horizontal scroll like discover) -->
		<section class="profile-section">
			<SectionHeader title="Stacks" />
			{#if stacksLoading}
				<div class="horizontal-scroll profile-scroll" use:wheelScroll>
					<div class="scroll-content">
						{#each Array(4) as _}
							<div class="profile-stack-item">
								<div class="skeleton-stack">
									<div class="skeleton-stack-grid">
										<SkeletonLoader />
									</div>
									<div class="skeleton-stack-info">
										<div class="skeleton-stack-text">
											<div class="skeleton-stack-name"><SkeletonLoader /></div>
											<div class="skeleton-stack-desc-lines">
												<div class="skeleton-stack-desc skeleton-stack-desc-1"></div>
												<div class="skeleton-stack-desc skeleton-stack-desc-2"></div>
											</div>
										</div>
										<div class="skeleton-stack-creator">
											<div class="skeleton-stack-avatar">
												<SkeletonLoader />
											</div>
											<div class="skeleton-stack-creator-name"></div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if resolvedStacks.length === 0}
				<div class="empty-state-panel">
					<p class="empty-state-text">No published stacks</p>
				</div>
			{:else}
				<div class="horizontal-scroll profile-scroll" use:wheelScroll>
					<div class="scroll-content">
						{#each resolvedStacks as { stack, apps: resolvedApps }}
							{@const href = '/stacks/' + encodeStackNaddr(stack.pubkey, stack.dTag)}
							<div class="profile-stack-item">
								<AppStackCard stack={stackToCard(stack, resolvedApps)} {href} />
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	</div>

	<!-- Description Modal -->
	{#if profile?.about?.trim()}
		<Modal bind:open={descriptionModalOpen} ariaLabel="Profile Description" maxHeight={90}>
			<div class="description-modal-content">
				<h2 class="text-display text-4xl text-foreground text-center mb-4">About</h2>
				<div class="description-modal-text" style="color: hsl(var(--white66));">
					<ShortTextRenderer
						content={profile.about}
						resolveMentionLabel={(pk) => mentionProfiles[pk]}
					/>
				</div>
			</div>
		</Modal>
	{/if}

	<!-- Lists Management Modal -->
	<Modal bind:open={listsModalOpen} ariaLabel="Manage Profile Lists" maxHeight={90}>
		<div class="lists-modal-content">
			<h2 class="text-display text-4xl text-foreground text-center mb-4">
				{profileName}
			</h2>
			<p class="text-sm text-center mb-6" style="color: hsl(var(--white66));">
				Add or remove this profile from your lists
			</p>

			{#if loadingLists}
				<div class="lists-loading">
					<div class="spinner"></div>
					<p class="text-sm" style="color: hsl(var(--white66));">Loading lists...</p>
				</div>
			{:else}
				<div class="lists-container">
					{#each userLists as list}
						<button
							type="button"
							class="list-item"
							onclick={() => toggleList(list.id)}
							disabled={savingLists}
						>
							<div class="list-checkbox" class:checked={listStates[list.id]}>
								{#if listStates[list.id]}
									<svg class="check-icon" viewBox="0 0 18 12" fill="none">
										<path
											d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z"
											stroke="hsl(var(--whiteEnforced))"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								{/if}
							</div>
							<span class="list-name">{list.name}</span>
						</button>
					{/each}
				</div>

				<div class="lists-actions">
					<button
						type="button"
						class="btn-secondary-large w-full"
						onclick={() => (listsModalOpen = false)}
						disabled={savingLists}
					>
						Cancel
					</button>
					<button
						type="button"
						class="btn-primary-large w-full"
						onclick={saveListChanges}
						disabled={savingLists}
					>
						{savingLists ? 'Saving...' : 'Save Changes'}
					</button>
				</div>
			{/if}
		</div>
	</Modal>
{/if}

<style>
	.profile-hero {
		position: relative;
		width: 100%;
		background-color: hsl(var(--gray44));
		overflow: hidden;
	}

	.profile-hero-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.profile-hero-bg-image {
		position: absolute;
		inset: -20%;
		background-size: cover;
		background-position: center;
		filter: blur(40px);
		opacity: 0.16;
	}

	.profile-hero-shader {
		display: none; /* only show on desktop */
		position: absolute;
		top: 0;
		bottom: 0;
		width: 20%;
		max-width: 160px;
		pointer-events: none;
	}

	.profile-hero-shader-left {
		left: 0;
		background: linear-gradient(to right, hsl(var(--background)) 0%, transparent 100%);
	}

	.profile-hero-shader-right {
		right: 0;
		background: linear-gradient(to left, hsl(var(--background)) 0%, transparent 100%);
	}

	/* Desktop only: show shaders and extend to container gutter + padding */
	@media (min-width: 1024px) {
		.profile-hero-shader {
			display: block;
			width: max(2rem, calc((100vw - 1100px) / 2 + 2rem));
			max-width: none;
		}
	}

	.profile-hero-content {
		position: relative;
		z-index: 1;
	}

	.profile-header {
		align-items: flex-start;
	}

	.profile-pic-column {
		gap: 12px;
	}

	/* Mobile: scale down profile section and show Add under pic */
	@media (max-width: 767px) {
		.profile-hero-content {
			font-size: 0.94em;
		}
		.profile-pic-wrap {
			transform: scale(0.75);
			transform-origin: top center;
		}
		.profile-name {
			font-size: 1.5rem !important;
		}
	}

	@media (min-width: 768px) {
		.profile-header {
			align-items: center;
		}
		.profile-pic-column .install-btn-mobile {
			display: none !important;
		}
	}

	.profile-name {
		word-break: break-word;
	}

	.profile-npub-row {
		margin-top: 12px;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.profile-npub-row-fixed {
		min-height: 28px;
	}

	.profile-description-truncated {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.description-modal-content {
		padding: 16px;
	}

	@media (min-width: 768px) {
		.description-modal-content {
			padding: 24px;
		}
	}

	.description-modal-text {
		font-size: 1rem;
		line-height: 1.6;
	}

	.profile-color-circle-wrap {
		position: relative;
		display: inline-flex;
	}

	.profile-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 0.33px solid hsl(var(--white16));
		flex-shrink: 0;
	}

	.profile-color-dropdown {
		display: none;
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		min-width: 240px;
		max-width: 280px;
		padding: 12px 14px;
		background: hsl(241 15% 18%);
		border: 1px solid hsl(var(--white16));
		border-radius: 12px;
		box-shadow: 0 8px 24px hsl(var(--black66) / 0.4);
		z-index: 100;
	}

	@media (min-width: 768px) {
		.profile-color-circle-wrap:hover .profile-color-dropdown {
			display: block;
		}
	}

	.profile-color-dropdown-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.profile-color-hex {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.color-copy-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		margin: 0;
		border: none;
		background: none;
		cursor: pointer;
		color: hsl(var(--white66));
		transition: color 0.15s ease;
	}

	.color-copy-btn:hover {
		color: hsl(var(--white));
	}

	.color-copy-check {
		display: flex;
		animation: popIn 0.3s ease-out;
	}

	.profile-color-desc {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: hsl(var(--white66));
	}

	.npub-text {
		font-size: 0.875rem;
		color: hsl(var(--white66));
		white-space: nowrap;
	}

	.empty-state-panel {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--gray16));
		border-radius: var(--radius-16, 16px);
	}

	.empty-state-text {
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--white16));
		text-align: center;
		padding: 50px 0;
		margin: 0;
	}

	/* Lists Modal */
	.lists-modal-content {
		padding: 16px;
	}

	@media (min-width: 768px) {
		.lists-modal-content {
			padding: 24px;
		}
	}

	.lists-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 48px 0;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid hsl(var(--white33));
		border-top-color: hsl(var(--foreground));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.lists-container {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 20px;
	}

	.list-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: hsl(var(--white8));
		border-radius: 12px;
		border: none;
		cursor: pointer;
		transition: all 0.2s ease;
		width: 100%;
		text-align: left;
	}

	.list-item:hover {
		background: hsl(var(--white11));
		transform: scale(1.01);
	}

	.list-item:active {
		transform: scale(0.99);
	}

	.list-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.list-checkbox {
		width: 24px;
		height: 24px;
		border-radius: 8px;
		background: hsl(var(--black33));
		border: 1.4px solid hsl(var(--white33));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.2s ease;
		position: relative;
	}

	.list-checkbox.checked {
		background: linear-gradient(135deg, hsl(var(--blurpleColor)) 0%, hsl(var(--blurpleDarkColor)) 100%);
		border-color: transparent;
		animation: checkboxPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
	}

	@keyframes checkboxPop {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.16);
		}
		100% {
			transform: scale(1);
		}
	}

	.check-icon {
		width: 14px;
		height: 10px;
		animation: checkPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
	}

	@keyframes checkPop {
		0% {
			transform: scale(0);
		}
		50% {
			transform: scale(1.4);
		}
		100% {
			transform: scale(1);
		}
	}

	.list-name {
		font-size: 1rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.lists-actions {
		display: flex;
		gap: 12px;
		margin-top: 20px;
	}

	@media (max-width: 767px) {
		.lists-actions {
			flex-direction: column;
		}
	}

	.profile-npub-copy {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		margin: 0;
		border: none;
		background: none;
		cursor: pointer;
		color: hsl(var(--white66));
		transition: color 0.15s ease;
	}

	.profile-npub-copy:hover {
		color: hsl(var(--white));
	}

	.profile-npub-copy .profile-npub-copy-check {
		display: flex;
		animation: popIn 0.3s ease-out;
	}

	@keyframes popIn {
		0% {
			transform: scale(0);
		}
		50% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	.add-btn:disabled {
		opacity: 0.7;
		cursor: default;
	}

	.add-btn.install-btn-mobile {
		display: inline-flex;
	}

	.add-btn.install-btn-desktop {
		display: none;
	}

	@media (min-width: 768px) {
		.add-btn.install-btn-desktop {
			display: inline-flex;
		}
	}

	.profile-section {
		margin-bottom: 24px;
	}

	/* App skeleton (match discover) */
	.skeleton-card {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 4px 0;
	}

	.skeleton-icon {
		width: 56px;
		height: 56px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
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
		.skeleton-name {
			width: 140px;
			height: 20px;
		}
		.skeleton-desc {
			height: 12px;
		}
		.skeleton-desc-1 {
			width: 220px;
		}
		.skeleton-desc-2 {
			width: 160px;
		}
	}

	.skeleton-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 6px;
	}

	.skeleton-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
	}

	.skeleton-desc-lines {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-desc {
		height: 10px;
		border-radius: 12px;
		background: hsl(var(--gray33));
	}

	.skeleton-desc-1 {
		width: 180px;
	}

	.skeleton-desc-2 {
		width: 120px;
	}

	.skeleton-desc-2.desktop-only {
		display: none;
	}

	@media (min-width: 768px) {
		.skeleton-desc-2.desktop-only {
			display: block;
		}
	}

	/* Stack skeleton (match discover) */
	.skeleton-stack {
		display: flex;
		align-items: stretch;
		gap: 16px;
		padding: 8px 0;
		width: 100%;
	}

	.skeleton-stack-grid {
		width: 86px;
		height: 86px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.skeleton-stack-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 4px 0;
	}

	.skeleton-stack-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.skeleton-stack-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
	}

	.skeleton-stack-desc-lines {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-stack-desc {
		height: 10px;
		border-radius: 12px;
		background-color: hsl(var(--gray33));
	}

	.skeleton-stack-desc-1 {
		width: 160px;
	}

	.skeleton-stack-desc-2 {
		width: 100px;
	}

	.skeleton-stack-creator {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.skeleton-stack-avatar {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
	}

	.skeleton-stack-creator-name {
		width: 60px;
		height: 12px;
		border-radius: 12px;
		background-color: hsl(var(--gray33));
	}

	@media (min-width: 768px) {
		.skeleton-stack {
			gap: 20px;
		}
		.skeleton-stack-grid {
			width: 104px;
			height: 104px;
			border-radius: 20px;
		}
		.skeleton-stack-name {
			width: 130px;
			height: 20px;
		}
		.skeleton-stack-desc {
			height: 12px;
		}
		.skeleton-stack-desc-1 {
			width: 200px;
		}
		.skeleton-stack-desc-2 {
			width: 140px;
		}
		.skeleton-stack-avatar {
			width: 24px;
			height: 24px;
		}
		.skeleton-stack-creator-name {
			width: 80px;
			height: 14px;
		}
	}

	.horizontal-scroll.profile-scroll {
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

	.horizontal-scroll.profile-scroll::-webkit-scrollbar {
		display: none;
	}

	.profile-scroll .scroll-content {
		display: flex;
		gap: 16px;
		padding-bottom: 8px;
	}

	.profile-app-item {
		flex-shrink: 0;
		width: 280px;
	}

	@media (min-width: 768px) {
		.profile-app-item {
			width: 320px;
		}
	}

	.profile-stack-item {
		flex-shrink: 0;
		width: 280px;
	}

	@media (min-width: 768px) {
		.profile-stack-item {
			width: 320px;
		}
	}

	@media (min-width: 640px) {
		.horizontal-scroll.profile-scroll {
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
		.horizontal-scroll.profile-scroll {
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
</style>
