<!--
  Header inbox panel: wraps CommunityActivityShell in inbox mode.
  Desktop: transform creates a containing block so position:fixed modals stay inside the panel.
  Mobile: transform is off so thread/options backdrops can cover the full viewport (see Modal scoped + z-index).
-->
<script lang="js">
	import CommunityActivityShell from '$lib/components/community/CommunityActivityShell.svelte';
	import { Inbox } from '$lib/components/icons';

	let { pubkey = null, open = false } = $props();

	/** @type {CommunityActivityShell | null} */
	let shellRef = $state(null);
</script>

{#if open && pubkey}
	<div
		class="user-inbox-popover border border-border shadow-xl flex flex-col"
		style="width: min(480px, calc(100vw - 24px)); max-height: min(90vh, calc(100dvh - 16px));"
		role="dialog"
		aria-label="Inbox"
	>
		<div class="user-inbox-head shrink-0">
			<div class="user-inbox-head-left">
				<Inbox size={20} strokeWidth={1.4} color="var(--white33)" className="shrink-0" />
				<h2 class="text-sm font-medium text-foreground m-0">Inbox</h2>
			</div>
			<button
				type="button"
				class="mark-all-read-btn"
				onclick={() => shellRef?.markAllRead()}
			>Mark all as read</button>
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

	.user-inbox-popover {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 200;
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
		.user-inbox-popover {
			/* Let fixed overlays use the viewport; matches community +layout .right-page-viewport mobile */
			transform: none;
		}
	}

</style>
