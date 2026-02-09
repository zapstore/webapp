<script lang="ts">
  /**
   * OnboardingBuildingModal - Shown after SpinKeyModal in the Get started flow
   * to inform users that the full onboarding flow is still being built.
   */
  import Modal from "$lib/components/common/Modal.svelte";

  interface Props {
    open?: boolean;
    /** z-index for the modal (use 56+ when shown after SpinKeyModal) */
    zIndex?: number;
  }

  let { open = $bindable(false), zIndex = 56 }: Props = $props();
</script>

<Modal bind:open ariaLabel="Onboarding in progress" {zIndex}>
  <div class="modal-content">
    <h2 class="title">We're still building</h2>
    <p class="description">
      We're still building the full onboarding flow right now. Thanks for your patience — we're excited to have you on Zapstore.
    </p>
    <button type="button" class="btn-primary-large w-full" onclick={() => (open = false)}>
      Got it
    </button>
  </div>
</Modal>

<style>
  .modal-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 16px 24px;
  }

  @media (min-width: 768px) {
    .modal-content {
      padding: 24px 24px 28px;
    }
  }

  .title {
    font-size: 1.5rem;
    font-weight: 650;
    color: hsl(var(--white));
    margin: 0 0 12px;
    text-align: center;
  }

  @media (min-width: 768px) {
    .title {
      font-size: 1.75rem;
    }
  }

  .description {
    font-size: 1rem;
    color: hsl(var(--white66));
    margin: 0 0 24px;
    text-align: center;
    line-height: 1.5;
    max-width: 340px;
  }
</style>
