<script lang="js">
/**
 * DropdownMenu — reusable styled dropdown container.
 *
 * Usage: render children with `.dropdown-item` class (button or <a>).
 * Dividers appear automatically between adjacent `.dropdown-item` elements.
 * For title + description items, also add `.dropdown-item--stacked` and
 * wrap text content in `.dropdown-item-body`.
 * For the active/selected state, add `.dropdown-item--active`.
 *
 * itemChevron (default false): when true, wrap ChevronRight icons in
 * `<span class="item-chevron">` — they are hidden by default and revealed
 * only when this prop is true.
 *
 * The component only handles styling — positioning (absolute/fixed) is the
 * responsibility of the parent.
 */
let { children, class: className = '', itemChevron = false } = $props();
</script>

<div class="dropdown-menu-container {className}" class:chevron-items={itemChevron} role="menu">
	{@render children?.()}
</div>

<style>
	.dropdown-menu-container {
		background: var(--gray66);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 0.33px solid var(--white16);
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 8px 32px var(--black33);
	}

	/* ── Base item ────────────────────────────────────────────── */
	:global(.dropdown-menu-container .dropdown-item) {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 14px;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		color: var(--white);
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		line-height: 1.3;
		transition: background-color 0.15s ease;
		box-sizing: border-box;
	}

	:global(.dropdown-menu-container .dropdown-item:hover) {
		background-color: var(--white4);
	}

	/* Auto-divider between adjacent items */
	:global(.dropdown-menu-container .dropdown-item + .dropdown-item) {
		border-top: 0.33px solid var(--white16);
	}

	/* ── Stacked variant: title + description in a body column,
	      chevron aligned right ─────────────────────────────── */
	:global(.dropdown-menu-container .dropdown-item--stacked) {
		align-items: center;
		gap: 12px;
		padding: 11px 14px;
	}

	:global(.dropdown-menu-container .dropdown-item-body) {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		min-width: 0;
	}

	:global(.dropdown-menu-container .dropdown-item-title) {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--white);
		line-height: 1.3;
	}

	:global(.dropdown-menu-container .dropdown-item-desc) {
		font-size: 0.75rem;
		color: var(--white66);
		line-height: 1.4;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Item chevron — hidden by default, shown when itemChevron=true ── */
	:global(.dropdown-menu-container .item-chevron) {
		display: none;
		flex-shrink: 0;
		line-height: 0;
		margin-left: auto;
	}

	:global(.dropdown-menu-container.chevron-items .item-chevron) {
		display: inline-flex;
		align-items: center;
	}

	/* ── Active/selected state ────────────────────────────────── */
	:global(.dropdown-menu-container .dropdown-item--active),
	:global(.dropdown-menu-container .dropdown-item--active .dropdown-item-title) {
		color: var(--white);
		font-weight: 600;
	}

	/* ── Danger variant (e.g. sign out) ───────────────────────── */
	:global(.dropdown-menu-container .dropdown-item--danger) {
		color: color-mix(in srgb, var(--rougeColor) 90%, transparent);
	}
</style>
