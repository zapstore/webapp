<!--
  Header inbox panel: wraps CommunityActivityShell in inbox mode.
  Desktop: transform creates a containing block so position:fixed modals stay inside the panel.
  Mobile: full-viewport fixed sheet below thread modals (z 130); transform off for nested fixed overlays.
-->
<script lang="js">
	import { browser } from '$app/environment';
	import CommunityActivityShell from '$lib/components/community/CommunityActivityShell.svelte';
	import { Inbox, Cross } from '$lib/components/icons';

	/** Matches header inbox chrome: landing = 32px + Cross 12; browse/studio = 40px + Cross 15 */
	let { pubkey = null, open = false, onClose, inboxHeaderVariant = 'browse' } = $props();

	/** @type {CommunityActivityShell | null} */
	let shellRef = $state(null);

	$effect(() => {
		if (!browser || !open) return;
		const savedOverflow = document.body.style.overflow;
		function syncBodyScrollLock() {
			if (window.matchMedia('(max-width: 767px)').matches) {
				document.body.style.overflow = 'hidden';
			} else {
				document.body.style.overflow = savedOverflow;
			}
		}
		syncBodyScrollLock();
		window.addEventListener('resize', syncBodyScrollLock);
		return () => {
			window.removeEventListener('resize', syncBodyScrollLock);
			document.body.style.overflow = savedOverflow;
		};
	});
</script>

{#if open && pubkey}
	<div
		class="user-inbox-popover border border-border shadow-xl flex flex-col"
		role="dialog"
		aria-label="Inbox"
	>
		<div class="user-inbox-head shrink-0">
			<div class="user-inbox-head-left">
				<Inbox size={20} strokeWidth={1.4} color="var(--white33)" className="shrink-0" />
				<h2 class="medium14 text-foreground m-0">Inbox</h2>
			</div>
			<div class="user-inbox-head-right">
				<button
					type="button"
					class="mark-all-read-btn"
					onclick={() => shellRef?.markAllRead()}
				>Mark all as read</button>
				{#if onClose}
					<button
						type="button"
						class="user-inbox-close-mobile"
						class:user-inbox-close-mobile--landing={inboxHeaderVariant === 'landing'}
						class:user-inbox-close-mobile--browse={inboxHeaderVariant !== 'landing'}
						onclick={() => onClose()}
						aria-label="Close inbox"
					>
						<Cross
							variant="outline"
							size={inboxHeaderVariant === 'landing' ? 12 : 15}
							strokeWidth={1.4}
							color="var(--white33)"
						/>
					</button>
				{/if}
			</div>
		</div>
		<div class="user-inbox-body flex-1 min-h-0 flex flex-col min-w-0">
			<CommunityActivityShell
				bind:this={shellRef}
				inboxUserPubkey={pubkey}
				inboxEmbed
				inboxActive={open}
			/>
		</div>
	</div>
{/if}

<style>
	.user-inbox-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--white16);
	}

	.user-inbox-head-left {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.mark-all-read-btn {
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		font-size: 0.75rem;
		color: var(--white33);
		white-space: nowrap;
		line-height: 1;
	}

	.mark-all-read-btn:hover {
		color: var(--white66);
	}

	.user-inbox-head-right {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	/* Same look as SiteHeader .header-inbox-btn (+ landing / browse sizes) */
	.user-inbox-close-mobile {
		display: none;
		position: relative;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin: 0;
		padding: 0;
		border: none;
		border-radius: 50%;
		background-color: var(--gray66);
		cursor: pointer;
		transition: transform 0.2s ease;
		transform: scale(1);
		-webkit-tap-highlight-color: transparent;
	}

	.user-inbox-close-mobile:hover {
		transform: scale(1.025);
	}

	.user-inbox-close-mobile:active {
		transform: scale(0.98);
	}

	.user-inbox-close-mobile--landing {
		width: 32px;
		height: 32px;
	}

	.user-inbox-close-mobile--browse {
		width: 40px;
		height: 40px;
	}

	.user-inbox-popover {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 200;
		width: min(480px, calc(100vw - 24px));
		max-height: min(90vh, calc(100dvh - 16px));
		overflow: visible;
		/* Only top-right stays tight to header chrome; other corners match sheet tokens */
		border-radius: 24px 8px 24px 24px;
		/* Nested fixed modals: reserve top 20% of inbox height so there's always
		   comfortable tap-to-close space above the thread sheet */
		--inbox-modal-top-reserve: 20%;
		background-color: var(--black);
		backdrop-filter: blur(var(--blur-sm));
		-webkit-backdrop-filter: blur(var(--blur-sm));
		box-shadow:
			0 28px 56px color-mix(in srgb, var(--black) 72%, transparent),
			0 12px 24px color-mix(in srgb, var(--black) 50%, transparent),
			0 2px 8px color-mix(in srgb, var(--black) 34%, transparent);
		transform: translateZ(0);
	}

	@media (max-width: 767px) {
		.user-inbox-close-mobile {
			display: inline-flex;
		}

		.user-inbox-popover {
			/* Full-screen sheet: below header chrome z-50, above page; thread modals use z-130 */
			position: fixed;
			inset: 0;
			top: 0;
			right: 0;
			left: 0;
			bottom: 0;
			width: 100%;
			max-width: none;
			height: 100dvh;
			max-height: 100dvh;
			min-height: 100dvh;
			border-radius: 0;
			z-index: 115;
			padding-top: env(safe-area-inset-top, 0px);
			padding-bottom: env(safe-area-inset-bottom, 0px);
			box-shadow: none;
			overflow: hidden;
			/* Let fixed overlays use the viewport; matches community +layout .right-page-viewport mobile */
			transform: none;
		}
	}

</style>
