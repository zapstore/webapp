/**
 * Forwards vertical wheel/trackpad scroll to a designated main scroll pane when the
 * pointer is over non-scrollable chrome (e.g. bordered gutters, side margins).
 *
 * Scrollable regions inside the root (including `[data-main-scroll]`) keep native
 * behavior. `[data-sidebar-scroll]` regions never chain scroll to main content.
 * `[data-chrome-scroll]` horizontal strips (e.g. forum category labels) defer to
 * `wheelScroll` until their horizontal scroll reaches an edge.
 *
 * @param {HTMLElement} node — Root shell (e.g. `.app-detail-page`, `.dashboard-outer`)
 * @param {{ scrollSelector?: string }} [params]
 */
const EDGE_EPS = 1;

/** @param {WheelEvent} e */
function normalizeDeltaY(e) {
	let dy = e.deltaY;
	if (e.deltaMode === 1) dy *= 16;
	else if (e.deltaMode === 2) dy *= typeof window !== 'undefined' ? window.innerHeight : 600;
	return dy;
}

/** @param {WheelEvent} e */
function normalizeDeltaX(e) {
	let dx = e.deltaX;
	if (e.deltaMode === 1) dx *= 16;
	else if (e.deltaMode === 2) dx *= typeof window !== 'undefined' ? window.innerWidth : 800;
	return dx;
}

/** @param {HTMLElement} el */
function overflowYScrollable(el) {
	const oy = getComputedStyle(el).overflowY;
	return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
}

/** @param {HTMLElement} el */
function overflowXScrollable(el) {
	const ox = getComputedStyle(el).overflowX;
	return ox === 'auto' || ox === 'scroll' || ox === 'overlay';
}

/** @param {HTMLElement} el @param {number} delta */
function canScrollY(el, delta) {
	if (!overflowYScrollable(el)) return false;
	if (delta < 0) return el.scrollTop > EDGE_EPS;
	if (delta > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_EPS;
	return false;
}

/** @param {HTMLElement} el @param {number} delta */
function canScrollX(el, delta) {
	if (!overflowXScrollable(el)) return false;
	if (delta < 0) return el.scrollLeft > EDGE_EPS;
	if (delta > 0) return el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_EPS;
	return false;
}

/**
 * Matches `wheelScroll` edge behavior so passthrough does not steal wheel events
 * that the horizontal chrome scroller will consume.
 * @param {HTMLElement} el @param {number} dy @param {number} dx
 */
function chromeScrollWouldConsume(el, dy, dx) {
	if (!overflowXScrollable(el)) return false;
	if (el.scrollWidth <= el.clientWidth + EDGE_EPS) return false;
	const horizontalDelta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
	if (horizontalDelta === 0) return false;
	const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
	const left = el.scrollLeft;
	const atStart = left <= EDGE_EPS;
	const atEnd = left >= maxScroll - EDGE_EPS;
	if (atStart && horizontalDelta < 0) return false;
	if (atEnd && horizontalDelta > 0) return false;
	return true;
}

/**
 * @param {HTMLElement} node
 * @param {{ scrollSelector?: string }} params
 */
export function wheelScrollPassthrough(node, params = {}) {
	const scrollSelector =
		params && typeof params === 'object' && typeof params.scrollSelector === 'string'
			? params.scrollSelector
			: '[data-main-scroll]';

	/** @param {HTMLElement} el */
	function isVisibleScrollTarget(el) {
		const style = getComputedStyle(el);
		if (style.display === 'none' || style.visibility === 'hidden') return false;
		const shellPanel = el.closest('.community-shell-panel');
		if (shellPanel instanceof HTMLElement && !shellPanel.classList.contains('community-shell-panel--active')) {
			return false;
		}
		if (el.closest('.community-route-outlet--hidden')) return false;
		return true;
	}

	/** @returns {HTMLElement | null} */
	function getMainScroll() {
		const preferred = node.querySelector(
			'.community-shell-panel--active [data-main-scroll], ' +
				'.community-route-outlet:not(.community-route-outlet--hidden) [data-main-scroll], ' +
				'.content [data-main-scroll]'
		);
		if (preferred instanceof HTMLElement && isVisibleScrollTarget(preferred)) {
			return preferred;
		}

		const candidates = node.querySelectorAll(scrollSelector);
		for (const el of candidates) {
			if (el instanceof HTMLElement && isVisibleScrollTarget(el)) return el;
		}
		return null;
	}

	/** @param {WheelEvent} e */
	function onWheel(e) {
		const dy = normalizeDeltaY(e);
		const dx = normalizeDeltaX(e);
		if (dy === 0 && dx === 0) return;

		const target = e.target;
		if (!(target instanceof Element)) return;

		if (target.closest('textarea, select[size], [contenteditable="true"]')) return;

		const sidebarEl = target.closest('[data-sidebar-scroll]');
		if (sidebarEl && node.contains(sidebarEl)) {
			if (canScrollY(sidebarEl, dy)) return;
			if (overflowYScrollable(sidebarEl)) {
				e.preventDefault();
				return;
			}
		}

		const chromeScrollEl = target.closest('[data-chrome-scroll]');
		if (chromeScrollEl instanceof HTMLElement && node.contains(chromeScrollEl)) {
			if (chromeScrollWouldConsume(chromeScrollEl, dy, dx)) return;
		}

		if (Math.abs(dx) > Math.abs(dy)) {
			let el = target;
			while (el && el !== node) {
				if (canScrollX(el, dx)) return;
				el = el.parentElement;
			}
		}

		let el = target;
		while (el && el !== node) {
			if (canScrollY(el, dy)) return;
			el = el.parentElement;
		}

		const mainScroll = getMainScroll();
		if (!mainScroll || dy === 0) return;

		// Already on the main scroller (or its descendants at a scroll boundary).
		if (mainScroll.contains(target) && canScrollY(mainScroll, dy)) return;

		e.preventDefault();
		const maxTop = Math.max(0, mainScroll.scrollHeight - mainScroll.clientHeight);
		mainScroll.scrollTop = Math.max(0, Math.min(maxTop, mainScroll.scrollTop + dy));
	}

	node.addEventListener('wheel', onWheel, { passive: false, capture: true });

	return {
		destroy() {
			node.removeEventListener('wheel', onWheel, { capture: true });
		}
	};
}
