<script lang="ts">
  /**
   * ZapSliderModal - Full zap flow: slider amount + comment, then invoice QR, then success.
   */
  import { onDestroy } from "svelte";
  import { Loader2, AlertCircle, CheckCircle, Copy, Check } from "lucide-svelte";
  import { createZap, subscribeToZapReceipt } from "$lib/nostr";
  import { getIsSignedIn, getIsConnecting, connect } from "$lib/stores/auth.svelte";
  import Modal from "$lib/components/common/Modal.svelte";
  import ZapSlider from "./ZapSlider.svelte";
  import Zap from "$lib/components/icons/Zap.svelte";

  type ProfileHit = { pubkey: string; name?: string; displayName?: string; picture?: string };
  type EmojiHit = { shortcode: string; url: string; source: string };

  interface ZapTarget {
    name?: string;
    pubkey?: string;
    dTag?: string;
    id?: string;
    pictureUrl?: string;
  }

  interface OtherZap {
    amount: number;
    profile?: { pictureUrl?: string; name?: string; pubkey?: string };
  }

  interface Props {
    target?: ZapTarget | null;
    publisherName?: string;
    otherZaps?: OtherZap[];
    isOpen?: boolean;
    searchProfiles?: (query: string) => Promise<ProfileHit[]>;
    searchEmojis?: (query: string) => Promise<EmojiHit[]>;
    onclose?: (event: { success: boolean }) => void;
    onzapReceived?: (event: { zapReceipt: unknown }) => void;
  }

  let {
    target = null,
    publisherName = "",
    otherZaps = [],
    isOpen = $bindable(false),
    searchProfiles = async () => [],
    searchEmojis = async () => [],
    onclose,
    onzapReceived,
  }: Props = $props();

  let sliderComponent = $state<{ getValue: () => number; getMessage: () => string } | null>(null);
  let zapValue = $state(100);
  let message = $state("");
  let loading = $state(false);
  let error = $state("");
  let invoice = $state<string | null>(null);
  let zapRequest = $state<{ id: string } | null>(null);
  let copied = $state(false);
  let step = $state<"slider" | "invoice" | "success">("slider");
  let unsubscribe: (() => void) | null = null;
  let waitingForReceipt = $state(false);
  let showManualClose = $state(false);
  let receiptTimeout: ReturnType<typeof setTimeout> | null = null;

  const isConnected = $derived(getIsSignedIn());
  const isConnecting = $derived(getIsConnecting());

  const qrCodeUrl = $derived(
    invoice
      ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=ffffff&color=000000&data=${encodeURIComponent("lightning:" + invoice.toUpperCase())}`
      : null
  );

  const targetProfile = $derived(
    target
      ? { pictureUrl: target.pictureUrl, name: target.name, pubkey: target.pubkey }
      : null
  );

  function cleanup() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (receiptTimeout) {
      clearTimeout(receiptTimeout);
      receiptTimeout = null;
    }
  }

  function close(zapSuccessful = false) {
    cleanup();
    zapValue = 100;
    message = "";
    loading = false;
    error = "";
    invoice = null;
    zapRequest = null;
    step = "slider";
    waitingForReceipt = false;
    showManualClose = false;
    isOpen = false;
    onclose?.({ success: zapSuccessful });
  }

  function handleValueChanged(e: { value: number }) {
    zapValue = e.value;
  }

  function handleSendZap(e: {
    amount: number;
    message: string;
    emojiTags: { shortcode: string; url: string }[];
    mentions: string[];
  }) {
    zapValue = e.amount;
    message = e.message;
    handleZap();
  }

  async function handleSignIn() {
    try {
      await connect();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to sign in";
    }
  }

  async function handleZap() {
    if (loading || zapValue < 1) return;
    loading = true;
    error = "";
    try {
      const result = await createZap(target, Math.round(zapValue), message);
      invoice = result.invoice;
      zapRequest = result.zapRequest;
      step = "invoice";
      waitingForReceipt = true;
      startListeningForReceipt();
    } catch (err) {
      console.error("Zap failed:", err);
      error = err instanceof Error ? err.message : "Failed to create zap";
    } finally {
      loading = false;
    }
  }

  function startListeningForReceipt() {
    if (!zapRequest || !target?.pubkey) return;
    const targetAddress = target.dTag ? `32267:${target.pubkey}:${target.dTag}` : null;
    unsubscribe = subscribeToZapReceipt(
      target.pubkey,
      zapRequest.id,
      (zapReceipt) => {
        if (receiptTimeout) {
          clearTimeout(receiptTimeout);
          receiptTimeout = null;
        }
        waitingForReceipt = false;
        step = "success";
        onzapReceived?.({ zapReceipt });
        setTimeout(() => close(true), 2000);
      },
      { invoice, appAddress: targetAddress, appEventId: target.id }
    );
    receiptTimeout = setTimeout(() => {
      showManualClose = true;
    }, 30000);
  }

  function handleManualDone() {
    close(true);
  }

  async function copyInvoice() {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  function goBack() {
    cleanup();
    step = "slider";
    invoice = null;
    zapRequest = null;
    error = "";
    waitingForReceipt = false;
    showManualClose = false;
  }

  function formatAmount(val: number): string {
    return Math.round(val).toLocaleString("en-US");
  }

  onDestroy(() => cleanup());

  $effect(() => {
    if (!isOpen) cleanup();
  });
</script>

<Modal
  bind:open={isOpen}
  ariaLabel="Zap {target?.name ?? 'Content'}"
  wide={true}
  align="bottom"
>
  <div class="zap-modal-content">
    {#if error}
      <div class="error-message">
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    {/if}

    {#if !isConnected}
      <div class="sign-in-prompt">
        <div class="sign-in-icon">
          <Zap variant="fill" size={32} color="hsl(var(--goldColor))" />
        </div>
        <p class="sign-in-text">Sign in with Nostr to send zaps</p>
        <button
          type="button"
          class="btn-primary-large"
          onclick={handleSignIn}
          disabled={isConnecting}
        >
          {#if isConnecting}
            <Loader2 size={18} class="animate-spin" />
            <span>Connecting...</span>
          {:else}
            <span>Sign in with Nostr</span>
          {/if}
        </button>
      </div>
    {:else if step === "slider"}
      <div class="pt-4">
        <h2 class="text-display text-4xl text-foreground text-center mb-2">Zap</h2>
        <p class="text-base text-muted-foreground text-center mb-4">
          {publisherName || "Creator"} for publishing {target?.name ?? "this content"}
        </p>
      </div>
      <div class="slider-wrapper">
        <ZapSlider
          bind:this={sliderComponent}
          profile={targetProfile}
          initialValue={zapValue}
          {otherZaps}
          bind:message
          {searchProfiles}
          {searchEmojis}
          placeholder="Comment on {target?.name ?? 'this'}"
          onvalueChanged={handleValueChanged}
          onsendZap={handleSendZap}
        />
      </div>
    {:else if step === "invoice"}
      <div class="invoice-view">
        <div class="invoice-header">
          <span class="invoice-amount">{formatAmount(Math.round(zapValue))}</span>
          {#if message}
            <span class="invoice-message">"{message}"</span>
          {/if}
        </div>
        <div class="qr-container">
          <a href={invoice ? `lightning:${invoice}` : "#"} class="qr-link" title="Click to open in wallet">
            {#if qrCodeUrl}
              <img src={qrCodeUrl} alt="Lightning Invoice QR Code" class="qr-image" loading="eager" />
            {/if}
          </a>
        </div>
        <p class="invoice-status">
          {#if waitingForReceipt}
            <span class="waiting-status">
              <Loader2 size={14} class="animate-spin" />
              <span>Waiting for payment...</span>
            </span>
          {:else}
            Scan with a Lightning wallet or click to open
          {/if}
        </p>
        <button type="button" class="copy-button" onclick={copyInvoice}>
          {#if copied}
            <Check size={16} class="text-green-500" />
            <span>Copied to clipboard!</span>
          {:else}
            <Copy size={16} />
            <span>Copy Invoice</span>
          {/if}
        </button>
        {#if showManualClose}
          <div class="manual-done-section">
            <p class="manual-done-text">Payment not automatically detected. If you've paid:</p>
            <button type="button" class="manual-done-button" onclick={handleManualDone}>
              <CheckCircle size={16} />
              <span>I've paid, close this</span>
            </button>
          </div>
        {/if}
        <button type="button" class="back-button" onclick={goBack}>← Change amount</button>
      </div>
    {:else if step === "success"}
      <div class="success-view">
        <div class="success-icon">
          <CheckCircle size={48} class="text-green-500" />
        </div>
        <h3 class="success-title">Zap Sent!</h3>
        <p class="success-message">{formatAmount(Math.round(zapValue))} zapped successfully</p>
      </div>
    {/if}
  </div>
</Modal>

<style>
  .zap-modal-content {
    padding: 16px;
  }
  @media (min-width: 768px) {
    .zap-modal-content {
      padding: 12px;
    }
  }
  .error-message {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    margin-bottom: 16px;
    background: hsl(var(--destructive) / 0.1);
    border: 0.33px solid hsl(var(--destructive) / 0.4);
    border-radius: var(--radius-12);
    color: hsl(var(--destructive));
    font-size: 14px;
  }
  .sign-in-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px;
    text-align: center;
  }
  .sign-in-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: hsl(var(--goldColor) / 0.1);
    border-radius: 50%;
    margin-bottom: 16px;
  }
  .sign-in-text {
    color: hsl(var(--white66));
    font-size: 14px;
    margin-bottom: 20px;
  }
  .invoice-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .invoice-header {
    text-align: center;
  }
  .invoice-amount {
    display: block;
    font-size: 24px;
    font-weight: 700;
    color: hsl(var(--goldColor));
  }
  .invoice-message {
    display: block;
    font-size: 14px;
    color: hsl(var(--white66));
    margin-top: 4px;
  }
  .qr-container {
    display: flex;
    justify-content: center;
  }
  .qr-link {
    display: block;
    padding: 12px;
    background: white;
    border-radius: var(--radius-16);
    transition: box-shadow 0.15s ease;
  }
  .qr-link:hover {
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  .qr-image {
    width: 192px;
    height: 192px;
  }
  .invoice-status {
    font-size: 12px;
    color: hsl(var(--white66));
    text-align: center;
  }
  .waiting-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .copy-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    background: hsl(var(--black33));
    border: 0.33px solid hsl(var(--white16));
    border-radius: var(--radius-12);
    color: hsl(var(--white));
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  .copy-button:hover {
    background: hsl(var(--white8));
  }
  .manual-done-section {
    width: 100%;
    padding-top: 16px;
    border-top: 0.33px solid hsl(var(--white16));
  }
  .manual-done-text {
    font-size: 12px;
    color: hsl(var(--white66));
    text-align: center;
    margin-bottom: 12px;
  }
  .manual-done-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    background: hsl(142 76% 36%);
    border: none;
    border-radius: var(--radius-12);
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  .manual-done-button:hover {
    background: hsl(142 76% 30%);
  }
  .back-button {
    padding: 8px 16px;
    background: transparent;
    border: none;
    color: hsl(var(--white66));
    font-size: 14px;
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .back-button:hover {
    color: hsl(var(--white));
  }
  .success-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px;
    text-align: center;
  }
  .success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: hsl(142 76% 36% / 0.1);
    border-radius: 50%;
    margin-bottom: 16px;
    color: hsl(142 76% 36%);
  }
  .success-title {
    font-size: 24px;
    font-weight: 700;
    color: hsl(142 76% 36%);
    margin: 0 0 8px;
  }
  .success-message {
    font-size: 14px;
    color: hsl(var(--white66));
    margin: 0;
  }
  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
