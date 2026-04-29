<script lang="js">
/**
 * QuotedZapMessage — compact quote for a zap (zapper + amount + optional comment text).
 * Gold theme: `--gradient-gold66` for accent bar + name; icon fill matches same 66% gold stops.
 */
import ShortTextPreview from '$lib/components/common/ShortTextPreview.svelte';
import { Zap } from '$lib/components/icons';

let {
	authorName = 'Anonymous',
	authorPubkey = null,
	amountSats = 0,
	/** Zap request comment / description */
	content = '',
	emojiTags = [],
	mediaUrls = [],
	resolveMentionLabel = null,
	maxPreviewLength = 80
} = $props();

function formatAmount(val) {
	if (val >= 1000000) return `${(val / 1000000).toFixed(val % 1000000 === 0 ? 0 : 1)}M`;
	if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
	return val.toLocaleString();
}

const useRichPreview = $derived((content ?? '').trim().length > 0 || (emojiTags?.length ?? 0) > 0 || (mediaUrls?.length ?? 0) > 0);
const plainPreview = $derived.by(() => {
	const plain = (content || '').replace(/\s+/g, ' ').trim();
	if (plain.length <= maxPreviewLength) return plain;
	return plain.slice(0, maxPreviewLength).trim() + '…';
});
</script>

<div class="quoted-zap" data-zapper-pubkey={authorPubkey ?? undefined}>
	<div class="quoted-zap-bar" aria-hidden="true"></div>
	<div class="quoted-zap-body">
		<div class="quoted-zap-top">
			<span class="quoted-zap-name">{authorName}</span>
			<span class="quoted-zap-amount-row" aria-label="{amountSats} sats">
				<Zap variant="fill" size={12} color="var(--goldColor)" />
				<span class="quoted-zap-sats">{formatAmount(amountSats)}</span>
			</span>
		</div>
		{#if useRichPreview}
			<div class="quoted-zap-content">
				<ShortTextPreview
					content={content ?? ''}
					emojiTags={emojiTags ?? []}
					mediaUrls={mediaUrls ?? []}
					{resolveMentionLabel}
					maxLines={1}
					class="quoted-zap-preview"
				/>
			</div>
		{:else if plainPreview}
			<div class="quoted-zap-content quoted-zap-content--plain">{plainPreview}</div>
		{/if}
	</div>
</div>

<style>
	.quoted-zap {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		min-height: 0;
		margin-bottom: 8px;
		border-radius: var(--radius-8);
		overflow: hidden;
		background: radial-gradient(
			circle at top left,
			rgba(255, 199, 54, 0.1) 0%,
			rgba(255, 160, 55, 0.1) 100%
		);
	}

	.quoted-zap-body {
		flex: 1;
		min-width: 0;
		padding: 6px 10px 5px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.quoted-zap-bar {
		width: 3px;
		flex-shrink: 0;
		background: var(--gradient-gold);
	}

	.quoted-zap-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
	}

	.quoted-zap-name {
		font-size: 0.8125rem;
		font-weight: 600;
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
		background: var(--gradient-gold);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.quoted-zap-amount-row {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.quoted-zap-sats {
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1.2;
		color: var(--white);
	}

	.quoted-zap-content {
		font-size: 0.8125rem;
		line-height: 1.3;
		color: color-mix(in srgb, var(--white) 85%, transparent);
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.quoted-zap-content--plain {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
