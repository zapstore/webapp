<script lang="js">
/**
 * ForumPostLabelsModal - Optional label picker for forum post creation.
 * Renders as a stacked bottom sheet over ForumPostModal.
 * Selection syncs back to the parent via bind:selectedLabels.
 *
 * Labels are split into 3 equal rows. Each row is a nowrap flex line
 * with a consistent 8px gap. All rows share one horizontal scroll container.
 */
import { fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import Label from '$lib/components/common/Label.svelte';
import InputLabel from '$lib/components/common/InputLabel.svelte';
import { wheelScroll } from '$lib/actions/wheelScroll.js';
import { FORUM_CATEGORIES } from '$lib/config';

let {
	isOpen = $bindable(false),
	selectedLabels = $bindable(/** @type {string[]} */ ([])),
	/** Same as forum feed categories by default */
	suggestions = FORUM_CATEGORIES,
	onclose = () => {}
} = $props();

let labelInputValue = $state('');

// Custom labels (user-added) prepend so they land in row 1
const allLabels = $derived([
	...selectedLabels.filter(/** @param {string} l */ (l) => !suggestions.includes(l)),
	...suggestions
]);

// Split into 3 equal rows for reading-order left-to-right display
const chipRows = $derived(
	[0, 1, 2].map((i) => {
		const perRow = Math.ceil(allLabels.length / 3);
		return allLabels.slice(i * perRow, (i + 1) * perRow);
	})
);

const selectedSet = $derived(new Set(selectedLabels));

$effect(() => {
	if (!isOpen) {
		labelInputValue = '';
	}
});

function toggle(/** @type {string} */ label) {
	const next = new Set(selectedLabels);
	if (next.has(label)) next.delete(label);
	else next.add(label);
	selectedLabels = [...next];
}

function handleAddLabel() {
	const val = labelInputValue.trim();
	if (!val) return;
	if (!selectedLabels.includes(val)) {
		selectedLabels = [...selectedLabels, val];
	}
	labelInputValue = '';
}

function handleClose() {
	isOpen = false;
	onclose?.();
}

function handleKeydown(/** @type {KeyboardEvent} */ e) {
	if (e.key === 'Escape') handleClose();
}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="labels-overlay" onclick={handleClose} role="presentation"></div>

	<div class="labels-wrapper" role="dialog" aria-modal="true" aria-label="Labels">
		<div class="labels-sheet" transition:fly={{ y: 80, duration: 200, easing: cubicOut }}>
			<InputLabel
				bind:value={labelInputValue}
				placeholder="Add a label..."
				onAdd={handleAddLabel}
				focusOnMount={isOpen}
			/>

			<div class="labels-chips-scroll" use:wheelScroll>
				<div class="chips-rows">
					{#each chipRows as row}
						<div class="chips-row">
							{#each row as label}
								<Label
									text={label}
									isSelected={selectedSet.has(label)}
									isEmphasized={false}
									onTap={() => toggle(label)}
								/>
							{/each}
						</div>
					{/each}
				</div>
			</div>

			<button type="button" class="btn-primary-large w-full" onclick={handleClose}>Done</button>
		</div>
	</div>
{/if}

<style>
	.labels-overlay {
		position: fixed;
		inset: 0;
		z-index: 61;
		background: transparent;
	}

	.labels-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 62;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.labels-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		padding: 16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	@media (min-width: 768px) {
		.labels-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			padding: 12px;
		}
	}

	/* Negative margin lets the scroll area go edge-to-edge so fade masks align with the modal border */
	.labels-chips-scroll {
		overflow-x: auto;
		overflow-y: hidden;
		margin: 0 -16px;
		padding: 4px 16px;
		scrollbar-width: none;
		-ms-overflow-style: none;
		-webkit-overflow-scrolling: touch;
		mask-image: linear-gradient(
			to right,
			transparent 0%,
			black 16px,
			black calc(100% - 16px),
			transparent 100%
		);
		-webkit-mask-image: linear-gradient(
			to right,
			transparent 0%,
			black 16px,
			black calc(100% - 16px),
			transparent 100%
		);
	}

	@media (min-width: 768px) {
		.labels-chips-scroll {
			margin: 0 -12px;
			padding: 4px 12px;
			mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 12px,
				black calc(100% - 12px),
				transparent 100%
			);
			-webkit-mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 12px,
				black calc(100% - 12px),
				transparent 100%
			);
		}
	}

	.labels-chips-scroll::-webkit-scrollbar {
		display: none;
	}

	.chips-rows {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: max-content;
		min-width: 100%;
	}

	.chips-row {
		display: flex;
		flex-wrap: nowrap;
		gap: 8px;
	}

	.btn-primary-large {
		height: 44px;
		padding: 0 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gradient-blurple);
		border: none;
		border-radius: var(--radius-16);
		color: hsl(var(--whiteEnforced));
		font-size: 16px;
		font-weight: 500;
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.btn-primary-large:active {
		transform: scale(0.98);
	}

	.w-full {
		width: 100%;
	}
</style>
