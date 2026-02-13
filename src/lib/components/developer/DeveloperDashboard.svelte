<script lang="js">
import { onMount } from "svelte";
import { nip19 } from "nostr-tools";
import { Options, Zap, Download, Home, Mail, List, ChevronDown } from "$lib/components/icons";
import AppPic from "$lib/components/common/AppPic.svelte";
import ProfilePic from "$lib/components/common/ProfilePic.svelte";
import { getCurrentPubkey } from "$lib/stores/auth.svelte.js";
import { createAppsQuery } from "$lib/stores/nostr.svelte.js";
import { encodeAppNaddr } from "$lib/nostr/models";
// Get current user's pubkey
const userPubkey = $derived(getCurrentPubkey());
// liveQuery-driven apps from Dexie
let allApps = $state([]);
$effect(() => {
    const sub = createAppsQuery().subscribe({
        next: (value) => { allApps = value; },
        error: (err) => console.error('[Dashboard] liveQuery error:', err)
    });
    return () => sub.unsubscribe();
});
// Filter apps by current user's pubkey
const userApps = $derived(userPubkey
    ? allApps.filter(app => app.pubkey === userPubkey)
    : []);
// Main nav items
const navItems = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "inbox", label: "Inbox", icon: Mail },
    { id: "tasks", label: "Tasks", icon: List },
];
let activeTab = $state("overview");
// Demo communities
const demoCommunities = [
    { name: "Nostr Devs", picture: null },
    { name: "Bitcoin Builders", picture: null },
    { name: "App Testers", picture: null },
];
// Colors
const colors = {
    downloads: "hsl(var(--blurpleColor))",
    zaps: "hsl(var(--goldColor))",
    apps: "hsl(var(--white33))"
};
// Demo stats
const totalDownloads = 2100;
const totalZaps = 31000;
onMount(() => {
    // Apps refresh via live relay subscriptions (started in root layout)
});
function generateAppChartData(appCount) {
    const data = {};
    for (let i = 0; i < appCount; i++) {
        const baseValue = 20 + Math.random() * 30;
        const growth = 0.5 + Math.random() * 1.5;
        data[i] = Array.from({ length: 30 }, (_, day) => {
            const noise = Math.sin(day * 0.5) * 10 + Math.random() * 8;
            return Math.max(5, Math.floor(baseValue + day * growth + noise));
        });
    }
    return data;
}
const chartData = $derived({
    downloads: Array.from({ length: 30 }, (_, i) => {
        const base = 40;
        const growth = i * 3;
        const wave = Math.sin(i * 0.3) * 15;
        return Math.floor(base + growth + wave + Math.random() * 10);
    }),
    zaps: Array.from({ length: 30 }, (_, i) => {
        const base = 500;
        const growth = i * 50;
        const wave = Math.sin(i * 0.4) * 200;
        return Math.floor(base + growth + wave + Math.random() * 100);
    }),
    apps: generateAppChartData(userApps.length || 3)
});
const chartHeight = 100;
const chartPadding = { left: 0, right: 16, top: 10, bottom: 10 };
const maxDownloads = $derived(Math.max(...(chartData.downloads || [100])) * 1.2);
const maxZaps = $derived(Math.max(...(chartData.zaps || [1000])) * 1.2);
function generateSmoothPath(data, maxValue, chartWidth, height) {
    if (!data || data.length === 0)
        return "";
    const graphHeight = height - chartPadding.top - chartPadding.bottom;
    const graphWidth = chartWidth - chartPadding.right;
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * graphWidth;
        const y = chartPadding.top + graphHeight - (val / maxValue) * graphHeight;
        return { x, y };
    });
    if (points.length < 2)
        return "";
    const first = points[0];
    if (!first)
        return "";
    let path = `M${first.x},${first.y}`;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        if (!prev || !curr)
            continue;
        const next = points[i + 1] ?? curr;
        const prevPrev = points[i - 2];
        const tensionFactor = 0.3;
        const cp1x = prev.x + (curr.x - (prevPrev?.x || prev.x)) * tensionFactor;
        const cp1y = prev.y + (curr.y - (prevPrev?.y || prev.y)) * tensionFactor;
        const cp2x = curr.x - (next.x - prev.x) * tensionFactor;
        const cp2y = curr.y - (next.y - prev.y) * tensionFactor;
        path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${curr.x},${curr.y}`;
    }
    return path;
}
function getEndPoint(data, maxValue, chartWidth, height) {
    if (!data || data.length === 0)
        return { x: 0, y: height / 2 };
    const graphHeight = height - chartPadding.top - chartPadding.bottom;
    const graphWidth = chartWidth - chartPadding.right;
    const lastVal = data[data.length - 1] ?? 0;
    return {
        x: graphWidth,
        y: chartPadding.top + graphHeight - (lastVal / maxValue) * graphHeight
    };
}
function formatSats(num) {
    if (num >= 1000000)
        return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000)
        return (num / 1000).toFixed(0) + "K";
    return num.toString();
}
function getAppUrl(app) {
    return `/apps/${encodeAppNaddr(app.pubkey, app.dTag)}`;
}
let downloadsChartWidth = $state(400);
let zapsChartWidth = $state(400);
</script>

<section class="developer-dashboard">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
    <div class="dashboard-layout">
      <!-- Left Sidebar Panel -->
      <aside class="sidebar-panel">
        <!-- Main Navigation -->
        <nav class="sidebar-nav">
          {#each navItems as item}
            <button
              type="button"
              class="nav-item {activeTab === item.id ? 'nav-item-active' : ''}"
              onclick={() => (activeTab = item.id)}
            >
              <item.icon
                variant="outline"
                size={18}
                color={activeTab === item.id ? "hsl(var(--foreground))" : "hsl(var(--white33))"}
              />
              <span>{item.label}</span>
            </button>
          {/each}
        </nav>

        <!-- Your Apps Section -->
        <div class="sidebar-section">
          <h4 class="sidebar-section-title">YOUR APPS</h4>
          {#if userApps.length === 0}
            <div class="sidebar-loading">No apps yet</div>
          {:else}
            <div class="sidebar-apps">
              {#each userApps as app}
                <a href={getAppUrl(app)} class="sidebar-app-item">
                  <div class="sidebar-app-icon">
                    <AppPic iconUrl={app.icon} name={app.name} size="xs" />
                  </div>
                  <span class="sidebar-app-name">{app.name}</span>
                </a>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Communities Section -->
        <div class="sidebar-section">
          <h4 class="sidebar-section-title">COMMUNITIES</h4>
          <div class="sidebar-communities">
            {#each demoCommunities as community}
              <button type="button" class="sidebar-community-item">
                <ProfilePic 
                  name={community.name}
                  size="xs"
                />
                <span class="sidebar-community-name">{community.name}</span>
              </button>
            {/each}
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="main-content">
        {#if activeTab === "overview"}
          <div class="content-stack">
            <!-- Downloads Chart -->
            <div class="chart-panel">
              <div class="chart-header">
                <div class="chart-header-left">
                  <span class="chart-title">Downloads</span>
                  <button type="button" class="period-dropdown">
                    <span>Last 30 days</span>
                    <ChevronDown variant="outline" size={12} color="hsl(var(--white33))" />
                  </button>
                </div>
                <div class="chart-header-right">
                  <Download variant="outline" size={20} color="hsl(var(--white33))" />
                  <span class="chart-total">{totalDownloads.toLocaleString()}</span>
                </div>
              </div>
              <div class="chart-wrapper" bind:clientWidth={downloadsChartWidth}>
                <svg 
                  viewBox="0 0 {downloadsChartWidth} {chartHeight}" 
                  class="chart-svg" 
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id="downloadsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style="stop-color: hsl(var(--blurpleColor)); stop-opacity: 0.25" />
                      <stop offset="100%" style="stop-color: hsl(var(--blurpleColor)); stop-opacity: 0" />
                    </linearGradient>
                  </defs>
                  
                  {#if chartData}
                    {@const graphWidth = downloadsChartWidth - chartPadding.right}
                    <line 
                      x1={graphWidth} 
                      y1={chartPadding.top} 
                      x2={graphWidth} 
                      y2={chartHeight - chartPadding.bottom} 
                      stroke="hsl(var(--white11))" 
                      stroke-width="1"
                    />

                    {#each userApps.slice(0, 3) as app, i}
                      {@const appData = chartData.apps[i] ?? chartData.apps[0] ?? []}
                      {@const appEndPoint = getEndPoint(appData, maxDownloads, downloadsChartWidth, chartHeight)}
                      <path
                        d={generateSmoothPath(appData, maxDownloads, downloadsChartWidth, chartHeight)}
                        fill="none"
                        stroke={colors.apps}
                        stroke-width="1.5"
                        stroke-linecap="round"
                      />
                      <g transform="translate({appEndPoint.x - 8}, {appEndPoint.y - 8})">
                        <clipPath id="dlAppClip{i}">
                          <circle cx="8" cy="8" r="8" />
                        </clipPath>
                        <circle cx="8" cy="8" r="8" fill="hsl(var(--background))" stroke={colors.apps} stroke-width="1.5" />
                        {#if app.icon}
                          <image 
                            href={app.icon} 
                            x="2" y="2" width="12" height="12" 
                            clip-path="url(#dlAppClip{i})"
                            preserveAspectRatio="xMidYMid slice"
                          />
                        {/if}
                      </g>
                    {/each}

                    {@const downloadsPath = generateSmoothPath(chartData.downloads, maxDownloads, downloadsChartWidth, chartHeight)}
                    {@const downloadsEndPoint = getEndPoint(chartData.downloads, maxDownloads, downloadsChartWidth, chartHeight)}
                    <path
                      d="{downloadsPath} L{graphWidth},{chartHeight - chartPadding.bottom} L0,{chartHeight - chartPadding.bottom} Z"
                      fill="url(#downloadsGradient)"
                    />
                    <path
                      d={downloadsPath}
                      fill="none"
                      stroke={colors.downloads}
                      stroke-width="2.5"
                      stroke-linecap="round"
                    />
                    <circle
                      cx={downloadsEndPoint.x}
                      cy={downloadsEndPoint.y}
                      r="5"
                      fill={colors.downloads}
                    />
                  {/if}
                </svg>
              </div>
            </div>

            <!-- Zaps Chart -->
            <div class="chart-panel">
              <div class="chart-header">
                <div class="chart-header-left">
                  <span class="chart-title">Zaps</span>
                  <button type="button" class="period-dropdown">
                    <span>Last 30 days</span>
                    <ChevronDown variant="outline" size={12} color="hsl(var(--white33))" />
                  </button>
                </div>
                <div class="chart-header-right">
                  <span class="zap-icon-wrapper">
                    <Zap variant="fill" size={20} color="hsl(var(--goldColor66))" />
                  </span>
                  <span class="chart-total">{formatSats(totalZaps)}</span>
                </div>
              </div>
              <div class="chart-wrapper" bind:clientWidth={zapsChartWidth}>
                <svg 
                  viewBox="0 0 {zapsChartWidth} {chartHeight}" 
                  class="chart-svg" 
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id="zapsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style="stop-color: hsl(var(--goldColor)); stop-opacity: 0.25" />
                      <stop offset="100%" style="stop-color: hsl(var(--goldColor)); stop-opacity: 0" />
                    </linearGradient>
                  </defs>
                  
                  {#if chartData}
                    {@const graphWidth = zapsChartWidth - chartPadding.right}
                    <line 
                      x1={graphWidth} 
                      y1={chartPadding.top} 
                      x2={graphWidth} 
                      y2={chartHeight - chartPadding.bottom} 
                      stroke="hsl(var(--white11))" 
                      stroke-width="1"
                    />

                    {@const zapsPath = generateSmoothPath(chartData.zaps, maxZaps, zapsChartWidth, chartHeight)}
                    {@const zapsEndPoint = getEndPoint(chartData.zaps, maxZaps, zapsChartWidth, chartHeight)}
                    <path
                      d="{zapsPath} L{graphWidth},{chartHeight - chartPadding.bottom} L0,{chartHeight - chartPadding.bottom} Z"
                      fill="url(#zapsGradient)"
                    />
                    <path
                      d={zapsPath}
                      fill="none"
                      stroke={colors.zaps}
                      stroke-width="2.5"
                      stroke-linecap="round"
                    />
                    <circle
                      cx={zapsEndPoint.x}
                      cy={zapsEndPoint.y}
                      r="5"
                      fill={colors.zaps}
                    />
                  {/if}
                </svg>
              </div>
            </div>
          </div>
        {:else if activeTab === "inbox"}
          <div class="tab-content-placeholder">
            <p class="text-muted-foreground">Inbox coming soon...</p>
          </div>
        {:else if activeTab === "tasks"}
          <div class="tab-content-placeholder">
            <p class="text-muted-foreground">Tasks coming soon...</p>
          </div>
        {/if}
      </main>
    </div>
  </div>
</section>

<style>
  .developer-dashboard {
    min-height: 100vh;
  }

  /* Dashboard Layout - Sidebar + Content */
  .dashboard-layout {
    display: flex;
    gap: 20px;
  }

  /* Sidebar Panel */
  .sidebar-panel {
    width: 200px;
    flex-shrink: 0;
    background: hsl(var(--gray33));
    border-radius: 16px;
    padding: 12px;
    height: fit-content;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--white66));
    background: transparent;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .nav-item:hover {
    background: hsl(var(--white8));
    color: hsl(var(--foreground));
  }

  .nav-item-active {
    background: hsl(var(--white11));
    color: hsl(var(--foreground));
  }

  /* Sidebar Sections */
  .sidebar-section {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid hsl(var(--white11));
  }

  .sidebar-section-title {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: hsl(var(--white44));
    margin-bottom: 10px;
    padding: 0 12px;
  }

  .sidebar-loading {
    padding: 8px 12px;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
  }

  /* Sidebar Apps */
  .sidebar-apps {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sidebar-app-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    transition: all 0.15s ease;
  }

  .sidebar-app-item:hover {
    background: hsl(var(--white8));
  }

  .sidebar-app-icon {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .sidebar-app-name {
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--white66));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-app-item:hover .sidebar-app-name {
    color: hsl(var(--foreground));
  }

  /* Sidebar Communities */
  .sidebar-communities {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sidebar-community-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .sidebar-community-item:hover {
    background: hsl(var(--white8));
  }

  .sidebar-community-name {
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--white66));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-community-item:hover .sidebar-community-name {
    color: hsl(var(--foreground));
  }

  /* Main Content */
  .main-content {
    flex: 1;
    min-width: 0;
  }

  .content-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .tab-content-placeholder {
    padding: 48px 24px;
    text-align: center;
    background: hsl(var(--gray33));
    border-radius: 16px;
  }

  /* Chart Panel */
  .chart-panel {
    background: hsl(var(--gray33));
    border-radius: 16px;
    padding: 16px 20px;
  }

  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .chart-header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .chart-title {
    font-size: 18px;
    font-weight: 600;
    color: hsl(var(--white66));
  }

  .period-dropdown {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    font-size: 11px;
    font-weight: 400;
    color: hsl(var(--white33));
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .period-dropdown:hover {
    color: hsl(var(--white66));
  }

  .chart-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chart-total {
    font-size: 20px;
    font-weight: 700;
    color: hsl(var(--foreground));
  }

  .zap-icon-wrapper {
    display: flex;
    align-items: center;
  }

  /* Chart */
  .chart-wrapper {
    width: 100%;
    overflow: visible;
  }

  .chart-svg {
    width: 100%;
    height: auto;
    min-height: 100px;
  }

  /* Mobile: Stack layout */
  @media (max-width: 768px) {
    .dashboard-layout {
      flex-direction: column;
      gap: 16px;
    }

    .sidebar-panel {
      width: 100%;
    }

    .sidebar-nav {
      flex-direction: row;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .sidebar-nav::-webkit-scrollbar {
      display: none;
    }

    .nav-item {
      flex-shrink: 0;
      padding: 8px 12px;
      font-size: 13px;
    }

    .sidebar-section {
      border-top: none;
      margin-top: 12px;
      padding-top: 0;
    }

    .sidebar-apps,
    .sidebar-communities {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 4px;
    }

    .sidebar-app-item,
    .sidebar-community-item {
      flex-shrink: 0;
    }
  }
</style>
