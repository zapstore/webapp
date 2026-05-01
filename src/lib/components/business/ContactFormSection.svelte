<script>
	import '$lib/styles/landing-display.css';
	import { Send } from '$lib/components/icons';

	const FORMSPREE_FORM_ID = 'mqearype';
	const FORMSPREE_URL = `https://formspree.io/f/${FORMSPREE_FORM_ID}`;

	const ZAPSTORE_NPUB = 'npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8';

	const budgetOptions = [
		{ value: '', label: 'Select a range…' },
		{ value: '<25k', label: 'Less than $25k' },
		{ value: '25k-100k', label: '$25k – $100k' },
		{ value: '100k-500k', label: '$100k – $500k' },
		{ value: '500k+', label: '$500k+' },
		{ value: 'unsure', label: 'Not sure yet' }
	];

	let name = $state('');
	let company = $state('');
	let email = $state('');
	let role = $state('');
	let website = $state('');
	let message = $state('');
	let budget = $state('');
	let referral = $state('');
	/** @type {'email' | 'signal'} */
	let channel = $state('email');
	let channelHandle = $state('');
	/** Formspree's native honeypot field — submissions with `_gotcha` filled are silently dropped. */
	let _gotcha = $state('');

	/** @type {'idle' | 'submitting' | 'success' | 'error'} */
	let status = $state('idle');
	let errorMessage = $state('');

	/** @param {SubmitEvent} e */
	async function handleSubmit(e) {
		e.preventDefault();
		if (status === 'submitting') return;
		status = 'submitting';
		errorMessage = '';

		// Formspree-specific payload:
		//  - `_replyto` is mapped from the work email so replies from the inbox go straight to the lead.
		//  - `_subject` makes the inbox triage line scannable.
		//  - `_gotcha` is Formspree's built-in honeypot; non-empty submissions are silently dropped.
		const payload = {
			name,
			company,
			email,
			role,
			website,
			message,
			budget,
			referral,
			channel,
			channelHandle,
			_replyto: email,
			_subject: `[Business] ${company} — ${name}`,
			_gotcha
		};

		try {
			const res = await fetch(FORMSPREE_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				const firstError = Array.isArray(body?.errors) ? body.errors[0]?.message : null;
				throw new Error(firstError ?? 'Submission failed. Please try again.');
			}
			status = 'success';
		} catch (err) {
			status = 'error';
			errorMessage = err instanceof Error ? err.message : 'Something went wrong';
		}
	}
</script>

<section id="contact" class="border-t border-border/50 py-12 sm:py-16 lg:py-20">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="max-w-2xl mx-auto">
			<div class="text-center mb-8 sm:mb-10">
				<h2 class="display-section mb-3 sm:mb-4">
					<span
						style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
						>Tell us about your situation</span
					>
				</h2>
			</div>

			{#if status === 'success'}
				<div class="panel panel-p-24 success-panel">
					<h3 class="success-title">Thanks — we'll be in touch</h3>
					<p class="success-desc">
						We aim to respond within two business days. If you'd rather start a conversation
						elsewhere in the meantime, our team is reachable on Nostr.
					</p>
					<div class="success-channels">
						<a
							class="btn-secondary"
							href="https://npub.world/{ZAPSTORE_NPUB}"
							target="_blank"
							rel="noopener noreferrer">Zapstore on Nostr</a
						>
					</div>
				</div>
			{:else}
				<form class="panel panel-p-24 contact-form" onsubmit={handleSubmit}>
					<!-- Formspree honeypot: bots fill visible-looking inputs; real users never see this. -->
					<div class="honeypot" aria-hidden="true">
						<label for="business-gotcha">Leave this field blank</label>
						<input
							id="business-gotcha"
							type="text"
							name="_gotcha"
							bind:value={_gotcha}
							tabindex="-1"
							autocomplete="off"
						/>
					</div>

					<div class="form-row form-row-2">
						<div class="form-field">
							<label for="business-name" class="form-label">Name</label>
							<input
								id="business-name"
								type="text"
								class="form-input"
								bind:value={name}
								required
								autocomplete="name"
							/>
						</div>
						<div class="form-field">
							<label for="business-company" class="form-label">Company / organization</label>
							<input
								id="business-company"
								type="text"
								class="form-input"
								bind:value={company}
								required
								autocomplete="organization"
							/>
						</div>
					</div>

					<div class="form-row form-row-2">
						<div class="form-field">
							<label for="business-email" class="form-label">Work email</label>
							<input
								id="business-email"
								type="email"
								class="form-input"
								bind:value={email}
								required
								autocomplete="email"
							/>
						</div>
						<div class="form-field">
							<label for="business-role" class="form-label">
								Role / title <span class="form-optional">(optional)</span>
							</label>
							<input
								id="business-role"
								type="text"
								class="form-input"
								bind:value={role}
								autocomplete="organization-title"
							/>
						</div>
					</div>

					<div class="form-field">
						<label for="business-website" class="form-label">
							Company website <span class="form-optional">(optional)</span>
						</label>
						<input
							id="business-website"
							type="url"
							class="form-input"
							placeholder="https://"
							bind:value={website}
							autocomplete="url"
						/>
					</div>

					<div class="form-field">
						<label for="business-message" class="form-label">
							Who are your users, and what do you want them to be able to install?
						</label>
						<textarea
							id="business-message"
							class="form-input form-textarea"
							rows="5"
							bind:value={message}
							required
						></textarea>
					</div>

					<div class="form-row form-row-2">
						<div class="form-field">
							<label for="business-budget" class="form-label">Approximate budget</label>
							<select
								id="business-budget"
								class="form-input form-select"
								bind:value={budget}
								required
							>
								{#each budgetOptions as opt (opt.value)}
									<option value={opt.value} disabled={opt.value === ''}>{opt.label}</option>
								{/each}
							</select>
						</div>
						<div class="form-field">
							<label for="business-referral" class="form-label">
								How did you hear about us? <span class="form-optional">(optional)</span>
							</label>
							<input id="business-referral" type="text" class="form-input" bind:value={referral} />
						</div>
					</div>

					<fieldset class="form-fieldset">
						<legend class="form-label">Preferred contact channel</legend>
						<div class="radio-group">
							<label class="radio-option">
								<input type="radio" name="channel" value="email" bind:group={channel} />
								<span>Email</span>
							</label>
							<label class="radio-option">
								<input type="radio" name="channel" value="signal" bind:group={channel} />
								<span>Signal</span>
							</label>
						</div>
					</fieldset>

					{#if channel === 'signal'}
						<div class="form-field">
							<label for="business-channel-handle" class="form-label">
								Signal username or phone
							</label>
							<input
								id="business-channel-handle"
								type="text"
								class="form-input"
								placeholder="e.g. @yourname or +1 415 555 0123"
								bind:value={channelHandle}
								required
							/>
						</div>
					{/if}

					{#if status === 'error'}
						<p class="form-error" role="alert">{errorMessage}</p>
					{/if}

					<div class="form-submit-row">
						<button type="submit" class="btn-primary-large" disabled={status === 'submitting'}>
							{#if status === 'submitting'}
								Sending…
							{:else}
								<span class="submit-label">Send</span>
								<Send variant="outline" color="var(--whiteEnforced)" size={16} />
							{/if}
						</button>
					</div>

					<p class="form-fineprint">
						No drip emails, no follow-up sequences. We'll respond once with a real human.
					</p>
				</form>
			{/if}
		</div>
	</div>
</section>

<style>
	.contact-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.honeypot {
		position: absolute;
		left: -10000px;
		top: auto;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}

	.form-row-2 {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.25rem;
	}

	@media (min-width: 640px) {
		.form-row-2 {
			grid-template-columns: 1fr 1fr;
		}
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}

	.form-label {
		display: block;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--white);
		padding-left: 0;
	}

	.form-optional {
		color: var(--white33);
		font-weight: 400;
	}

	.form-input {
		width: 100%;
		height: 42px;
		padding: 0 14px;
		background-color: var(--black33);
		border: 0.33px solid var(--white16);
		border-radius: 14px;
		color: var(--white);
		font-family: 'Inter', sans-serif;
		font-size: 1rem;
		line-height: 1.5;
		outline: none;
		transition: border-color 0.15s ease;
		box-sizing: border-box;
	}

	@media (max-width: 767px) {
		.form-input {
			height: 38px;
		}
	}

	.form-input:focus {
		border-color: var(--white33);
	}

	.form-input::placeholder {
		color: var(--white33);
	}

	.form-textarea {
		height: auto;
		min-height: 120px;
		padding: 12px 14px;
		resize: vertical;
		line-height: 1.55;
	}

	/* Custom select chevron — keep cosmetic, no browser default arrow */
	.form-select {
		appearance: none;
		-webkit-appearance: none;
		padding-right: 36px;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23ffffff' stroke-opacity='0.5' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 14px center;
		cursor: pointer;
	}

	.form-select option {
		background: hsl(241 15% 18%);
		color: var(--white);
	}

	.form-fieldset {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.radio-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.radio-option {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 8px 14px;
		background-color: var(--gray66);
		border-radius: 9999px;
		cursor: pointer;
		font-size: 0.9375rem;
		color: var(--white66);
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}

	.radio-option:has(input:checked) {
		background-image: var(--gradient-blurple66);
		background-color: transparent;
		color: var(--whiteEnforced);
	}

	.radio-option input {
		appearance: none;
		-webkit-appearance: none;
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.form-error {
		margin: 0;
		padding: 10px 14px;
		background-color: var(--white8);
		border-radius: 12px;
		color: var(--white);
		font-size: 0.9375rem;
	}

	.form-submit-row {
		display: flex;
		justify-content: center;
		margin-top: 0.25rem;
	}

	.submit-label {
		margin-right: 8px;
	}

	.form-fineprint {
		margin: 0;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--white33);
	}

	.success-panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.success-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--white);
		margin: 0;
	}

	.success-desc {
		margin: 0;
		font-size: 1rem;
		line-height: 1.55;
		color: var(--white66);
	}

	.success-channels {
		display: flex;
		flex-wrap: wrap;
		gap: 0.625rem;
		margin-top: 0.5rem;
	}
</style>
