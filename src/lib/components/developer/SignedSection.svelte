<script lang="ts">
  /**
   * SignedSection - Two columns: codeblock in gray66 wrapper at top, fixed view on bottom (no scroll);
   * right column "Signed. Yours. Truly." with white-blurple gradient and stepped opacity.
   */
  const signedEvent = {
    kind: 32267,
    id: "cc5f28ff8263f57310e1e0a699d1e2fc2a10f4c7f453d2cb4a652995c406e4b1",
    pubkey: "78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d",
    created_at: 1770317160,
    tags: [
      ["name", "Zapstore Alpha"],
      ["d", "dev.zapstore.alpha"],
      ["repository", "https://github.com/zapstore/zapstore"],
      ["url", "https://zapstore.dev"],
      ["f", "android-arm64-v8a"],
      ["t", "android"],
      ["t", "apk"],
      ["t", "app"],
      ["t", "appstore"],
      ["t", "grapheneos"],
      ["t", "lightning"],
      ["t", "lightning-network"],
      ["t", "nostr"],
      ["t", "obtainium"],
      ["t", "permissionless"],
      ["t", "playstore"],
      ["t", "sha256"],
      ["t", "social-graph"],
      ["t", "weboftrust"],
      ["license", "MIT"],
      ["icon", "https://cdn.zapstore.dev/2787fabd17260808c72ec5456996dbd5356bc8e822a1ecf85f220a29dbe2e998"],
      ["a", "30063:78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d:dev.zapstore.alpha@1.0.0-rc4"],
    ],
    content: "The Open App Store",
    sig: "b0e743bb26779760ad9cea7340c284587685cd3e46a8dfadec9ca41f324aa29887bff4e0fe92b86131f73f336df351c7a6fddf2561e1d26ad24eca8ba334f862",
  };

  const formattedJson = JSON.stringify(signedEvent, null, 2);

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderJson(value: unknown, indent: number): string {
    const indentStr = "  ".repeat(indent);
    const nextIndent = "  ".repeat(indent + 1);

    if (value === null) return `<span class="hl-value">null</span>`;
    if (typeof value === "boolean") return `<span class="hl-value">${value}</span>`;
    if (typeof value === "number") return `<span class="hl-value">${value}</span>`;
    if (typeof value === "string")
      return `<span class="hl-punct">"</span><span class="hl-value">${escapeHtml(value)}</span><span class="hl-punct">"</span>`;

    if (Array.isArray(value)) {
      if (value.length === 0) return `<span class="hl-bracket">[</span><span class="hl-bracket">]</span>`;
      const items = (value as unknown[]).map((item, i) => {
        const comma = i < (value as unknown[]).length - 1 ? `<span class="hl-punct">,</span>` : "";
        return `${nextIndent}${renderJson(item, indent + 1)}${comma}`;
      });
      return `<span class="hl-bracket">[</span>\n${items.join("\n")}\n${indentStr}<span class="hl-bracket">]</span>`;
    }

    if (typeof value === "object" && value !== null) {
      const keys = Object.keys(value as Record<string, unknown>);
      if (keys.length === 0) return `<span class="hl-brace">{</span><span class="hl-brace">}</span>`;
      const entries = keys.map((key, i) => {
        const comma = i < keys.length - 1 ? `<span class="hl-punct">,</span>` : "";
        const keyHtml = `<span class="hl-punct">"</span><span class="hl-key">${escapeHtml(key)}</span><span class="hl-punct">"</span>`;
        const colonHtml = `<span class="hl-punct">:</span>`;
        return `${nextIndent}${keyHtml}${colonHtml} ${renderJson((value as Record<string, unknown>)[key], indent + 1)}${comma}`;
      });
      return `<span class="hl-brace">{</span>\n${entries.join("\n")}\n${indentStr}<span class="hl-brace">}</span>`;
    }

    return escapeHtml(String(value));
  }

  function highlightJson(json: string): string {
    if (!json) return "";
    try {
      return renderJson(JSON.parse(json), 0);
    } catch {
      return escapeHtml(json);
    }
  }

  const highlightedJson = highlightJson(formattedJson);
</script>

<section class="signed-section">
  <div class="signed-container">
    <!-- Left: code in gray66 wrapper at top, fixed height, scroll at bottom -->
    <div class="signed-code-col">
      <div class="signed-code-outer">
        <div class="signed-code-panel">
          <div class="signed-code-fixed">
            <div class="signed-code-spacer" aria-hidden="true"></div>
            <pre><code>{@html highlightedJson}</code></pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: large text, top padding, white-blurple gradient, stepped opacity -->
    <div class="signed-text-col">
      <p class="signed-line signed-line-1">Signed.</p>
      <p class="signed-line signed-line-2">Yours.</p>
      <p class="signed-line signed-line-3">Truly.</p>
    </div>

    <!-- Description under the two columns, centered; matches landing section-description -->
    <p class="signed-desc section-description">
      The bech32 signature in Nostr is public: anyone can verify it. Your event travels with its proof—so you own it, everywhere.
    </p>
  </div>
</section>

<style>
  .signed-section {
    overflow: hidden;
    padding: 0 1rem 3rem;
    border-bottom: 1px solid hsl(var(--border) / 0.5);
  }

  @media (min-width: 768px) {
    .signed-section {
      padding: 0 1.5rem 4rem;
    }
  }

  .signed-container {
    max-width: 1000px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
    align-items: center;
  }

  @media (min-width: 768px) {
    .signed-container {
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
      align-items: start;
    }
  }

  .signed-desc {
    grid-column: 1 / -1;
    order: 3;
    justify-self: center;
    text-align: center;
    margin: 1.75rem 0 0;
    max-width: 36em;
  }

  @media (min-width: 768px) {
    .signed-desc {
      margin-top: 2rem;
    }
  }

  /* Code column: wrapper at top, gray66, fixed height, scroll to bottom */
  .signed-code-col {
    min-width: 0;
    order: 1;
  }

  .signed-code-outer {
    background-color: hsl(var(--gray44));
    padding: 0 1.25rem 1.5rem;
    border-radius: 0 0 24px 24px;
    border: 0.33px solid hsl(var(--white16));
    height: 280px;
  }

  @media (min-width: 768px) {
    .signed-code-outer {
      padding: 0 1.75rem 2rem;
      height: 320px;
      border-radius: 0 0 32px 32px;
    }
  }

  .signed-code-panel {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  /* Fade-out mask at top of code */
  .signed-code-panel::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 48px;
    background: linear-gradient(to bottom, hsl(var(--gray44)) 0%, transparent 100%);
    pointer-events: none;
    z-index: 1;
  }

  /* Fixed view on bottom: no scroll, content aligned to end so bottom is visible */
  .signed-code-fixed {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .signed-code-spacer {
    flex: 1;
    min-height: 120px;
  }

  .signed-code-fixed pre {
    margin: 0;
    width: 100%;
    min-width: 0;
    flex-shrink: 0;
  }

  .signed-code-fixed code {
    font-family: var(--font-mono);
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.5;
    letter-spacing: 0.15px;
    color: hsl(var(--foreground));
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: break-word;
    display: block;
  }

  @media (min-width: 768px) {
    .signed-code-fixed code {
      font-size: 1.125rem;
    }
  }

  .signed-code-fixed :global(.hl-key) {
    color: hsl(var(--blurpleLightColor));
  }

  .signed-code-fixed :global(.hl-value) {
    color: hsl(0 0% 100% / 0.9);
  }

  .signed-code-fixed :global(.hl-punct) {
    color: hsl(var(--white66));
  }

  .signed-code-fixed :global(.hl-brace) {
    color: hsl(var(--goldColor));
  }

  .signed-code-fixed :global(.hl-bracket) {
    color: hsl(var(--goldColor66));
  }

  /* Text column: top padding on desktop */
  .signed-text-col {
    text-align: left;
    order: 2;
  }

  @media (min-width: 768px) {
    .signed-text-col {
      padding-top: 3rem;
    }
  }

  .signed-line {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 650;
    line-height: 1.1;
    letter-spacing: -0.02em;
    background: var(--gradient-white-blurple);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .signed-line-1 {
    opacity: 1;
  }

  .signed-line-2 {
    opacity: 0.9;
  }

  .signed-line-3 {
    opacity: 0.8;
  }

  @media (min-width: 640px) {
    .signed-line {
      font-size: 3.25rem;
    }
  }

  @media (min-width: 768px) {
    .signed-line {
      font-size: 3.5rem;
    }
  }

  @media (min-width: 1024px) {
    .signed-line {
      font-size: 4rem;
    }
  }
</style>
