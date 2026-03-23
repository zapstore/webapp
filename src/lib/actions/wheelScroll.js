/**
 * Svelte action for horizontal scroll with mouse wheel / trackpad.
 *
 * Maps wheel motion to scrollLeft on the bound element (or scrollRoot).
 * Uses the dominant axis (|deltaY| vs |deltaX|) so trackpads work whether
 * the gesture is mostly vertical or horizontal.
 *
 * Does not call preventDefault when the scroller is already at an edge and
 * the user keeps scrolling “past” that edge — so vertical page scroll can
 * still proceed (avoids trackpad “trapped” feeling).
 *
 * Active when:
 * - Fine pointer (mouse / trackpad), or viewport ≥768px (fallback)
 * - Pointer is inside the bound element
 * - The scroller has horizontal overflow
 *
 * @param {HTMLElement} node
 * @param {{ scrollRoot?: string }} [params]
 */

const VIEWPORT_BREAKPOINT = 768;
const EDGE_EPS = 1;

/**
 * Signed delta in pixel-like units (handles deltaMode).
 * @param {WheelEvent} e
 */
function horizontalWheelDelta(e) {
	const { deltaX, deltaY, deltaMode } = e;
	let dx = deltaX;
	let dy = deltaY;
	if (deltaMode === 1) {
		const line = 16;
		dx *= line;
		dy *= line;
	} else if (deltaMode === 2) {
		const page = typeof window !== 'undefined' ? window.innerHeight : 600;
		dx *= page;
		dy *= page;
	}
	if (dx === 0 && dy === 0) return 0;
	// Trackpads often send both; use whichever axis the gesture emphasizes.
	return Math.abs(dy) >= Math.abs(dx) ? dy : dx;
}

function shouldActivate() {
	if (typeof window === 'undefined') return false;
	try {
		if (window.matchMedia('(pointer: fine)').matches) return true;
	} catch {
		/* ignore */
	}
	return window.innerWidth >= VIEWPORT_BREAKPOINT;
}

/**
 * @param {HTMLElement} node
 * @param {{ scrollRoot?: string } | undefined} params
 */
export function wheelScroll(node, params = {}) {
	const scrollRoot =
		params && typeof params === 'object' && typeof params.scrollRoot === 'string'
			? params.scrollRoot
			: null;

	let isHovering = false;

	function onPointerEnter() {
		isHovering = true;
	}

	function onPointerLeave() {
		isHovering = false;
	}

	/** @returns {HTMLElement | null} */
	function getScroller() {
		if (scrollRoot) {
			const el = node.querySelector(scrollRoot);
			return el instanceof HTMLElement ? el : null;
		}
		return node;
	}

	/** @param {WheelEvent} e */
	function onWheel(e) {
		if (!shouldActivate()) return;
		if (!isHovering) return;

		const scroller = getScroller();
		if (!scroller) return;

		const hasHorizontalOverflow = scroller.scrollWidth > scroller.clientWidth + EDGE_EPS;
		if (!hasHorizontalOverflow) return;

		const delta = horizontalWheelDelta(e);
		if (delta === 0) return;

		const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
		const left = scroller.scrollLeft;
		const atStart = left <= EDGE_EPS;
		const atEnd = left >= maxScroll - EDGE_EPS;

		// Let the event propagate for page scroll when we can't move further horizontally.
		if (atStart && delta < 0) return;
		if (atEnd && delta > 0) return;

		e.preventDefault();

		const next = Math.max(0, Math.min(maxScroll, left + delta));
		scroller.scrollLeft = next;
	}

	node.addEventListener('pointerenter', onPointerEnter);
	node.addEventListener('pointerleave', onPointerLeave);
	node.addEventListener('wheel', onWheel, { passive: false });

	return {
		destroy() {
			node.removeEventListener('pointerenter', onPointerEnter);
			node.removeEventListener('pointerleave', onPointerLeave);
			node.removeEventListener('wheel', onWheel);
		}
	};
}
