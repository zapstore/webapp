/** @typedef {{ handler: () => void, priority: number, id: symbol }} CommentComposeEntry */

/** @type {CommentComposeEntry[]} */
let commentComposeEntries = [];

/**
 * Register a handler for global comment compose shortcuts (`c`, ⌘/Ctrl+Enter).
 * Higher priority wins when multiple handlers are active (e.g. thread modal over feed).
 *
 * @param {() => void} handler
 * @param {{ priority?: number }} [options]
 * @returns {() => void}
 */
export function registerCommentCompose(handler, options = {}) {
	const priority = options.priority ?? 0;
	const id = Symbol('comment-compose');
	const entry = { handler, priority, id };
	commentComposeEntries = [...commentComposeEntries, entry].sort(
		(a, b) => b.priority - a.priority
	);
	return () => {
		commentComposeEntries = commentComposeEntries.filter((e) => e.id !== id);
	};
}

/** @returns {boolean} Whether a handler ran. */
export function tryOpenCommentCompose() {
	const entry = commentComposeEntries[0];
	if (!entry) return false;
	entry.handler();
	return true;
}

/** @param {EventTarget | null} target */
export function isTypingTarget(target) {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	if (target.isContentEditable) return true;
	if (target.closest('.ProseMirror, .short-text-editor-content, [contenteditable="true"]')) {
		return true;
	}
	return false;
}

/** @param {KeyboardEvent} e */
export function isModEnter(e) {
	return (e.metaKey || e.ctrlKey) && e.key === 'Enter';
}

/**
 * Plain letter key (no modifiers). Used for `c` to compose.
 * @param {KeyboardEvent} e
 * @param {string} letter
 */
export function isPlainLetter(e, letter) {
	return (
		e.key.length === 1 &&
		e.key.toLowerCase() === letter.toLowerCase() &&
		!e.metaKey &&
		!e.ctrlKey &&
		!e.altKey
	);
}
