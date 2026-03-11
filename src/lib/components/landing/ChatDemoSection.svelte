<script>
	const jane = {
		name: 'Jane Clement',
		pic: '/images/profiles/jane-clementt.png'
	};
</script>

<section class="border-t border-border/50 py-12 sm:py-16 lg:py-12">
	<div class="container mx-auto px-4 sm:px-6 md:px-8 lg:px-8">
		<div class="layout">
			<!-- Left: headline + description -->
			<div class="left-col">
				<h2 class="headline headline-mobile">Big tech app stores are broken</h2>
				<h2 class="headline headline-desktop">
					Your favorite apps won't be on the <nobr>Play Store</nobr>
				</h2>
				<p class="desc desc-mobile">
					Closed source, malware slipping through, algorithms controlling what you discover, and
					installs you can never actually verify.
				</p>
				<p class="desc desc-desktop">
					Big tech app stores are broken. Closed source, malware slipping through, algorithms
					controlling what you discover, and installs you can never actually verify.
				</p>
			</div>

			<!-- Right: chat -->
			<div class="right-col">
				<!-- Jane -->
				<div class="msg-row">
					<img src={jane.pic} alt={jane.name} class="chat-pic" aria-hidden="true" />
					<div class="bubble bubble-in">
						<span class="chat-name">{jane.name}</span>
						<p class="chat-text">
							Where can I get that app you built for our running group? Couldn't find it on Play
							Store.
						</p>
					</div>
				</div>

				<!-- User: grouped messages -->
				<div class="user-group">
					<div class="msg-row msg-out">
						<div class="bubble bubble-out bubble-out-mid">
							<p class="chat-text">
								They keep refusing the app. Takes ages too, and quite some money. Just to get
								rejected every time.
							</p>
						</div>
					</div>
					<div class="msg-row msg-out">
						<div class="bubble bubble-out bubble-out-last">
							<p class="chat-text">For no reason</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.layout {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;
		align-items: center;
	}
	@media (min-width: 1024px) {
		.layout {
			grid-template-columns: 1fr 1fr;
			gap: 4rem;
		}
	}

	/* ── Left col ── */
	.headline-desktop,
	.desc-desktop {
		display: none;
	}
	@media (min-width: 1024px) {
		.headline-mobile,
		.desc-mobile {
			display: none;
		}
		.headline-desktop,
		.desc-desktop {
			display: block;
		}
	}

	.left-col {
		display: flex;
		flex-direction: column;
		order: 2;
		background: hsl(var(--gray33));
		border-radius: 1.125rem;
		padding: 1.25rem 1.5rem 1.5rem;
	}
	@media (min-width: 1024px) {
		.left-col {
			order: 1;
			background: none;
			border-radius: 0;
			padding: 2rem 2rem 2rem 1.75rem;
		}
	}

	.headline {
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.3;
		margin: 0 0 0.2rem;
		color: hsl(var(--foreground));
	}
	@media (min-width: 1024px) {
		.headline {
			font-size: 2.75rem;
			font-weight: 700;
			line-height: 1.15;
			margin: 0;
			background: var(--gradient-white-blurple);
			-webkit-background-clip: text;
			background-clip: text;
			color: transparent;
			padding-bottom: 0.12em;
		}
	}
	@media (min-width: 1280px) {
		.headline {
			font-size: 3rem;
		}
	}

	.desc {
		font-size: 1rem;
		line-height: 1.55;
		color: hsl(var(--white66));
		margin: 0.2rem 0 0;
	}
	@media (min-width: 1024px) {
		.desc {
			font-size: 1.25rem;
			line-height: 1.75;
			color: hsl(var(--muted-foreground));
			margin-top: 0.5rem;
		}
	}

	/* ── Right col ── */
	.right-col {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		order: 1;
		padding: 0 1rem;
	}
	@media (min-width: 1024px) {
		.right-col {
			order: 2;
			padding: 0;
		}
	}

	.user-group {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.msg-row {
		display: flex;
		align-items: flex-end;
		gap: 12px;
		width: 100%;
	}

	.msg-out {
		justify-content: flex-end;
	}

	.chat-pic {
		width: 46px;
		height: 46px;
		border-radius: 50%;
		flex-shrink: 0;
		object-fit: cover;
		border: 1px solid hsl(var(--white8));
	}
	@media (min-width: 1024px) {
		.chat-pic {
			width: 56px;
			height: 56px;
		}
	}

	.bubble {
		padding: 9px 12px 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	@media (min-width: 1024px) {
		.bubble {
			padding: 10px 16px 10px 16px;
		}
	}

	.bubble-in {
		background-color: hsl(var(--gray33));
		border-radius: 20px 20px 20px 5px;
		max-width: calc(100% - 60px - 3rem);
	}
	@media (min-width: 1024px) {
		.bubble-in {
			max-width: calc(100% - 60px - 7rem);
		}
	}

	.bubble-out {
		background-color: hsl(var(--blurpleColor66));
		max-width: 75%;
		margin-left: auto;
	}
	@media (min-width: 1024px) {
		.bubble-out {
			max-width: 68%;
		}
	}

	.bubble-out-mid {
		border-radius: 20px;
	}

	.bubble-out-last {
		border-radius: 20px 20px 5px 20px;
	}

	.chat-name {
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.2;
		display: block;
		color: #e8a840;
	}
	@media (min-width: 1024px) {
		.chat-name {
			font-size: 1.0625rem;
		}
	}

	.chat-text {
		font-size: 1rem;
		line-height: 1.55;
		margin: 0;
		color: hsl(var(--foreground));
	}
	@media (min-width: 1024px) {
		.chat-text {
			font-size: 1.0625rem;
		}
	}

	.bubble-out .chat-text {
		color: hsl(var(--white));
	}

	.typing-bubble {
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 5px;
		padding: 18px 20px;
		min-height: 52px;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: hsl(var(--white) / 0.7);
		animation: typing-bounce 1.2s ease-in-out infinite;
		flex-shrink: 0;
	}

	.dot:nth-child(2) {
		animation-delay: 0.2s;
	}
	.dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing-bounce {
		0%,
		60%,
		100% {
			transform: translateY(3px);
			opacity: 0.45;
		}
		30% {
			transform: translateY(-3px);
			opacity: 1;
		}
	}
</style>
