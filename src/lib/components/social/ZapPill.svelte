<script lang="js">
	/**
	 * ZapPill — small gold-tinted capsule shown under a comment/zap to surface
	 * an incoming zap. Displays a gold zap icon, the amount, and the zapper's avatar.
	 *
	 * Visual spec (from product/design):
	 *   • height 26px, fully rounded, bg `var(--gradient-gold16)`
	 *   • 8px left padding, 12px gold zap icon, 4px gap
	 *   • medium12 white66 amount text, 6px gap
	 *   • 18px ProfilePic, 4px right padding
	 */
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import { Zap } from '$lib/components/icons';

	let {
		/** Sats amount for this zap (already converted to sats from millisats). */
		amountSats = 0,
		pubkey = null,
		name = '',
		pictureUrl = null,
		profileUrl = '',
		className = ''
	} = $props();

	function formatAmount(val) {
		if (val >= 1_000_000) {
			return `${(val / 1_000_000).toFixed(val % 1_000_000 === 0 ? 0 : 1)}M`;
		}
		if (val >= 1000) {
			return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
		}
		return val.toLocaleString();
	}

	const amountLabel = $derived(formatAmount(Math.max(0, Math.round(amountSats || 0))));
</script>

{#if profileUrl}
	<a href={profileUrl} class="zap-pill {className}" aria-label="Zap of {amountLabel} sats">
		<Zap variant="fill" size={11} color="var(--goldColor)" />
		<span class="zap-pill-amount medium12">{amountLabel}</span>
		<span class="zap-pill-avatar">
			<ProfilePic {pictureUrl} {name} {pubkey} size="xs" className="zap-pill-profile-pic" />
		</span>
	</a>
{:else}
	<span class="zap-pill {className}" aria-label="Zap of {amountLabel} sats">
		<Zap variant="fill" size={11} color="var(--goldColor)" />
		<span class="zap-pill-amount medium12">{amountLabel}</span>
		<span class="zap-pill-avatar">
			<ProfilePic {pictureUrl} {name} {pubkey} size="xs" className="zap-pill-profile-pic" />
		</span>
	</span>
{/if}

<style>
	.zap-pill {
		display: inline-flex;
		align-items: center;
		gap: 0;
		height: 23px;
		padding: 0 3px 0 6px;
		border-radius: 9999px;
		background: var(--gradient-gold16);
		color: var(--goldColor);
		text-decoration: none;
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	a.zap-pill:hover {
		transform: scale(1.02);
	}

	.zap-pill-amount {
		color: var(--white66);
		line-height: 1;
		margin-left: 2px;
		margin-right: 7px;
		white-space: nowrap;
	}

	.zap-pill-avatar {
		display: inline-flex;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	/* ProfilePic ships at 20px for `xs`; constrain to 18px for the pill. */
	.zap-pill-avatar :global(.zap-pill-profile-pic) {
		width: 18px;
		height: 18px;
		min-width: 18px;
		min-height: 18px;
	}
</style>
