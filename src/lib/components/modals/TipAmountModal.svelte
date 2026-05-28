<script lang="js">
/**
 * TipAmountModal — amount-only tip picker (nested over comment composers).
 */
import Modal from '$lib/components/common/Modal.svelte';
import ZapSlider from '$lib/components/modals/ZapSlider.svelte';
import { Zap } from '$lib/components/icons';

/** @param {string} contentType */
function tipTargetNoun(contentType) {
	switch (contentType) {
		case 'app':
			return 'app';
		case 'stack':
			return 'stack';
		case 'forum':
			return 'forum post';
		case 'comment':
			return 'comment';
		default:
			return 'content';
	}
}

let {
	isOpen = $bindable(false),
	target = null,
	publisherName = '',
	contentType = 'app',
	otherZaps = [],
	initialAmount = 1000,
	presetAmount = null,
	nestedModal = false,
	lockBodyScroll = true,
	scopedInPanel = false,
	zIndex = 50,
	onconfirm,
	onclose
} = $props();

let sliderComponent = $state(null);
let zapValue = $state(1000);

const targetProfile = $derived(
	target
		? { pictureUrl: target.pictureUrl, name: target.name, pubkey: target.pubkey }
		: null
);

const tipDescription = $derived.by(() => {
	const profileName =
		String(publisherName ?? target?.name ?? '')
			.trim() || 'Creator';
	return `For ${profileName}'s ${tipTargetNoun(contentType)}`;
});

let _prevIsOpen = $state(false);
$effect(() => {
	if (!_prevIsOpen && isOpen) {
		const preset = presetAmount != null ? Number(presetAmount) : NaN;
		const initial = Number.isFinite(preset) && preset >= 1 ? preset : initialAmount;
		zapValue = Math.round(Math.max(1, initial));
	}
	_prevIsOpen = isOpen;
});

function close() {
	isOpen = false;
	onclose?.();
}

function handleValueChanged(event) {
	zapValue = event.value;
}

function confirm() {
	const amount = sliderComponent?.getValue?.() ?? Math.round(zapValue);
	if (amount < 1) return;
	onconfirm?.({ amount: Math.round(amount) });
	close();
}

const confirmAmountLabel = $derived(Math.round(zapValue).toLocaleString());
const confirmAriaLabel = $derived(`Add a ${confirmAmountLabel} Tip`);
</script>

<Modal
	bind:open={isOpen}
	ariaLabel="Add a tip"
	title="Add a Tip"
	description={tipDescription}
	wide={true}
	align="bottom"
	noBackdrop={nestedModal}
	{zIndex}
	{lockBodyScroll}
	{scopedInPanel}
	class="tip-amount-modal"
>
	<div class="tip-amount-modal-content">
		<ZapSlider
			bind:this={sliderComponent}
			profile={targetProfile}
			initialValue={zapValue}
			{otherZaps}
			amountOnly={true}
			onvalueChanged={handleValueChanged}
		/>
		<button
			type="button"
			class="btn-primary-large w-full confirm-btn"
			aria-label={confirmAriaLabel}
			onclick={confirm}
		>
			<span class="confirm-btn-prefix">Add a</span>
			<span class="confirm-btn-amount">
				<Zap variant="fill" size={14} color="var(--whiteEnforced)" />
				<span>{confirmAmountLabel} Tip</span>
			</span>
		</button>
	</div>
</Modal>

<style>
	.tip-amount-modal-content {
		padding: 0 16px 16px;
	}

	@media (min-width: 768px) {
		.tip-amount-modal-content {
			padding: 0 12px 12px;
		}
	}

	.confirm-btn {
		margin-top: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0;
	}

	.confirm-btn-prefix {
		margin-right: 7px;
	}

	.confirm-btn-amount {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
</style>
