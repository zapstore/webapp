<script lang="js">
/**
 * ZappyError — Unified error/not-found display with Zappy mascot.
 *
 * Props:
 *   message        – The thing that went wrong (e.g. "this app wasn't found.")
 *   primaryAction  – { label, href?, onclick? }  Main CTA
 *   secondaryAction – { label, href?, onclick? } | null  Optional secondary action
 */
let {
	message = 'something went wrong.',
	primaryAction = { label: 'Go to apps', href: '/apps' },
	secondaryAction = null
} = $props();

const BTN_STYLE = 'background-color: var(--black16); font-size: 1.0625rem;';
const BTN_SECONDARY_STYLE = BTN_STYLE + ' color: var(--white66);';
</script>

<div class="zappy-error-page">
	<div class="zappy-error-layout">

		<!-- Mascot column -->
		<div class="zappy-frame">
			<img src="/images/Zappy.svg" alt="Zappy mascot" class="zappy-img" />
			<div class="zappy-shadow" aria-hidden="true"></div>
		</div>

		<!-- Chat bubbles column -->
		<div class="bubbles-col">
			<!-- Bubble 1: message -->
			<div class="error-bubble bubble-message">
				<p>It looks like {message}</p>
			</div>

			<!-- Bubble 2: actions -->
			<div class="error-bubble bubble-actions">
				{#if primaryAction.href}
					<a href={primaryAction.href} class="btn-primary" style={BTN_STYLE}>
						{primaryAction.label}
					</a>
				{:else if primaryAction.onclick}
					<button type="button" class="btn-primary" style={BTN_STYLE} onclick={primaryAction.onclick}>
						{primaryAction.label}
					</button>
				{/if}

				{#if secondaryAction}
					{#if secondaryAction.href}
						<a href={secondaryAction.href} class="btn-secondary" style={BTN_SECONDARY_STYLE}>
							{secondaryAction.label}
						</a>
					{:else if secondaryAction.onclick}
						<button
							type="button"
							class="btn-secondary"
							style={BTN_SECONDARY_STYLE}
							onclick={secondaryAction.onclick}
						>
							{secondaryAction.label}
						</button>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* ── Page shell ──────────────────────────────────────────── */
	.zappy-error-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		padding: 2rem 1.25rem;
	}

	/* ── Outer layout: always a row, top-aligned, no gap ─────── */
	.zappy-error-layout {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
		gap: 0;
	}

	/* ── Zappy mascot + shadow ───────────────────────────────── */
	.zappy-frame {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		overflow: visible;
		/* mobile: 80px image + 10px bounce travel + 18px for shadow below */
		width: 80px;
		height: 108px;
	}

	@media (min-width: 768px) {
		.zappy-frame {
			width: 200px;
			height: 240px;
		}
	}

	.zappy-img {
		width: 80px;
		height: 80px;
		object-fit: contain;
		animation: zappy-bounce 3s ease-in-out infinite;
		position: relative;
		z-index: 1;
	}

	@media (min-width: 768px) {
		.zappy-img {
			width: 200px;
			height: 200px;
		}
	}

	.zappy-shadow {
		position: absolute;
		bottom: -4px; /* 4px below the frame floor */
		left: 50%;
		width: 48px;
		height: 9px;
		background: var(--gray33);
		border-radius: 50%;
		animation: shadow-breathe 3s ease-in-out infinite;
	}

	@media (min-width: 768px) {
		.zappy-shadow {
			width: 110px;
			height: 14px;
		}
	}

	@keyframes zappy-bounce {
		0%, 100% { transform: translateY(0px); }
		50%       { transform: translateY(10px); }
	}

	@keyframes shadow-breathe {
		0%, 100% {
			transform: translateX(-50%) scaleX(0.82);
			opacity: 0.45;
		}
		50% {
			transform: translateX(-50%) scaleX(1.18);
			opacity: 0.72;
		}
	}

	/* ── Bubbles column ──────────────────────────────────────── */
	.bubbles-col {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-top: 16px;
		flex: 1;
		min-width: 0;
		max-width: 340px;
	}

	@media (min-width: 768px) {
		.bubbles-col {
			max-width: 380px;
		}
	}

	/* ── Shared bubble base ──────────────────────────────────── */
	.error-bubble {
		background: var(--gradient-blurple66);
		width: fit-content;
	}

	/* ── Bubble 1: message — all corners equal ───────────────── */
	.bubble-message {
		border-radius: 20px;
		padding: 12px 18px;
		max-width: 100%;
	}

	.bubble-message p {
		margin: 0;
		font-size: 1.0625rem;
		line-height: 1.5;
		color: var(--white);
		font-weight: 500;
	}

	/* ── Bubble 2: actions — bottom-left corner narrowed ─────── */
	.bubble-actions {
		border-radius: 20px 20px 20px 4px;
		padding: 10px 14px;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}
</style>
