<script lang="js">
	/**
	 * InputLabel - Tag/label-shaped text input
	 *
	 * Optional structured app labels: "Alternative to", "Reads", "Writes" (chevron menu)
	 * → publishes as alternative:x, reads:x, writes:x with L=app when used from ActionsModal.
	 */
	import { ChevronDown, Cross } from '$lib/components/icons';

	import { onMount } from 'svelte';

	/** @typedef {'alternative' | 'reads' | 'writes' | null} StructuredKind */

	let {
		value = $bindable(''),
		structuredKind = $bindable(null),
		enableStructuredModes = false,
		placeholder = 'Your label',
		onAdd = () => {},
		onOptions = () => {},
		focusOnMount = false,
		addDisabled = false
	} = $props();

	let inputEl = $state(null);
	/** @type {HTMLDivElement | null} */
	let rootEl = $state(null);
	let optionsOpen = $state(false);

	onMount(() => {
		if (focusOnMount) {
			const t = globalThis.setTimeout(() => inputEl?.focus(), 150);
			return () => globalThis.clearTimeout(t);
		}
	});

	const hasText = $derived(value.trim().length > 0);
	const showClearOrAdd = $derived(hasText || (enableStructuredModes && structuredKind != null));
	const hasStructuredPrefix = $derived(Boolean(enableStructuredModes && structuredKind != null));

	$effect(() => {
		if (!optionsOpen) return;
		const close = (/** @type {PointerEvent} */ e) => {
			const t = e.target;
			if (t instanceof globalThis.Element && rootEl && !rootEl.contains(t)) optionsOpen = false;
		};
		document.addEventListener('pointerdown', close, true);
		return () => document.removeEventListener('pointerdown', close, true);
	});

	function clearAll() {
		value = '';
		structuredKind = null;
		inputEl?.focus();
	}

	function pickStructured(/** @type {'alternative' | 'reads' | 'writes'} */ kind) {
		structuredKind = kind;
		optionsOpen = false;
		inputEl?.focus();
	}

	function handleChevronClick() {
		optionsOpen = !optionsOpen;
		if (optionsOpen) onOptions();
	}

	function handleAddClick() {
		if (!hasText || addDisabled) return;
		if (enableStructuredModes && structuredKind && !value.trim()) return;
		onAdd();
	}
</script>

<div class="input-label-root" bind:this={rootEl}>
	<div class="input-label-container">
		<svg class="input-label-shape" viewBox="0 0 500 42" preserveAspectRatio="none" aria-hidden="true">
			<path
				d="M16 0.5
			   L460 0.5
			   Q468 0.5 474 4
			   Q482 9 488 16
			   Q491 19.5 491 21
			   Q491 22.5 488 26
			   Q482 33 474 38
			   Q468 41.5 460 41.5
			   L16 41.5
			   A15.5 15.5 0 0 1 0.5 26
			   L0.5 16
			   A15.5 15.5 0 0 1 16 0.5
			   Z"
				fill="var(--black33)"
				stroke="var(--white33)"
				stroke-width="0.5"
				vector-effect="non-scaling-stroke"
			/>
		</svg>

		<div class="input-label-field-row">
			{#if enableStructuredModes && structuredKind === 'alternative'}
				<span class="input-label-prefix">Alternative to </span>
			{:else if enableStructuredModes && structuredKind === 'reads'}
				<span class="input-label-prefix">Reads </span>
			{:else if enableStructuredModes && structuredKind === 'writes'}
				<span class="input-label-prefix">Writes </span>
			{/if}
			<input
				type="text"
				class="input-label-input"
				class:with-prefix={hasStructuredPrefix}
				bind:value
				bind:this={inputEl}
				{placeholder}
			/>
		</div>

		{#if showClearOrAdd}
			<button
				type="button"
				class="clear-round-btn"
				onclick={clearAll}
				aria-label="Clear label"
			>
				<Cross variant="outline" size={10} color="var(--white33)" strokeWidth={1.4} />
			</button>
			{#if hasText}
				<button type="button" class="add-button" onclick={handleAddClick} disabled={addDisabled}>
					Add
				</button>
			{:else if enableStructuredModes && structuredKind != null}
				<button type="button" class="add-button" onclick={handleAddClick} disabled={true}>
					Add
				</button>
			{/if}
		{:else}
			<div class="divider"></div>
			<button
				type="button"
				class="chevron-button"
				onclick={handleChevronClick}
				aria-haspopup="menu"
				aria-expanded={optionsOpen}
				aria-label={enableStructuredModes ? 'Label type' : 'More options'}
			>
				<ChevronDown variant="outline" size={16} color="var(--white33)" />
			</button>
		{/if}
	</div>

	{#if optionsOpen}
		<div class="structured-options" role="menu">
			{#if enableStructuredModes}
				<button type="button" role="menuitem" class="structured-option structured-option-row" onclick={() => pickStructured('alternative')}>
					<span class="structured-option-text">Alternative to</span>
					<span class="structured-option-ellipsis" aria-hidden="true">…</span>
				</button>
				<button type="button" role="menuitem" class="structured-option structured-option-row" onclick={() => pickStructured('reads')}>
					<span class="structured-option-text">Reads</span>
					<span class="structured-option-ellipsis" aria-hidden="true">…</span>
				</button>
				<button type="button" role="menuitem" class="structured-option structured-option-row" onclick={() => pickStructured('writes')}>
					<span class="structured-option-text">Writes</span>
					<span class="structured-option-ellipsis" aria-hidden="true">…</span>
				</button>
			{:else}
				<div class="structured-options-empty" role="menuitem" aria-disabled="true" tabindex="-1">
					<span class="structured-options-empty-text">No Options</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.input-label-root {
		position: relative;
		width: 100%;
	}

	.input-label-container {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		height: 42px;
	}

	@media (max-width: 767px) {
		.input-label-container {
			height: 38px;
		}
	}

	.input-label-shape {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.input-label-field-row {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
		height: 100%;
		padding-left: 16px;
	}

	.input-label-prefix {
		flex-shrink: 0;
		font-family: 'Inter', sans-serif;
		font-size: 16px;
		font-weight: 500;
		line-height: 42px;
		color: var(--white66);
		white-space: pre;
	}

	@media (max-width: 767px) {
		.input-label-prefix {
			line-height: 38px;
			font-size: 15px;
		}
	}

	.input-label-input.with-prefix {
		padding-left: 4px;
	}

	.input-label-input {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0 8px 0 0;
		background: transparent;
		border: none;
		outline: none;
		color: var(--white);
		font-family: 'Inter', sans-serif;
		font-size: 16px;
		font-weight: 500;
		line-height: 42px;
	}

	@media (max-width: 767px) {
		.input-label-input {
			line-height: 38px;
			font-size: 15px;
		}
	}

	.input-label-input::placeholder {
		color: var(--white33);
	}

	.clear-round-btn {
		position: relative;
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 8px;
		background: var(--white8);
		border: none;
		border-radius: 9999px;
		cursor: pointer;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}

	.clear-round-btn:hover {
		opacity: 0.9;
	}

	.clear-round-btn:active {
		transform: scale(0.96);
	}

	@media (max-width: 767px) {
		.clear-round-btn {
			width: 20px;
			height: 20px;
			margin-right: 6px;
		}
	}

	.add-button {
		position: relative;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 26px;
		padding: 0 16px;
		margin-right: 32px;
		font-size: 14px;
		font-weight: 500;
		color: var(--whiteEnforced);
		background: var(--gradient-blurple);
		border: none;
		border-radius: 9999px;
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.add-button:hover {
		transform: scale(1.04);
	}

	.add-button:active {
		transform: scale(0.96);
	}

	.add-button:disabled {
		opacity: 0.42;
		cursor: not-allowed;
		transform: none;
	}

	.add-button:disabled:hover,
	.add-button:disabled:active {
		transform: none;
	}

	@media (max-width: 767px) {
		.add-button {
			height: 24px;
			padding: 0 14px;
			font-size: 13px;
			margin-right: 26px;
		}
	}

	.divider {
		width: 1.4px;
		height: 100%;
		margin-left: 8px;
		background-color: var(--white8);
		flex-shrink: 0;
	}

	.chevron-button {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		padding-left: 12px;
		padding-top: 2px;
		width: 50px;
		height: 100%;
		margin-right: 8px;
		background: transparent;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
		transition: opacity 0.15s ease;
	}

	.chevron-button:hover {
		opacity: 0.7;
	}

	/* Match ShortTextInput `.suggestion-menu-empty` / `.suggestion-empty-text` */
	.structured-options-empty {
		padding: 12px 16px;
		text-align: center;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: default;
	}

	.structured-options-empty-text {
		font-size: 14px;
		font-weight: 500;
		color: var(--white33);
		font-family: var(--font-sans);
	}

	@media (max-width: 767px) {
		.chevron-button {
			width: 46px;
			padding-left: 10px;
			margin-right: 6px;
		}
	}

	/* Profile-style panel: gray66 + 14px labels (ShortTextInput `.suggestion-profile-name`) */
	.structured-options {
		position: absolute;
		right: 0;
		bottom: calc(100% + 6px);
		z-index: 25;
		min-width: 240px;
		max-width: 320px;
		padding: 0;
		background: var(--gray66);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border: 0.33px solid var(--white33);
		border-radius: 12px;
		overflow: hidden;
	}

	.structured-option {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 8px 12px;
		text-align: left;
		font-size: 14px;
		font-weight: 500;
		line-height: 1.25;
		color: var(--white);
		background: transparent;
		border: none;
		border-bottom: 0.33px solid var(--white8);
		cursor: pointer;
		font-family: var(--font-sans);
		transition: background-color 0.1s ease;
	}

	.structured-option:last-child {
		border-bottom: none;
	}

	.structured-option-row {
		flex-direction: row;
		align-items: baseline;
		gap: 3px;
	}

	.structured-option-text {
		flex-shrink: 0;
		color: var(--white);
	}

	.structured-option-ellipsis {
		color: var(--white33);
		flex-shrink: 0;
		font-size: 14px;
		font-weight: 500;
	}

	.structured-option:hover {
		background: var(--white8);
	}
</style>
