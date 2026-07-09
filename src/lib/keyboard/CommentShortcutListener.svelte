<script lang="js">
	import { browser } from '$app/environment';
	import { getIsSignedIn } from '$lib/stores/auth.svelte.js';
	import {
		tryOpenCommentCompose,
		isTypingTarget,
		isModEnter,
		isPlainLetter
	} from '$lib/keyboard/shortcuts.js';

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if (!browser || !getIsSignedIn()) return;
		if (e.defaultPrevented) return;
		if (isTypingTarget(e.target)) return;

		if (isPlainLetter(e, 'c')) {
			if (tryOpenCommentCompose()) e.preventDefault();
			return;
		}

		if (isModEnter(e)) {
			if (tryOpenCommentCompose()) e.preventDefault();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />
