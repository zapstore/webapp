<script lang="js">
/**
 * ZapPillRow — horizontally-scrolling row of {@link ZapPill}s shown beneath
 * a comment/zap bubble's content. Used to surface incoming zaps on a comment
 * (or zap-on-zap) without expanding bubble width.
 */
import ZapPill from "./ZapPill.svelte";
import { wheelScroll } from "$lib/actions/wheelScroll.js";

let {
	/**
	 * @type {Array<{
	 *   id: string,
	 *   senderPubkey?: string | null,
	 *   amountSats?: number,
	 *   displayName?: string,
	 *   avatarUrl?: string | null,
	 *   profileUrl?: string,
	 * }>}
	 */
	zaps = [],
	className = "",
} = $props();

/** Newest first so the freshest zap is visually first. */
const orderedZaps = $derived(
	[...(zaps ?? [])].sort((a, b) => (b.timestamp ?? b.createdAt ?? 0) - (a.timestamp ?? a.createdAt ?? 0))
);
</script>

{#if orderedZaps.length > 0}
	<div class="zap-pill-row {className}" use:wheelScroll>
		{#each orderedZaps as z (z.id)}
			<ZapPill
				amountSats={z.amountSats ?? 0}
				pubkey={z.senderPubkey ?? null}
				name={z.displayName ?? ""}
				pictureUrl={z.avatarUrl ?? null}
				profileUrl={z.profileUrl ?? ""}
			/>
		{/each}
	</div>
{/if}

<style>
	.zap-pill-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 4px;
		margin-top: 6px;
		padding: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-ms-overflow-style: none;
		max-width: 100%;
		min-width: 0;
		/* Avoid the scroll container shrinking the bubble; pills overflow horizontally. */
		flex-wrap: nowrap;
	}

	.zap-pill-row::-webkit-scrollbar {
		display: none;
	}
</style>
