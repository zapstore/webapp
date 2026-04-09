<script lang="js">
/**
 * CodeBlock — syntax-highlighted code with copy button.
 * Pass either `code` (plain text) or `html` (pre-rendered syntax-highlighted HTML).
 */
import { Copy, Check } from '$lib/components/icons';

let { code = '', html = '', language = '', background = 'gray33' } = $props();

const blockBgClass = $derived(background === 'black33' ? 'code-block-black33' : 'code-block-gray33');

let copied = $state(false);

async function handleCopy() {
	try {
		await navigator.clipboard.writeText(code || html.replace(/<[^>]+>/g, ''));
		copied = true;
		setTimeout(() => { copied = false; }, 1500);
	} catch {}
}
</script>

<div class="code-block {blockBgClass}">
	<button type="button" class="code-copy-btn" onclick={handleCopy} aria-label="Copy code">
		{#if copied}
			<span class="check-icon">
				<Check variant="outline" size={14} strokeWidth={2.8} color="hsl(var(--blurpleLightColor))" />
			</span>
		{:else}
			<Copy variant="outline" size={16} color="hsl(var(--white66))" />
		{/if}
	</button>
	{#if language}
		<span class="eyebrow-label code-language">{language}</span>
	{/if}
	<div class="code-scroll">
		{#if html}
			<pre><code>{@html html}</code></pre>
		{:else}
			<pre><code>{code}</code></pre>
		{/if}
	</div>
</div>

<style>
	.code-block {
		position: relative;
		border-radius: 16px;
		border: 0.33px solid hsl(var(--white16));
		padding: 6px 10px;
	}

	.code-block-gray33 {
		background-color: hsl(var(--gray33));
	}

	.code-block-black33 {
		background-color: hsl(var(--black33));
	}

	.code-copy-btn {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: hsl(var(--white8));
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.code-copy-btn:hover { transform: scale(1.01); }
	.code-copy-btn:active { transform: scale(0.97); }

	.code-copy-btn .check-icon {
		display: flex;
		animation: popIn 0.3s ease-out;
	}

	@keyframes popIn {
		0% { transform: scale(0); }
		50% { transform: scale(1.2); }
		100% { transform: scale(1); }
	}

	.code-language {
		font-family: var(--font-sans);
		color: hsl(var(--white33));
		display: block;
		margin-bottom: 2px;
	}

	.code-scroll {
		overflow-x: auto;
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--white16)) transparent;
	}

	.code-scroll pre {
		margin: 0;
	}

	.code-scroll code {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-weight: 400;
		line-height: 1.5;
		letter-spacing: 0.15px;
		color: hsl(var(--foreground));
		white-space: pre;
	}
</style>
