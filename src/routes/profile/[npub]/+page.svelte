<script lang="ts">
  /**
   * Profile page - header (pic, name, npub, Add button) + Published Apps & Stacks
   */
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import type { App, AppStack } from "$lib/nostr";
  import {
    fetchEvents,
    fetchProfile,
    fetchAppStacksParsed,
    parseApp,
    initNostrService,
    encodeAppNaddr,
    encodeStackNaddr,
  } from "$lib/nostr";
  import { nip19 } from "nostr-tools";
  import { EVENT_KINDS, DEFAULT_CATALOG_RELAYS } from "$lib/config";
  import { wheelScroll } from "$lib/actions/wheelScroll.js";
  import type { PageData } from "./$types";
  import DetailHeader from "$lib/components/layout/DetailHeader.svelte";
  import ProfilePic from "$lib/components/common/ProfilePic.svelte";
  import NpubDisplay from "$lib/components/common/NpubDisplay.svelte";
  import AppSmallCard from "$lib/components/cards/AppSmallCard.svelte";
  import AppStackCard from "$lib/components/cards/AppStackCard.svelte";
  import SectionHeader from "$lib/components/cards/SectionHeader.svelte";
  import { Plus } from "$lib/components/icons";

  let { data }: { data: PageData } = $props();

  const npub = $derived(data.npub ?? "");
  const pubkey = $derived(data.pubkey);

  let profile = $state<{
    name?: string;
    displayName?: string;
    picture?: string;
  } | null>(null);
  let profileLoading = $state(true);
  let apps = $state<App[]>([]);
  let appsLoading = $state(true);
  let stacks = $state<AppStack[]>([]);
  let stacksLoading = $state(true);
  let addButtonLabel = $state<"Add" | "Added">("Add");
  let addButtonDisabled = $state(false);

  const profileName = $derived(
    profile?.displayName || profile?.name || (pubkey ? `${pubkey.slice(0, 8)}…` : "Anonymous")
  );
  const profilePictureUrl = $derived(profile?.picture ?? "");

  const catalogs = $derived([]);

  async function loadProfile(pk: string) {
    profileLoading = true;
    try {
      if (browser) await initNostrService();
      const event = await fetchProfile(pk);
      if (event?.content) {
        const c = JSON.parse(event.content) as Record<string, unknown>;
        profile = {
          name: c.name as string | undefined,
          displayName: (c.display_name as string) || (c.name as string),
          picture: c.picture as string | undefined,
        };
      } else {
        profile = {};
      }
    } catch {
      profile = {};
    } finally {
      profileLoading = false;
    }
  }

  async function loadAppsByAuthor(pk: string) {
    appsLoading = true;
    try {
      if (browser) await initNostrService();
      const events = await fetchEvents(
        { kinds: [EVENT_KINDS.APP], authors: [pk], limit: 50 },
        { relays: [...DEFAULT_CATALOG_RELAYS], timeout: 8000 }
      );
      apps = events.map((ev) => parseApp(ev));
    } catch {
      apps = [];
    } finally {
      appsLoading = false;
    }
  }

  async function loadStacksByAuthor(pk: string) {
    stacksLoading = true;
    try {
      if (browser) await initNostrService();
      const list = await fetchAppStacksParsed({
        authors: [pk],
        limit: 50,
        timeout: 8000,
      });
      stacks = list;
    } catch {
      stacks = [];
    } finally {
      stacksLoading = false;
    }
  }

  function handleAddClick() {
    // Placeholder: add/remove from kind 3 and kind 30000 (simplified for first draft)
    addButtonDisabled = true;
    addButtonLabel = "Added";
    setTimeout(() => {
      addButtonDisabled = false;
    }, 800);
  }

  onMount(() => {
    if (!pubkey || !browser) return;
    loadProfile(pubkey);
    loadAppsByAuthor(pubkey);
    loadStacksByAuthor(pubkey);
  });

  // Stack card shape for AppStackCard: name, description, apps[], creator
  function stackToCard(s: AppStack): {
    name: string;
    description: string;
    apps: Array<{ name: string; icon?: string; dTag?: string }>;
    creator?: { name?: string; picture?: string; pubkey: string; npub: string };
  } {
    const creatorNpub = pubkey ? nip19.npubEncode(pubkey) : "";
    return {
      name: s.title || s.dTag || "Untitled",
      description: s.description || "",
      apps: (s.appRefs || []).map((ref) => ({
        name: ref.identifier,
        dTag: ref.identifier,
      })),
      creator: pubkey
        ? {
            name: profileName,
            picture: profilePictureUrl,
            pubkey,
            npub: creatorNpub,
          }
        : undefined,
    };
  }
</script>

<svelte:head>
  <title>{profileName} - Profile - Zapstore</title>
</svelte:head>

{#if !pubkey}
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
    <div class="rounded-lg bg-destructive/10 border border-destructive/20 p-6 max-w-md mx-auto text-center">
      <h3 class="text-lg font-semibold text-destructive mb-2">Invalid profile</h3>
      <p class="text-muted-foreground">The profile address (npub) is not valid.</p>
    </div>
  </div>
{:else}
  <DetailHeader
    publisherPic={profilePictureUrl || undefined}
    publisherName={profileName}
    publisherPubkey={pubkey}
    publisherUrl="/profile/{npub}"
    catalogs={catalogs}
    catalogText=""
    showPublisher={true}
  />

  <div class="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-6 pb-8">
    <!-- Profile Header (mirrors app page header layout) -->
    <div class="profile-header flex items-center gap-4 sm:gap-6 mb-8">
      <div class="profile-pic-wrap flex-shrink-0">
        {#if profileLoading}
          <div class="profile-pic-skeleton"></div>
        {:else}
          <ProfilePic
            pictureUrl={profilePictureUrl || undefined}
            pubkey={pubkey}
            size="2xl"
            className="profile-avatar"
          />
        {/if}
      </div>

      <div class="profile-info flex-1 min-w-0">
        <div class="profile-name-row flex items-center justify-between gap-3 mb-2">
          <h1 class="profile-name text-[1.625rem] sm:text-4xl font-black" style="color: hsl(var(--white));">
            {profileName}
          </h1>
          <button
            type="button"
            class="add-btn btn-primary flex items-center gap-2 flex-shrink-0"
            onclick={handleAddClick}
            disabled={addButtonDisabled}
            aria-label={addButtonLabel}
          >
            <Plus variant="outline" color="white" size={18} strokeWidth={2.5} />
            <span>{addButtonLabel}</span>
          </button>
        </div>
        <div class="profile-npub-row">
          <NpubDisplay npub={npub} pubkey={pubkey} size="md" truncate={true} />
        </div>
      </div>
    </div>

    <!-- Published Apps -->
    <section class="mb-10">
      <SectionHeader title="Published Apps" />
      {#if appsLoading}
        <p class="text-sm" style="color: hsl(var(--white33));">Loading apps…</p>
      {:else if apps.length === 0}
        <p class="text-sm" style="color: hsl(var(--white33));">No published apps.</p>
      {:else}
        <div class="apps-scroll flex gap-4 overflow-x-auto pb-2 scrollbar-hide" use:wheelScroll>
          {#each apps as app}
            {@const naddr = app.naddr || encodeAppNaddr(app.pubkey, app.dTag)}
            <AppSmallCard
              app={{
                name: app.name,
                icon: app.icon,
                description: app.description,
                dTag: app.dTag,
              }}
              href="/apps/{naddr}"
            />
          {/each}
        </div>
      {/if}
    </section>

    <!-- Published Stacks -->
    <section class="mb-10">
      <SectionHeader title="Published Stacks" />
      {#if stacksLoading}
        <p class="text-sm" style="color: hsl(var(--white33));">Loading stacks…</p>
      {:else if stacks.length === 0}
        <p class="text-sm" style="color: hsl(var(--white33));">No published stacks.</p>
      {:else}
        <div class="stacks-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each stacks as stack}
            {@const href = '/stacks/' + encodeStackNaddr(stack.pubkey, stack.dTag)}
            <AppStackCard
              stack={stackToCard(stack)}
              {href}
            />
          {/each}
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .profile-header {
    align-items: flex-start;
  }

  .profile-pic-wrap {
    --size: 88px;
  }

  @media (min-width: 640px) {
    .profile-pic-wrap {
      --size: 112px;
    }
  }

  .profile-pic-skeleton {
    width: var(--size);
    height: var(--size);
    border-radius: 22px;
    background: hsl(var(--gray66));
    animation: pulse 1.5s ease-in-out infinite;
  }

  .profile-name {
    word-break: break-word;
  }

  .profile-npub-row {
    margin-top: 4px;
  }

  .add-btn {
    padding: 10px 18px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.9375rem;
    border: none;
    cursor: pointer;
    background: var(--gradient-blurple);
  }

  .add-btn:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .add-btn:hover:not(:disabled) {
    opacity: 0.95;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  .apps-scroll {
    scrollbar-width: none;
  }

  .apps-scroll::-webkit-scrollbar {
    display: none;
  }
</style>
