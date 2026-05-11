<script lang="js">
/**
 * ZapSliderModal - Full zap flow: slider amount + comment, then invoice QR + copy + open in wallet, then success.
 * Aligned with local-first ARCHITECTURE; invoice from LNURL, receipt via relay subscription + EventStore.
 */
import { onDestroy } from "svelte";
import { Loader2, AlertCircle, Copy } from "lucide-svelte";
import { Check as CheckIcon } from "$lib/components/icons";
import { generateSecretKey, finalizeEvent } from "nostr-tools/pure";
import { createZap, subscribeToZapReceipt, fetchZapReceiptFallback, putEvents, publishZapCommentWrapper } from "$lib/nostr";
import { getIsSignedIn, signEvent } from "$lib/stores/auth.svelte.js";
import { EVENT_KINDS } from "$lib/config";
import Modal from "$lib/components/common/Modal.svelte";
import ZapSlider from "./ZapSlider.svelte";
/**
 * Build wrapper parent/root context for root-level zaps (app, stack, forum post).
 * Returns null if the target doesn't have enough identity info.
 * @param {typeof target} tgt
 * @param {string} type
 */
function buildRootWrapperCtx(tgt, type) {
    const pubkey = String(tgt?.pubkey ?? '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(pubkey)) return null;
    if (type === 'app') {
        const dTag = String(tgt?.dTag ?? '').trim();
        if (!dTag) return null;
        const kind = EVENT_KINDS.APP;
        const aTag = String(tgt?.aTag ?? '').trim().toLowerCase() || `${kind}:${pubkey}:${dTag}`;
        return { parent: { kind, pubkey, aTag }, root: { kind, pubkey, identifier: dTag } };
    }
    if (type === 'stack') {
        const dTag = String(tgt?.dTag ?? '').trim();
        if (!dTag) return null;
        const kind = EVENT_KINDS.APP_STACK;
        const aTag = String(tgt?.aTag ?? '').trim().toLowerCase() || `${kind}:${pubkey}:${dTag}`;
        return { parent: { kind, pubkey, aTag }, root: { kind, pubkey, identifier: dTag } };
    }
    if (type === 'forum') {
        const id = String(tgt?.id ?? '').trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(id)) return null;
        return {
            parent: { kind: EVENT_KINDS.FORUM_POST, pubkey, id },
            root: { kind: EVENT_KINDS.FORUM_POST, pubkey, eventId: id }
        };
    }
    return null;
}

/** Sign zap request with a fresh random keypair (for guest zaps). */
async function signWithAnonymousKey(template) {
    const sk = generateSecretKey();
    return finalizeEvent(template, sk);
}
let { target = null, publisherName = "", contentType = "app", otherZaps = [], isOpen = $bindable(false), nestedModal = false, lockBodyScroll = true, scopedInPanel = false, zIndex = 50, searchProfiles = async () => [], searchEmojis = async () => [], onclose, onzapReceived, onZapPending, onZapPendingClear,
/**
 * When set, a kind-1111 z-wrapper is published after the receipt lands (deeper zaps only).
 * Shape: `{ parent: { id, kind, pubkey }, root: { kind, pubkey, identifier?, eventId? } }`
 */
wrapperParent = null,
/** When set, opening the modal pre-fills this amount on the slider (e.g. quick chips). */
presetZapSats = null, } = $props();
let sliderComponent = $state(null);
let zapValue = $state(1000);
let message = $state("");
/** Relays from the actual zap request — the LN backend publishes the receipt here. */
let zapRelays = $state([]);
/** Unix timestamp when the zap was initiated — anchors the receipt subscription's `since`. */
let zapStartedAt = $state(0);
let loading = $state(false);
let error = $state("");
let invoice = $state(null);
let invoiceLoading = $state(false);
let zapRequest = $state(null);
let copied = $state(false);
let step = $state("slider");
let unsubscribe = null;
let _waitingForReceipt = $state(false);
let showManualClose = $state(false);
let receiptTimeout = null;
let lastEmojiTags = $state([]);
/** Stashed for z-wrapper publishing after receipt lands. Cleared on reset. */
let _pendingWrapperComment = $state('');
let _pendingWrapperEmojiTags = $state(/** @type {{ shortcode: string, url: string }[]} */ ([]));
let _pendingWrapperMentions = $state(/** @type {string[]} */ ([]));
/** Optimistic UI: temp row id until receipt or cancel */
let pendingTempId = $state(null);
const isConnected = $derived(getIsSignedIn());
const qrCodeUrl = $derived(invoice
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=ffffff&color=000000&data=${encodeURIComponent("lightning:" + invoice.toUpperCase())}`
    : null);
const targetProfile = $derived(target
    ? { pictureUrl: target.pictureUrl, name: target.name, pubkey: target.pubkey }
    : null);
const zapDescription = $derived(() => {
    const authorName = publisherName || "Creator";
    switch (contentType) {
        case "app": return `${authorName} for publishing ${target?.name ?? "this app"}`;
        case "stack": return `${authorName} for their stack`;
        case "forum": return `${authorName} for their forum post`;
        case "comment": return `${target?.name || authorName} for their comment`;
        default: return authorName;
    }
});
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
function resetZapFormState() {
    zapValue = 1000;
    message = "";
    loading = false;
    invoiceLoading = false;
    error = "";
    invoice = null;
    zapRequest = null;
    zapRelays = [];
    zapStartedAt = 0;
    step = "slider";
    _waitingForReceipt = false;
    showManualClose = false;
    _pendingWrapperComment = '';
    _pendingWrapperEmojiTags = [];
    _pendingWrapperMentions = [];
}
/** Successful close after receipt (pending row already cleared in parent). */
function closeAfterSuccess() {
    cleanup();
    resetZapFormState();
    pendingTempId = null;
    isOpen = false;
    onclose?.({ success: true });
}
function handleValueChanged(e) {
    zapValue = e.value;
}
function handleSendZap(e) {
    zapValue = e.amount;
    message = e.message;
    lastEmojiTags = e.emojiTags ?? [];
    handleZap();
}
async function handleZap() {
    if (loading || zapValue < 1)
        return;
    // Record before createZap so subscribeToZapReceipt gets the full time window.
    zapStartedAt = Math.floor(Date.now() / 1000);
    // Show invoice step immediately with skeleton; createZap runs in background
    step = "invoice";
    invoice = null;
    invoiceLoading = true;
    _waitingForReceipt = true;
    loading = true;
    error = "";
    try {
        const serialized = sliderComponent?.getSerializedContent?.();
        // Use || (not ??) so we fall back to message if serialized.text is an empty string.
        const commentText = serialized?.text?.trim() || message;
        const emojiTagsToSend = (serialized?.emojiTags?.length ? serialized.emojiTags : lastEmojiTags) ?? [];
        // Stash for z-wrapper publishing after the receipt lands.
        _pendingWrapperComment = commentText;
        _pendingWrapperEmojiTags = emojiTagsToSend;
        _pendingWrapperMentions = serialized?.mentions ?? [];
        const signer = isConnected
            ? signEvent
            : signWithAnonymousKey;
        const result = await createZap(target, Math.round(zapValue), commentText, signer, emojiTagsToSend.length ? emojiTagsToSend : undefined);
        invoice = result.invoice;
        zapRequest = result.zapRequest;
        zapRelays = result.relays ?? [];
        const tempId = `pending-zap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        pendingTempId = tempId;
        const zid = target?.id?.trim?.() ?? "";
        const zappedEventId = /^[a-f0-9]{64}$/i.test(zid) ? zid.toLowerCase() : undefined;
        onZapPending?.({
            tempId,
            amountSats: Math.round(zapValue),
            comment: commentText,
            emojiTags: emojiTagsToSend,
            zappedEventId,
            recipientPubkey: target?.pubkey,
        });
        startListeningForReceipt(zapStartedAt);
        // Trigger browser wallet (Alby etc.) immediately when invoice is ready
        if (result.invoice) {
            queueMicrotask(() => openInWallet(result.invoice));
        }
    }
    catch (err) {
        console.error("Zap failed:", err);
        error = err instanceof Error ? err.message : "Failed to create zap";
        step = "slider";
        _waitingForReceipt = false;
    }
    finally {
        loading = false;
        invoiceLoading = false;
    }
}
function startListeningForReceipt(zapStartedAt) {
    if (!zapRequest || !target?.pubkey)
        return;
    const targetAddress = target.dTag ? `32267:${target.pubkey}:${target.dTag}` : null;
    unsubscribe = subscribeToZapReceipt(target.pubkey, zapRequest.id, (zapReceipt) => {
        if (receiptTimeout) {
            clearTimeout(receiptTimeout);
            receiptTimeout = null;
        }
        _waitingForReceipt = false;
        step = "success";
        const temp = pendingTempId;
        pendingTempId = null;
        onzapReceived?.({ zapReceipt, pendingTempId: temp });
        // Publish a kind-1111 z-wrapper for any zap that carries comment text.
        // wrapperParent covers deeper (thread-level) zaps passed in from RootComment.
        // For root-level zaps (app/stack/forum post) we derive the context from target.
        // Publish a kind-1111 z-wrapper for any zap that carries comment text.
        // wrapperParent covers deeper (thread-level) zaps passed in from RootComment.
        // For root-level zaps (app/stack/forum post) we derive the context from target.
        if (_pendingWrapperComment.trim() && getIsSignedIn()) {
            const wrapperCtx = (wrapperParent?.parent && wrapperParent?.root)
                ? wrapperParent
                : buildRootWrapperCtx(target, contentType);
            if (wrapperCtx) {
                void publishZapCommentWrapper(
                    {
                        zapReceiptId: zapReceipt.id,
                        amountSats: Math.round(zapValue),
                        parent: wrapperCtx.parent,
                        root: wrapperCtx.root,
                        content: _pendingWrapperComment,
                        emojiTags: _pendingWrapperEmojiTags,
                        mentions: _pendingWrapperMentions
                    },
                    signEvent
                ).catch((err) => console.warn('[zap] z-wrapper publish failed:', err));
            }
        }
        setTimeout(() => closeAfterSuccess(), 2000);
    }, { invoice: invoice ?? undefined, appAddress: targetAddress, appEventId: target.id, zapStartedAt, relays: zapRelays });
    receiptTimeout = setTimeout(() => {
        showManualClose = true;
    }, 30000);
}
function handleManualDone() {
    // Capture before reset clears them.
    const savedZapRequestId = zapRequest?.id;
    const savedRelays = [...zapRelays];
    const savedZapStartedAt = zapStartedAt;
    const savedRecipientPubkey = target?.pubkey;
    const temp = pendingTempId;
    pendingTempId = null;
    if (temp)
        onZapPendingClear?.(temp);
    cleanup();
    resetZapFormState();
    isOpen = false;
    // Close without a success signal — the receipt was never confirmed.
    onclose?.({ success: false });
    // Fire-and-forget: search all zap-request relays for the receipt.
    // If the LN backend published it to a relay we weren't subscribed to,
    // this finds it and writes it to Dexie — liveQuery will surface it in the UI.
    if (savedZapRequestId && savedRecipientPubkey) {
        void fetchZapReceiptFallback(savedRecipientPubkey, savedZapRequestId, savedRelays, savedZapStartedAt)
            .then((receipt) => {
                if (receipt) {
                    void putEvents([receipt]);
                    onzapReceived?.({ zapReceipt: receipt, pendingTempId: null });
                }
            })
            .catch(() => { /* silent — best-effort only */ });
    }
}
async function copyInvoice() {
    if (!invoice)
        return;
    try {
        await navigator.clipboard.writeText(invoice);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }
    catch (err) {
        console.error("Failed to copy:", err);
    }
}
/** Try WebLN (Alby etc.) first, then fall back to lightning: URL so the browser can open a wallet. */
async function openInWallet(bolt11) {
    const w = typeof window !== "undefined" ? window.webln : undefined;
    if (w) {
        try {
            await w.enable();
            await w.sendPayment(bolt11);
            // Payment sent; receipt listener will handle success
        }
        catch (_e) {
            // User rejected or error; fall back to lightning: so another handler can try
            try {
                const a = document.createElement("a");
                a.href = `lightning:${bolt11}`;
                a.rel = "noopener noreferrer";
                a.target = "_blank";
                a.click();
            }
            catch {
                // ignore
            }
        }
    }
    else {
        const a = document.createElement("a");
        a.href = `lightning:${bolt11}`;
        a.rel = "noopener noreferrer";
        a.target = "_blank";
        a.click();
    }
}
function goBack() {
    const temp = pendingTempId;
    pendingTempId = null;
    if (temp)
        onZapPendingClear?.(temp);
    cleanup();
    step = "slider";
    invoice = null;
    invoiceLoading = false;
    zapRequest = null;
    error = "";
    _waitingForReceipt = false;
    showManualClose = false;
}
function formatAmount(val) {
    return Math.round(val).toLocaleString("en-US");
}
onDestroy(() => cleanup());
let _prevIsOpen = $state(false);
$effect(() => {
    if (!_prevIsOpen && isOpen) {
        const p = presetZapSats != null ? Number(presetZapSats) : NaN;
        if (Number.isFinite(p) && p >= 1) {
            zapValue = Math.round(p);
        }
    }
    if (_prevIsOpen && !isOpen) {
        if (pendingTempId) {
            onZapPendingClear?.(pendingTempId);
            pendingTempId = null;
        }
        cleanup();
        resetZapFormState();
    }
    _prevIsOpen = isOpen;
});
</script>

<Modal
  bind:open={isOpen}
  ariaLabel="Zap {target?.name ?? 'Content'}"
  wide={true}
  align="bottom"
  noBackdrop={nestedModal}
  {zIndex}
  lockBodyScroll={lockBodyScroll}
  {scopedInPanel}
  class="zap-slider-modal"
>
  <div class="zap-modal-content">
    {#if error}
      <div class="error-message">
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    {/if}

    {#if step === "slider"}
      <!-- Same zap flow for guest (anon keypair) and signed-in users -->
      <div class="pt-4">
        <h2 class="modal-title modal-heading mb-2">Zap</h2>
        <p class="regular16 text-muted-foreground text-center mb-4">
          {zapDescription()}
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
          placeholder="Write your comment..."
          onvalueChanged={handleValueChanged}
          onsendZap={handleSendZap}
        />
      </div>
    {:else if step === "invoice"}
      <div class="invoice-view">
        <h2 class="modal-title invoice-title modal-heading">Invoice</h2>
        <div class="invoice-qr-block">
          {#if invoiceLoading || !qrCodeUrl}
            <div class="invoice-qr-skeleton" aria-hidden="true"></div>
          {:else}
            <a
              href={invoice ? `lightning:${invoice}` : "#"}
              class="invoice-qr-link"
              title="Open in Lightning wallet"
            >
              <img
                src={qrCodeUrl}
                alt="Lightning Invoice QR Code"
                class="invoice-qr-image"
                loading="eager"
              />
            </a>
          {/if}
        </div>
        <button
          type="button"
          class="copy-invoice-btn"
          onclick={copyInvoice}
          title="Copy BOLT11 invoice"
          disabled={!invoice}
        >
          {#if copied}
            <CheckIcon variant="outline" size={16} strokeWidth={2} color="var(--blurpleColor)" className="flex-shrink-0" />
            <span>Copied!</span>
          {:else}
            <Copy size={18} class="flex-shrink-0" />
            <span>Copy link</span>
          {/if}
        </button>
        <div class="invoice-button-row">
          <button type="button" class="btn-secondary-large btn-secondary-dark invoice-back-btn" onclick={goBack}>Back</button>
          {#if showManualClose}
            <button type="button" class="btn-primary-large invoice-action-btn" onclick={handleManualDone}>
              <CheckIcon variant="outline" size={16} strokeWidth={2} color="var(--whiteEnforced)" className="flex-shrink-0" />
              <span>I've paid. Close this</span>
            </button>
          {:else}
            <button type="button" class="btn-primary-large invoice-action-btn invoice-waiting-btn" disabled>
              <Loader2 size={16} class="animate-spin flex-shrink-0" />
              <span>Waiting for payment</span>
            </button>
          {/if}
        </div>
      </div>
    {:else if step === "success"}
      <div class="invoice-view">
        <h2 class="modal-title invoice-title modal-heading">Success</h2>
        <div class="success-icon-circle">
          <CheckIcon variant="outline" size={56} strokeWidth={2.5} color="var(--blurpleColor)" />
        </div>
        <p class="success-message">{formatAmount(Math.round(zapValue))} sats zapped</p>
      </div>
    {/if}
  </div>
</Modal>

<style>
  :global(.zap-slider-modal.modal-scoped-in-panel .modal-content) {
    padding-bottom: 0;
  }

  .modal-title {
    font-size: 1.875rem;
  }

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
    background: color-mix(in srgb, var(--rougeColor) 10%, transparent);
    border: 0.33px solid color-mix(in srgb, var(--rougeColor) 40%, transparent);
    border-radius: var(--radius-12);
    color: var(--rougeColor);
    font-size: 14px;
  }
  .invoice-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .invoice-title {
    font-size: 1.875rem;
    color: var(--white);
    margin: 0 0 8px;
  }
  .invoice-qr-block {
    flex-shrink: 0;
  }
  .invoice-qr-skeleton {
    width: 200px;
    height: 200px;
    background: var(--white16);
    border-radius: 12px;
    animation: invoice-skeleton-pulse 1.2s ease-in-out infinite;
  }
  @keyframes invoice-skeleton-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  .invoice-qr-link {
    display: block;
    padding: 8px;
    background: white;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--white16) 40%, transparent);
    transition: box-shadow 0.15s ease;
  }
  .invoice-qr-link:hover {
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
  }
  .invoice-qr-image {
    width: 200px;
    height: 200px;
    display: block;
  }
  .copy-invoice-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    background: transparent;
    border: none;
    color: var(--white66);
    font-size: 14px;
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .copy-invoice-btn:hover:not(:disabled) {
    color: var(--white);
  }
  .copy-invoice-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .invoice-button-row {
    display: flex;
    flex-direction: row;
    gap: 12px;
    width: 100%;
    align-items: stretch;
  }
  .invoice-back-btn {
    color: var(--white66) !important;
  }
  /* Back: let the global btn class handle size; no override needed */
  .invoice-action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .invoice-waiting-btn {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .success-icon-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 104px;
    height: 104px;
    background: color-mix(in srgb, var(--blurpleColor) 12%, transparent);
    border-radius: 50%;
  }
  .success-message {
    font-size: 14px;
    color: var(--white66);
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
