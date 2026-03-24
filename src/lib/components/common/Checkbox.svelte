<script lang="js">
	/** LabCheckBox-style: 24px box, blurple when checked, scale + check animation. zaplab_design parity. */
	let { checked = false, disabled = false, onChanged = () => {}, ariaLabel = undefined } = $props();
	let animating = $state(false);
	let animChecked = $state(false);

	function toggle() {
		if (disabled) return;
		animating = true;
		animChecked = !animChecked;
		onChanged(animChecked);
		setTimeout(() => {
			animating = false;
		}, 222);
	}

	/** Avoid double-toggle when nested inside another clickable (e.g. row + checkbox both call the same handler). */
	function handleClick(/** @type {MouseEvent} */ e) {
		e.stopPropagation();
		toggle();
	}

	$effect(() => {
		if (!animating) {
			animChecked = checked;
		}
	});
</script>

<button
	type="button"
	class="lab-checkbox"
	class:checked={animChecked}
	class:animating
	disabled={disabled}
	onclick={handleClick}
	aria-checked={animChecked}
	aria-label={ariaLabel}
	role="checkbox"
>
	<span class="lab-checkbox-box">
		{#if animChecked}
			<span class="lab-checkbox-check">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
					<path d="M3 8l4 4 6-8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</span>
		{/if}
	</span>
</button>

<style>
	.lab-checkbox {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		margin: 0;
		background: none;
		border: none;
		cursor: pointer;
		border-radius: var(--radius-8);
	}
	.lab-checkbox:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.lab-checkbox-box {
		width: 24px;
		height: 24px;
		border-radius: var(--radius-8);
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--black33));
		border: 1.5px solid hsl(var(--white33));
		transition: background 0.15s ease, border-color 0.15s ease;
	}
	/* Promote to GPU layer only while animating */
	.lab-checkbox.animating .lab-checkbox-box {
		will-change: transform;
	}
	.lab-checkbox:hover:not(:disabled) .lab-checkbox-box {
		transform: scale(1.01);
	}
	.lab-checkbox:active:not(:disabled) .lab-checkbox-box {
		transform: scale(0.97);
	}
	.lab-checkbox.checked .lab-checkbox-box {
		background: var(--gradient-blurple);
		border-color: transparent;
	}
	/* Box pop on check: 1.0 → 1.09 (60%) → 1.0 */
	.lab-checkbox.animating.checked .lab-checkbox-box {
		animation: box-pop 0.24s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.lab-checkbox-check {
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--whiteEnforced));
		will-change: transform, opacity;
		/* Check pop: 0 → 1.18 (60%) → 1.0 */
		animation: check-pop 0.24s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes box-pop {
		0%   { transform: scale(1); }
		60%  { transform: scale(1.09); }
		100% { transform: scale(1); }
	}
	@keyframes check-pop {
		0%   { opacity: 0; transform: scale(0.4); }
		60%  { opacity: 1; transform: scale(1.18); }
		100% { opacity: 1; transform: scale(1); }
	}
</style>
