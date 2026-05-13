<script lang="js">
/**
 * ZappyError — Unified error/not-found display with Zappy mascot.
 *
 * Actions are fixed: “Go Back” + “Browse Apps”.
 */
import { browser } from '$app/environment';

let { message = 'something went wrong.' } = $props();

function goBack() {
	if (browser) history.back();
}
</script>

<div class="zappy-error-page">
	<div class="zappy-error-layout">
		<div class="zappy-col">
			<div class="zappy-visual">
				<img src="/images/Zappy.svg" alt="Zappy mascot" class="zappy-img" />
				<div class="zappy-shadow" aria-hidden="true"></div>
			</div>
		</div>

		<div class="bubbles-col">
			<div class="error-bubble bubble-message">
				<p>It looks like {message}</p>
			</div>

			<div class="error-bubble bubble-actions">
				<button type="button" class="zappy-error-btn" onclick={goBack}>Go Back</button>
				<a href="/apps" class="zappy-error-btn">Browse Apps</a>
			</div>
		</div>
	</div>
</div>

<style>
	.zappy-error-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		padding: 2rem 1.25rem;
	}

	/*
	 * --zappy-img-h: mascot box height (half is bubbles padding-bottom).
	 * align-items: flex-end — column bottoms line up on mobile + desktop.
	 */
	.zappy-error-layout {
		--zappy-img-h: 100px;
		display: flex;
		flex-direction: row;
		align-items: flex-end;
		flex-wrap: nowrap;
		gap: 0;
	}

	@media (min-width: 768px) {
		.zappy-error-layout {
			--zappy-img-h: 200px;
		}
	}

	.zappy-col {
		flex-shrink: 0;
		width: 100px;
		display: flex;
		flex-direction: column;
	}

	@media (min-width: 768px) {
		.zappy-col {
			width: 200px;
		}
	}

	/* Flow layout: shadow sits clearly under the art, not hugging it */
	.zappy-visual {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}

	.zappy-img {
		width: var(--zappy-img-h);
		height: var(--zappy-img-h);
		object-fit: contain;
		animation: zappy-bounce-mobile 3s ease-in-out infinite;
		position: relative;
		z-index: 1;
	}

	@media (min-width: 768px) {
		.zappy-img {
			animation-name: zappy-bounce-desktop;
		}
	}

	.zappy-shadow {
		flex-shrink: 0;
		margin-top: 14px;
		width: 56px;
		height: 9px;
		background: var(--gray33);
		border-radius: 50%;
		animation: shadow-breathe 3s ease-in-out infinite;
	}

	@media (min-width: 768px) {
		.zappy-shadow {
			margin-top: 20px;
			width: 110px;
			height: 14px;
		}
	}

	@keyframes zappy-bounce-mobile {
		0%,
		100% {
			transform: translateY(0px);
		}
		50% {
			transform: translateY(3px);
		}
	}

	@keyframes zappy-bounce-desktop {
		0%,
		100% {
			transform: translateY(0px);
		}
		50% {
			transform: translateY(10px);
		}
	}

	@keyframes shadow-breathe {
		0%,
		100% {
			transform: scaleX(0.82);
			opacity: 0.45;
		}
		50% {
			transform: scaleX(1.18);
			opacity: 0.72;
		}
	}

	.bubbles-col {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		min-width: 0;
		max-width: 340px;
		padding-bottom: calc(var(--zappy-img-h) / 2);
	}

	@media (min-width: 768px) {
		.bubbles-col {
			max-width: 380px;
		}
	}

	.error-bubble {
		background: var(--gradient-blurple66);
		width: fit-content;
	}

	.bubble-message {
		border-radius: 20px;
		padding: 12px 18px;
		max-width: 100%;
	}

	.bubble-message p {
		margin: 0;
		font-size: 1.0625rem;
		line-height: 1.5;
		color: var(--white);
		font-weight: 500;
	}

	.bubble-actions {
		border-radius: 20px 20px 20px 4px;
		padding: 10px 14px;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}

	.zappy-error-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 34px;
		padding: 0 14px;
		font-size: 1.0625rem;
		font-weight: 500;
		line-height: 1.2;
		color: var(--white66);
		background-color: var(--black16);
		border: none;
		border-radius: 10px;
		cursor: pointer;
		text-decoration: none;
		box-sizing: border-box;
		transition:
			transform 0.2s ease,
			opacity 0.15s ease;
	}

	.zappy-error-btn:hover {
		opacity: 0.92;
		transform: scale(1.02);
	}

	.zappy-error-btn:active {
		transform: scale(0.98);
	}
</style>
