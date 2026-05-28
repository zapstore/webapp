<script lang="js">
/**
 * TipAmountRow — clickable tip amount display above a comment editor (matches ZapSlider amount row).
 */
import Zap from '$lib/components/icons/Zap.svelte';

let {
	amountSats = 0,
	onedit = () => {},
	showTopBadge = false
} = $props();

function formatWithCommas(val) {
	return Math.round(val).toLocaleString('en-US');
}
</script>

<button type="button" class="tip-amount-row" onclick={onedit} aria-label="Change tip amount">
	<div class="row-left">
		<Zap variant="fill" size={16} color="url(#tip-amount-row-gold-gradient)" />
		<span class="amount-display">{formatWithCommas(amountSats)}</span>
	</div>
	{#if showTopBadge}
		<div class="top-zap-badge">
			<span>Top Zap</span>
		</div>
	{/if}
</button>
<div class="divider" aria-hidden="true"></div>

<svg width="0" height="0" style="position: absolute;" aria-hidden="true">
	<defs>
		<linearGradient id="tip-amount-row-gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" style="stop-color:#FFC736" />
			<stop offset="100%" style="stop-color:#FFA037" />
		</linearGradient>
	</defs>
</svg>

<style>
	.tip-amount-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 12px 16px;
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
	}

	.row-left {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}

	.amount-display {
		font-size: 18px;
		font-weight: 700;
		color: var(--white);
		line-height: 1.2;
	}

	.top-zap-badge {
		display: flex;
		align-items: center;
		height: 22px;
		background: linear-gradient(
			135deg,
			rgba(255, 199, 54, 0.16) 0%,
			rgba(255, 160, 55, 0.16) 100%
		);
		border-radius: 11px;
		padding: 0 10px;
		flex-shrink: 0;
	}

	.top-zap-badge span {
		font-size: 11px;
		font-weight: 500;
		line-height: 1;
		background: linear-gradient(135deg, #ffc736 0%, #ffa037 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.divider {
		height: 1px;
		background: var(--white8);
		margin: 0;
	}
</style>
