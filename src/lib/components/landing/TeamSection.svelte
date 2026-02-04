<script>
  import LandingSectionTitle from "./LandingSectionTitle.svelte";
  import SkeletonLoader from "$lib/components/common/SkeletonLoader.svelte";

  // Top zappers - disabled for now (requires webapp Nostr integration)
  let topZappers = [];
  let isLoading = false;

  // Team members - proper grid where top/bottom rows are centered between middle row positions
  // Middle row x positions: 0, ±200, ±400, ±600, ±800
  // Top/Bottom row x positions: ±100, ±300, ±500, ±700 (midpoints)
  // Sizes scale down: 120 → 105 → 92 → 80 → 70
  const coreTeam = [
    // MIDDLE ROW (y: 0) - Franzap center, then extending left/right
    {
      name: "Franzap",
      role: "Lead",
      image: "/images/team-sprofiles/franzap.png",
      size: 120,
      x: 0,
      y: 0,
      blur: 0,
      opacity: 1,
    },
    {
      name: "And Other Stuff",
      role: "Donor",
      image: "/images/team-sprofiles/andotherstuff.png",
      size: 105,
      x: -200,
      y: 0,
      blur: 0,
      opacity: 1,
    },
    {
      name: "Henrique",
      role: "Flutter",
      image: "/images/team-sprofiles/henrique.png",
      size: 105,
      x: 200,
      y: 0,
      blur: 0,
      opacity: 1,
    },
    // TOP ROW (y: -175) - centered between middle row positions
    {
      name: "Pip",
      role: "Back End",
      image: "/images/team-sprofiles/pip.png",
      size: 105,
      x: -100,
      y: -175,
      blur: 0,
      opacity: 1,
    },
    {
      name: "Niel",
      role: "Design",
      image: "/images/team-sprofiles/niel.png",
      size: 105,
      x: 100,
      y: -175,
      blur: 0,
      opacity: 1,
    },
    {
      name: "Elsat",
      role: "Support",
      image: "/images/team-sprofiles/elsat.png",
      size: 92,
      x: -300,
      y: -175,
      blur: 0.3,
      opacity: 0.92,
    },

    // BOTTOM ROW (y: 175) - centered between middle row positions
    {
      name: "Opensats",
      role: "Donor",
      image: "/images/team-sprofiles/opensats.png",
      size: 100,
      x: -100,
      y: 175,
      blur: 0,
      opacity: 1,
    },
    {
      name: "HRF",
      role: "Donor",
      image: "/images/team-sprofiles/hrf.png",
      size: 100,
      x: 100,
      y: 175,
      blur: 0,
      opacity: 1,
    },
  ];

  // Top zapper slot positions (will be filled dynamically)
  const zapperSlots = [
    { size: 92, x: -400, y: 0, blur: 0.3, opacity: 0.92 },
    { size: 92, x: 400, y: 0, blur: 0.3, opacity: 0.92 },
    { size: 80, x: -600, y: 0, blur: 0.7, opacity: 0.8 },
    { size: 80, x: 600, y: 0, blur: 0.7, opacity: 0.8 },
    { size: 70, x: -800, y: 0, blur: 1.2, opacity: 0.65 },
    { size: 70, x: 800, y: 0, blur: 1.2, opacity: 0.65 },
    { size: 92, x: 300, y: -175, blur: 0.3, opacity: 0.92 },
    { size: 80, x: -500, y: -175, blur: 0.7, opacity: 0.8 },
    { size: 80, x: 500, y: -175, blur: 0.7, opacity: 0.8 },
    { size: 70, x: -700, y: -175, blur: 1.2, opacity: 0.65 },
    { size: 70, x: 700, y: -175, blur: 1.2, opacity: 0.65 },
    { size: 88, x: -300, y: 175, blur: 0.4, opacity: 0.9 },
    { size: 88, x: 300, y: 175, blur: 0.4, opacity: 0.9 },
    { size: 76, x: -500, y: 175, blur: 0.8, opacity: 0.78 },
    { size: 76, x: 500, y: 175, blur: 0.8, opacity: 0.78 },
    { size: 66, x: -700, y: 175, blur: 1.3, opacity: 0.62 },
    { size: 66, x: 700, y: 175, blur: 1.3, opacity: 0.62 },
  ];

  // Combined team members (reactive)
  $: teamMembers = [
    ...coreTeam,
    ...zapperSlots.map((slot, i) => ({
      ...slot,
      name: topZappers[i]?.name || "",
      role: "Top Zapper",
      image: topZappers[i]?.image || null,
      isZapperSlot: true,
    })),
  ];

  // Note: Top zappers feature disabled for webapp
  // TODO: Integrate with webapp's Nostr service to fetch zappers

  let donateButton;

  function handleDonateMouseMove(event) {
    if (!donateButton) return;
    const rect = donateButton.getBoundingClientRect();
    donateButton.style.setProperty(
      "--mouse-x",
      `${event.clientX - rect.left}px`,
    );
    donateButton.style.setProperty(
      "--mouse-y",
      `${event.clientY - rect.top}px`,
    );
  }

  function handleDonate() {
    // TODO: Navigate to donate
  }
</script>

<section
  class="relative border-t border-border/50 pt-8 sm:pt-12 lg:pt-16 pb-0 overflow-hidden"
>
  <LandingSectionTitle
    title="Behind it all"
    description="Meet the team, collaborators & donors who make Zapstore possible."
  />

  <!-- Team spread display -->
  <div class="team-spread-container">
    <!-- Left gradient fade -->
    <div
      class="absolute left-0 top-0 bottom-0 w-16 sm:w-24 md:w-32 lg:w-48 xl:w-64 z-20 pointer-events-none"
      style="background: linear-gradient(to right, hsl(var(--background)) 0%, hsl(var(--background) / 0.8) 30%, hsl(var(--background) / 0.4) 60%, transparent 100%);"
    ></div>

    <!-- Right gradient fade -->
    <div
      class="absolute right-0 top-0 bottom-0 w-16 sm:w-24 md:w-32 lg:w-48 xl:w-64 z-20 pointer-events-none"
      style="background: linear-gradient(to left, hsl(var(--background)) 0%, hsl(var(--background) / 0.8) 30%, hsl(var(--background) / 0.4) 60%, transparent 100%);"
    ></div>

    <div class="team-spread-scaler">
      <div class="team-spread">
        {#each teamMembers as member}
          {@const scale = member.size / 120}
          <div
            class="team-member"
            style="
              left: calc(50% + {member.x}px);
              top: calc(50% + {member.y}px);
              transform: translate(-50%, -50%) scale({scale});
              filter: blur({member.blur}px);
              opacity: {member.opacity};
            "
          >
            <!-- Profile pic - base 120px -->
            {#if member.image}
              <img src={member.image} alt={member.name} class="profile-pic" />
            {:else if member.isZapperSlot}
              {#if isLoading}
                <div class="profile-pic-skeleton">
                  <SkeletonLoader />
                </div>
              {:else}
                <div class="profile-pic-placeholder"></div>
              {/if}
            {:else}
              <div class="profile-pic-placeholder"></div>
            {/if}

            {#if member.name}
              <div class="member-info">
                <span class="member-name">{member.name}</span>
                {#if member.role}
                  <span class="member-role">{member.role}</span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Donate button anchored to bottom -->
  <button
    type="button"
    bind:this={donateButton}
    on:click={handleDonate}
    on:mousemove={handleDonateMouseMove}
    class="donate-button-bottom btn-glass-small btn-glass-blurple-hover flex items-center justify-center"
  >
    <span class="btn-text-white">Donate to Zapstore</span>
  </button>
</section>

<style>
  .team-spread-container {
    position: relative;
    overflow: hidden;
    margin-top: -12px;
    padding-bottom: 72px;
  }

  /* Scaler wrapper - keeps height mostly consistent, allows horizontal clipping */
  .team-spread-scaler {
    --scale: 0.94;
    width: 100%;
    height: 520px;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: visible;
  }

  .team-spread {
    position: relative;
    width: 1600px;
    height: 540px;
    flex-shrink: 0;
    transform: scale(var(--scale));
    transform-origin: center center;
  }

  .team-member {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    transform-origin: center center;
  }

  /* Base size 120px - scaled via transform */
  .profile-pic-placeholder {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background-color: hsl(var(--gray66));
    border: 2px solid hsl(var(--white8));
    flex-shrink: 0;
  }

  .profile-pic-skeleton {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid hsl(var(--white8));
    flex-shrink: 0;
    background-color: hsl(var(--gray66));
  }

  .profile-pic {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid hsl(var(--white8));
    flex-shrink: 0;
    opacity: 0.9;
    transition: opacity 0.2s ease;
  }

  .team-member:hover .profile-pic {
    opacity: 1;
  }

  .member-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 2px;
    width: 160px;
  }

  .member-name {
    font-size: 1.25rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    white-space: nowrap;
  }

  .member-role {
    font-size: 1rem;
    font-weight: 500;
    color: hsl(var(--white66));
    white-space: nowrap;
  }

  .donate-button-bottom {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    height: 48px !important;
    width: 360px !important;
    padding-bottom: 1px !important;
    font-size: 1rem;
    background-color: rgb(0 0 0 / 0.33) !important;
    border-top-left-radius: 24px !important;
    border-top-right-radius: 24px !important;
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
    border-bottom: none !important;
  }

  .donate-button-bottom:hover {
    transform: translateX(-50%) scale(1.04);
  }

  .donate-button-bottom:active {
    transform: translateX(-50%) scale(0.98);
  }

  .btn-text-white {
    transition: color 0.3s ease;
    color: hsl(var(--white66));
  }

  .donate-button-bottom:hover .btn-text-white {
    color: hsl(var(--foreground));
  }

  /* Blurple glass button hover effect */
  .btn-glass-blurple-hover {
    background: transparent;
    border-radius: 10px;
    transition:
      transform 0.2s ease,
      border-color 0.3s ease,
      box-shadow 0.3s ease,
      background 0.3s ease,
      color 0.3s ease;
  }

  .btn-glass-blurple-hover:hover {
    background: radial-gradient(
      circle at top left,
      rgb(92 95 255 / 0.12) 0%,
      rgb(69 66 255 / 0.12) 100%
    ) !important;
    border-color: rgb(92 95 255 / 0.35);
    box-shadow:
      0 0 40px rgb(92 95 255 / 0.15),
      0 0 80px rgb(92 95 255 / 0.08);
    color: hsl(var(--foreground));
  }

  @media (max-width: 639px) {
    .donate-button-bottom {
      width: 100% !important;
      left: 0;
      transform: none;
      border-radius: 0 !important;
      border-top-left-radius: 0 !important;
      border-top-right-radius: 0 !important;
      border-left: none !important;
      border-right: none !important;
    }

    .donate-button-bottom:hover {
      transform: none;
    }

    .donate-button-bottom:active {
      transform: none;
    }
  }

  /* Subtle height reduction, let sides clip naturally */
  @media (max-width: 1200px) {
    .team-spread-scaler {
      height: 500px;
      --scale: 0.92;
    }
  }

  @media (max-width: 900px) {
    .team-spread-scaler {
      height: 460px;
      --scale: 0.85;
    }
  }

  @media (max-width: 700px) {
    .team-spread-scaler {
      height: 380px;
      --scale: 0.72;
    }
  }

  @media (max-width: 500px) {
    .team-spread-scaler {
      height: 340px;
      --scale: 0.65;
    }
  }

  @media (max-width: 400px) {
    .team-spread-scaler {
      height: 300px;
      --scale: 0.58;
    }
  }
</style>
