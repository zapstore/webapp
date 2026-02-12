<script>
  import LandingSectionTitle from "./LandingSectionTitle.svelte";
  import Selector from "../common/Selector.svelte";
  import ForumPost from "../ForumPost.svelte";
  import { wheelScroll } from "$lib/actions/wheelScroll.js";

  let selectedTab = "Forum";
  const tabs = ["Forum", "Articles", "Events", "Apps"];

  /** @param {string} tab */
  function handleTabSelect(tab) {
    selectedTab = tab;
    // TODO: Update content based on selected tab
  }

  function handleSeeMore() {
    // TODO: Navigate to community page
  }

  // Dummy forum posts data
  const dummyPosts = [
    {
      id: 1,
      author: {
        name: "Alice",
        picture: "",
        npub: "npub1alice123",
      },
      title: "Getting Started with Nostr Development",
      content:
        "I've been exploring Nostr for a few weeks now and wanted to share some tips for developers just starting out. The protocol is fascinating!",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      labels: ["Development", "Nostr", "Tutorial"],
    },
    {
      id: 2,
      author: {
        name: "Bob",
        picture: "",
        npub: "npub1bob456",
      },
      title: "New App Release: ZapStore v2.0",
      content:
        "We just released a major update with new features including better search, improved UI, and faster performance. Check it out!",
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
      labels: ["Release", "Update", "ZapStore"],
    },
    {
      id: 3,
      author: {
        name: "Charlie",
        picture: "",
        npub: "npub1charlie789",
      },
      title: "Community Feedback Needed",
      content:
        "What features would you like to see in the next update? We're collecting feedback from the community to prioritize our roadmap.",
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      labels: ["Feedback", "Feature Request", "Community"],
    },
    {
      id: 4,
      author: {
        name: "Diana",
        picture: "",
        npub: "npub1diana012",
      },
      title: "Best Practices for App Distribution",
      content:
        "Sharing some lessons learned from distributing apps on Nostr. The decentralized approach has its challenges but also unique advantages.",
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      labels: ["Distribution", "Best Practices", "Guide"],
    },
    {
      id: 5,
      author: {
        name: "Eve",
        picture: "",
        npub: "npub1eve345",
      },
      title: "Security Considerations",
      content:
        "Important security tips for developers building on Nostr. Always verify signatures and be careful with key management.",
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      labels: ["Security", "Development", "Tips"],
    },
    {
      id: 6,
      author: {
        name: "Frank",
        picture: "",
        npub: "npub1frank678",
      },
      title: "Upcoming Community Event",
      content:
        "Join us next week for a virtual meetup where we'll discuss the future of decentralized app distribution. All welcome!",
      timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
      labels: ["Event", "Community", "Meetup"],
    },
    {
      id: 7,
      author: {
        name: "Grace",
        picture: "",
        npub: "npub1grace901",
      },
      title: "New Developer Tools Available",
      content:
        "We've released a new SDK that makes it easier to integrate with ZapStore. Documentation and examples are now available.",
      timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      labels: ["Tools", "SDK", "Developer"],
    },
    {
      id: 8,
      author: {
        name: "Henry",
        picture: "",
        npub: "npub1henry234",
      },
      title: "Success Story: My First Nostr App",
      content:
        "Just launched my first app on ZapStore and wanted to share the journey. The community has been incredibly supportive!",
      timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
      labels: ["Success", "Story", "First App"],
    },
  ];

  // Organize posts into columns (2 posts per column)
  $: columns = (() => {
    const cols = [];
    const postsPerColumn = 2;
    for (let i = 0; i < dummyPosts.length; i += postsPerColumn) {
      cols.push(dummyPosts.slice(i, i + postsPerColumn));
    }
    return cols;
  })();

  /** @param {{ id: number; title: string }} post */
  function handlePostClick(post) {
    // TODO: Navigate to post detail page
    console.log("Post clicked:", post);
  }
</script>

<section class="border-t border-border/50 py-12 lg:py-16">
  <LandingSectionTitle
    title="Our Community"
    showSeeMore={true}
    seeMoreAction={handleSeeMore}
  />

  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="mt-2">
      <Selector
        options={tabs}
        selectedOption={selectedTab}
        onSelect={handleTabSelect}
        size="large"
      />
    </div>
  </div>

  {#if selectedTab === "Forum"}
    <!-- Scrolling container - starts at container breakpoint, extends to screen edge -->
    <div
      role="region"
      aria-label="Forum posts"
      class="w-full overflow-x-auto scrollbar-hide"
      use:wheelScroll
    >
      <div class="container mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-2">
        <div class="flex gap-6 -mr-4 sm:-mr-6 lg:-mr-8">
          {#each columns as column, columnIndex (columnIndex)}
            <div
              class="flex flex-col gap-6 flex-shrink-0"
              style="width: 400px;"
            >
              {#each column as post (post.id)}
                <ForumPost
                  author={post.author}
                  title={post.title}
                  content={post.content}
                  timestamp={post.timestamp}
                  labels={post.labels}
                  onClick={() => handlePostClick(post)}
                />
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <div class="container mx-auto px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mt-8">
        <!-- Content area for other tabs -->
        <div>
          <!-- TODO: Add content for {selectedTab} -->
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
