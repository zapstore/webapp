<script lang="js">
import { Search, X } from 'lucide-svelte';
import { fade } from 'svelte/transition';
import Label from './Label.svelte';
import ProfilePic from './ProfilePic.svelte';
import { ChevronRight } from '$lib/components/icons';
import { wheelScroll } from '$lib/actions/wheelScroll.js';
import { goto } from '$app/navigation';
import { zapstoreProfileStore, ZAPSTORE_PUBKEY } from '$lib/services/profile-search';
let { open = $bindable(false), searchQuery = $bindable(''), categories: _categories = [], platforms: _platforms = [] } = $props();
let searchInput = $state(undefined);
// Zapstore profile from EventStore/cache (same as DetailHeader — one of first cached profiles)
let zapstoreProfile = $state(null);
$effect(() => {
    const unsub = zapstoreProfileStore.subscribe((v) => (zapstoreProfile = v));
    return unsub;
});
// Common labels for quick search (tap = search for that term)
const commonLabels = [
    'Nostr',
    'Bitcoin',
    'Chat',
    'Files',
    'Wallet',
    'Social',
    'Productivity',
    'Utilities',
    'Games',
    'Developer'
];
// Single suggestion: exact text the user is typing (search on enter or click)
const suggestionText = $derived(searchQuery.trim());
const showSuggestions = $derived(suggestionText.length > 0);
// Focus search input when modal opens
$effect(() => {
    const el = searchInput;
    if (open && el) {
        setTimeout(() => {
            el.focus();
        }, 100);
    }
    if (!open) {
        searchQuery = '';
    }
});
function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
        open = false;
    }
}
function handleKeydown(e) {
    if (e.key === 'Escape') {
        open = false;
    }
    if (e.key === 'Enter' && searchQuery.trim()) {
        handleSearch();
    }
}
function handleSuggestionClick() {
    handleSearch();
}
function handleSearch() {
    const q = searchQuery.trim();
    if (q) {
        open = false;
        goto(`/apps?q=${encodeURIComponent(q)}`);
    }
}
function handleLabelTap(label) {
    searchQuery = label;
    open = false;
    goto(`/apps?q=${encodeURIComponent(label)}`);
}
</script>

{#snippet AndroidIcon()}
	<svg
		class="platform-icon"
		viewBox="0 0 24 24"
		fill="currentColor"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.463 11.463 0 00-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 003 18h18a10.78 10.78 0 00-3.4-8.52zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
		/>
	</svg>
{/snippet}

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-[100] bg-overlay flex justify-center items-start"
		style="position: fixed !important; inset: 0 !important; margin: 0 !important;"
		transition:fade={{ duration: 150 }}
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-label="Search overlay"
		tabindex="-1"
	>
		<div
			class="border-subtle shadow-2xl overflow-hidden backdrop-blur-lg w-full search-modal-width mx-0 sm:mx-4"
			style="
        background: linear-gradient(
          to bottom,
          var(--gray33),
          hsl(241 15% 25% / 0.5)
        );
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        border-bottom-left-radius: var(--radius-32);
        border-bottom-right-radius: var(--radius-32);
      "
			transition:fade={{ duration: 150 }}
		>
			<!-- Search Bar -->
			<div class="p-3 pb-1">
				<div
					class="search-bar-btn flex items-center gap-3 pl-3 pr-4 h-10 transition-all duration-200 focus-within:shadow-[0_0_80px_color-mix(in srgb, var(--blurpleColor) 20%, transparent),0_0_160px_color-mix(in srgb, var(--blurpleColor) 15%, transparent),0_0_240px_color-mix(in srgb, var(--blurpleColor) 12%, transparent),0_0_320px_color-mix(in srgb, var(--blurpleColor) 8%, transparent)]"
					style="border-color: var(--white16); background-color: var(--black16);"
				>
					<Search class="h-5 w-5 text-muted-foreground flex-shrink-0" />
					<input
						bind:this={searchInput}
						type="text"
						bind:value={searchQuery}
						placeholder="Search or Describe apps"
						class="search-input flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-base"
					/>
					<button
						type="button"
						onclick={() => (open = false)}
						class="close-btn rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
						aria-label="Close search"
					>
						<X class="h-5 w-5" style="color: var(--white33);" />
					</button>
				</div>
			</div>

			<!-- Suggestions: one row = exact query (search on enter or click) -->
			{#if showSuggestions}
				<div class="suggestions-area px-3 pb-2">
					<button
						type="button"
						class="suggestion-item w-full text-left px-3 py-1.5 hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-3"
						onclick={handleSuggestionClick}
					>
						<Search class="h-5 w-5 flex-shrink-0" style="color: var(--white16);" />
						<span style="color: var(--white66);">{suggestionText}</span>
					</button>
					<!-- Search with description – commented out for now
          <button ... onclick={handleDescribeClick}>
            <Magic ... /> Search with description
          </button>
          -->
				</div>
			{/if}

			<!-- Content Area -->
			<div class="content-area flex flex-col gap-4">
				<!-- Labels Section (colors derived from label name via Label.svelte / stringToColor) -->
				<div>
					<div class="section-header flex items-center justify-between mb-2">
						<h3 class="eyebrow-label">Labels</h3>
						<button type="button" class="more-btn flex items-center gap-1.5 cursor-pointer">
							<span class="text-xs" style="color: var(--white33);">More</span>
							<ChevronRight variant="outline" color="var(--white33)" size={10} />
						</button>
					</div>
					<div class="scrollable-row scrollbar-hide" use:wheelScroll>
						<div class="flex gap-2">
							{#each commonLabels as label (label)}
								<button
									type="button"
									class="label-tap flex-shrink-0 cursor-pointer bg-transparent border-none p-0"
									onclick={() => handleLabelTap(label)}
									aria-label="Search for {label}"
								>
									<Label text={label} isSelected={false} isEmphasized={false} />
								</button>
							{/each}
						</div>
					</div>
				</div>

				<!-- Catalogs Section -->
				<div>
					<div class="section-header flex items-center justify-between mb-2">
						<h3 class="eyebrow-label">Catalogs</h3>
						<button type="button" class="more-btn flex items-center gap-1.5 cursor-pointer">
							<span class="text-xs" style="color: var(--white33);">More</span>
							<ChevronRight variant="outline" color="var(--white33)" size={10} />
						</button>
					</div>
					<div class="scrollable-row scrollbar-hide" use:wheelScroll>
						<div class="flex gap-2 items-center">
							<button
								type="button"
								class="catalog-pill zapstore-pill flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
							>
								<span class="catalog-pill-avatar">
									<ProfilePic
										pictureUrl={zapstoreProfile?.picture}
										name={zapstoreProfile?.name ?? 'Zapstore'}
										pubkey={ZAPSTORE_PUBKEY}
										size="sm"
									/>
								</span>
								<span class="text-sm whitespace-nowrap" style="color: var(--white66);"
									>Zapstore</span
								>
							</button>
							<span class="pill coming-soon-pill--catalog flex items-center flex-shrink-0">
								<span class="text-sm whitespace-nowrap" style="color: var(--white33);"
									>More catalogs coming soon</span
								>
							</span>
						</div>
					</div>
				</div>

				<!-- Platforms Section -->
				<div class="pb-4">
					<div class="section-header mb-2">
						<h3 class="eyebrow-label">Platforms</h3>
					</div>
					<div class="flex flex-wrap gap-2 platform-pills">
						<button
							type="button"
							class="pill flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
						>
							{@render AndroidIcon()}
							<span class="text-sm whitespace-nowrap" style="color: var(--white66);"
								>Android</span
							>
						</button>
						<span class="pill flex items-center">
							<span class="text-sm whitespace-nowrap" style="color: var(--white33);"
								>More platforms coming soon</span
							>
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.close-btn {
		padding: 0.125rem;
		margin-right: -0.25rem;
	}

	.content-area {
		padding-top: 0.5rem;
	}

	.section-header {
		padding-left: 1rem;
		padding-right: 0.75rem;
	}

	.more-btn {
		background: none;
		border: none;
		padding: 0;
	}

	.more-btn:hover span {
		color: var(--white66) !important;
	}

	.scrollable-row {
		overflow-x: auto;
		padding-left: 1rem;
		padding-right: 1rem;
	}

	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}

	.catalog-pill {
		padding: 4px;
		padding-right: 0.875rem;
		border-radius: 9999px;
	}

	.catalog-pill-avatar {
		opacity: 0.66;
		transition: opacity 0.15s ease;
	}

	.zapstore-pill:hover .catalog-pill-avatar {
		opacity: 1;
	}

	.pill {
		height: 32px;
		padding: 0 0.875rem 0 0.5rem;
		border-radius: 9999px;
	}

	.platform-icon {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		color: var(--white33);
	}

	/* Match height to Zapstore pill (~36px): nudge "More catalogs coming soon" up so it aligns */
	.coming-soon-pill--catalog {
		margin-top: -2px;
		min-height: 36px;
		align-items: center;
	}

	.platform-pills {
		padding-left: 1rem;
		padding-right: 1rem;
	}

	.suggestions-area {
		border-bottom: 1px solid var(--white8);
		margin-bottom: 0.5rem;
	}

	.suggestion-item {
		background: none;
		border: none;
		font-size: 0.875rem;
	}
</style>
