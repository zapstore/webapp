<script>
  import ProfilePic from "./common/ProfilePic.svelte";

  /** @type {{ name?: string; picture?: string; npub?: string }} */
  export let author = {};
  /** @type {string} */
  export let title = "";
  /** @type {string} */
  export let content = "";
  /** @type {string} */
  export let timestamp = "";
  /** @type {string[]} */
  export let labels = [];
  /** @type {() => void} */
  export let onClick = () => {};

  $: preview = content.length > 160 ? `${content.slice(0, 160)}…` : content;
</script>

<button type="button" class="forum-post" on:click={onClick}>
  <header class="post-header">
    <ProfilePic name={author.name} pictureUrl={author.picture} pubkey={author.npub} size="xs" />
    <div class="post-meta">
      <span class="author">{author.name || "Anonymous"}</span>
      <time>{timestamp}</time>
    </div>
  </header>

  <h3>{title}</h3>
  <p>{preview}</p>

  {#if labels.length > 0}
    <div class="labels">
      {#each labels as label}
        <span>{label}</span>
      {/each}
    </div>
  {/if}
</button>

<style>
  .forum-post { padding: 1rem; border-radius: 12px; background: hsl(var(--gray44)); cursor: pointer; border: none; width: 100%; text-align: left; }
  .post-header { display: flex; gap: .5rem; align-items: center; margin-bottom: .75rem; }
  .post-meta { display: flex; flex-direction: column; }
  .author { font-weight: 600; }
  .labels { display: flex; gap: .4rem; flex-wrap: wrap; margin-top: .5rem; }
  .labels span { font-size: .75rem; color: hsl(var(--white66)); }
</style>
