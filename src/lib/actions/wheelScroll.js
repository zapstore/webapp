/**
 * Svelte action for horizontal scroll with mouse wheel.
 *
 * When the user's cursor is inside the bound element (or a delegated scroll root)
 * and they use the mouse wheel / trackpad, it scrolls horizontally instead of vertically.
 *
 * IMPORTANT: This action ALWAYS prevents vertical page scrolling when the
 * cursor is inside the horizontal scroll zone. This is intentional for
 * infinite scroll scenarios where more content may be loading at the edges.
 *
 * Only activates when:
 * - Screen width is >= 768px (desktop only)
 * - The scroll starts within the element (cursor is inside)
 * - The scroller has horizontal overflow (can actually scroll)
 *
 * @param {HTMLElement} node - Hover hit area (or the scroll element if no scrollRoot)
 * @param {{ scrollRoot?: string }} [params] - Optional CSS selector (descendant of node) for the element that receives scrollLeft
 *
 * Usage:
 * <div use:wheelScroll class="horizontal-scroll">...</div>
 * <div use:wheelScroll={{ scrollRoot: '.inner-scroll' }} class="row">...</div>
 */

const DESKTOP_BREAKPOINT = 768;

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

  function onMouseEnter() {
    isHovering = true;
  }

  function onMouseLeave() {
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
    if (window.innerWidth < DESKTOP_BREAKPOINT) return;

    if (!isHovering) return;

    const scroller = getScroller();
    if (!scroller) return;

    const hasHorizontalOverflow = scroller.scrollWidth > scroller.clientWidth;
    if (!hasHorizontalOverflow) return;

    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (delta === 0) return;

    e.preventDefault();

    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    const newScrollLeft = Math.max(0, Math.min(maxScroll, scroller.scrollLeft + delta));
    scroller.scrollLeft = newScrollLeft;
  }

  node.addEventListener('mouseenter', onMouseEnter);
  node.addEventListener('mouseleave', onMouseLeave);
  node.addEventListener('wheel', onWheel, { passive: false });

  return {
    destroy() {
      node.removeEventListener('mouseenter', onMouseEnter);
      node.removeEventListener('mouseleave', onMouseLeave);
      node.removeEventListener('wheel', onWheel);
    }
  };
}
