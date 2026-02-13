/**
 * Emoji Search Service
 *
 * Provides emoji search functionality with:
 * - Unicode emojis (built-in)
 * - Custom emojis from user's emoji list (kind 10030)
 * - Custom emoji sets (kind 30030)
 *
 * Based on Grimoire's implementation
 */
import { queryEvents } from '$lib/nostr';
import { DEFAULT_SOCIAL_RELAYS } from '$lib/config';
const KIND_USER_EMOJI_LIST = 10030;
const KIND_EMOJI_SET = 30030;
// Common Unicode emojis with shortcode mappings
// Based on common shortcodes used across platforms (Slack, Discord, GitHub)
export const UNICODE_EMOJIS = [
    // Smileys & Emotion
    { shortcode: 'smile', emoji: '\u{1F604}' },
    { shortcode: 'grinning', emoji: '\u{1F600}' },
    { shortcode: 'joy', emoji: '\u{1F602}' },
    { shortcode: 'rofl', emoji: '\u{1F923}' },
    { shortcode: 'smiley', emoji: '\u{1F603}' },
    { shortcode: 'sweat_smile', emoji: '\u{1F605}' },
    { shortcode: 'laughing', emoji: '\u{1F606}' },
    { shortcode: 'wink', emoji: '\u{1F609}' },
    { shortcode: 'blush', emoji: '\u{1F60A}' },
    { shortcode: 'yum', emoji: '\u{1F60B}' },
    { shortcode: 'sunglasses', emoji: '\u{1F60E}' },
    { shortcode: 'heart_eyes', emoji: '\u{1F60D}' },
    { shortcode: 'kissing_heart', emoji: '\u{1F618}' },
    { shortcode: 'kissing', emoji: '\u{1F617}' },
    { shortcode: 'relaxed', emoji: '\u{263A}\u{FE0F}' },
    { shortcode: 'stuck_out_tongue', emoji: '\u{1F61B}' },
    { shortcode: 'stuck_out_tongue_winking_eye', emoji: '\u{1F61C}' },
    { shortcode: 'stuck_out_tongue_closed_eyes', emoji: '\u{1F61D}' },
    { shortcode: 'money_mouth_face', emoji: '\u{1F911}' },
    { shortcode: 'hugs', emoji: '\u{1F917}' },
    { shortcode: 'nerd_face', emoji: '\u{1F913}' },
    { shortcode: 'smirk', emoji: '\u{1F60F}' },
    { shortcode: 'unamused', emoji: '\u{1F612}' },
    { shortcode: 'disappointed', emoji: '\u{1F61E}' },
    { shortcode: 'pensive', emoji: '\u{1F614}' },
    { shortcode: 'worried', emoji: '\u{1F61F}' },
    { shortcode: 'confused', emoji: '\u{1F615}' },
    { shortcode: 'slightly_frowning_face', emoji: '\u{1F641}' },
    { shortcode: 'frowning_face', emoji: '\u{2639}\u{FE0F}' },
    { shortcode: 'persevere', emoji: '\u{1F623}' },
    { shortcode: 'confounded', emoji: '\u{1F616}' },
    { shortcode: 'tired_face', emoji: '\u{1F62B}' },
    { shortcode: 'weary', emoji: '\u{1F629}' },
    { shortcode: 'cry', emoji: '\u{1F622}' },
    { shortcode: 'sob', emoji: '\u{1F62D}' },
    { shortcode: 'triumph', emoji: '\u{1F624}' },
    { shortcode: 'angry', emoji: '\u{1F620}' },
    { shortcode: 'rage', emoji: '\u{1F621}' },
    { shortcode: 'no_mouth', emoji: '\u{1F636}' },
    { shortcode: 'neutral_face', emoji: '\u{1F610}' },
    { shortcode: 'expressionless', emoji: '\u{1F611}' },
    { shortcode: 'hushed', emoji: '\u{1F62F}' },
    { shortcode: 'flushed', emoji: '\u{1F633}' },
    { shortcode: 'astonished', emoji: '\u{1F632}' },
    { shortcode: 'open_mouth', emoji: '\u{1F62E}' },
    { shortcode: 'scream', emoji: '\u{1F631}' },
    { shortcode: 'fearful', emoji: '\u{1F628}' },
    { shortcode: 'cold_sweat', emoji: '\u{1F630}' },
    { shortcode: 'disappointed_relieved', emoji: '\u{1F625}' },
    { shortcode: 'sweat', emoji: '\u{1F613}' },
    { shortcode: 'sleeping', emoji: '\u{1F634}' },
    { shortcode: 'sleepy', emoji: '\u{1F62A}' },
    { shortcode: 'dizzy_face', emoji: '\u{1F635}' },
    { shortcode: 'zipper_mouth_face', emoji: '\u{1F910}' },
    { shortcode: 'mask', emoji: '\u{1F637}' },
    { shortcode: 'thermometer_face', emoji: '\u{1F912}' },
    { shortcode: 'head_bandage', emoji: '\u{1F915}' },
    { shortcode: 'thinking', emoji: '\u{1F914}' },
    { shortcode: 'rolling_eyes', emoji: '\u{1F644}' },
    { shortcode: 'upside_down_face', emoji: '\u{1F643}' },
    { shortcode: 'face_with_hand_over_mouth', emoji: '\u{1F92D}' },
    { shortcode: 'shushing_face', emoji: '\u{1F92B}' },
    { shortcode: 'exploding_head', emoji: '\u{1F92F}' },
    { shortcode: 'cowboy_hat_face', emoji: '\u{1F920}' },
    { shortcode: 'partying_face', emoji: '\u{1F973}' },
    { shortcode: 'woozy_face', emoji: '\u{1F974}' },
    { shortcode: 'pleading_face', emoji: '\u{1F97A}' },
    { shortcode: 'skull', emoji: '\u{1F480}' },
    // Gestures & Body
    { shortcode: 'thumbsup', emoji: '\u{1F44D}' },
    { shortcode: '+1', emoji: '\u{1F44D}' },
    { shortcode: 'thumbsdown', emoji: '\u{1F44E}' },
    { shortcode: '-1', emoji: '\u{1F44E}' },
    { shortcode: 'ok_hand', emoji: '\u{1F44C}' },
    { shortcode: 'punch', emoji: '\u{1F44A}' },
    { shortcode: 'fist', emoji: '\u{270A}' },
    { shortcode: 'wave', emoji: '\u{1F44B}' },
    { shortcode: 'hand', emoji: '\u{270B}' },
    { shortcode: 'open_hands', emoji: '\u{1F450}' },
    { shortcode: 'point_up', emoji: '\u{261D}\u{FE0F}' },
    { shortcode: 'point_down', emoji: '\u{1F447}' },
    { shortcode: 'point_left', emoji: '\u{1F448}' },
    { shortcode: 'point_right', emoji: '\u{1F449}' },
    { shortcode: 'clap', emoji: '\u{1F44F}' },
    { shortcode: 'pray', emoji: '\u{1F64F}' },
    { shortcode: 'muscle', emoji: '\u{1F4AA}' },
    { shortcode: 'metal', emoji: '\u{1F918}' },
    { shortcode: 'crossed_fingers', emoji: '\u{1F91E}' },
    { shortcode: 'v', emoji: '\u{270C}\u{FE0F}' },
    { shortcode: 'love_you_gesture', emoji: '\u{1F91F}' },
    { shortcode: 'call_me_hand', emoji: '\u{1F919}' },
    { shortcode: 'raised_back_of_hand', emoji: '\u{1F91A}' },
    { shortcode: 'handshake', emoji: '\u{1F91D}' },
    { shortcode: 'writing_hand', emoji: '\u{270D}\u{FE0F}' },
    { shortcode: 'eyes', emoji: '\u{1F440}' },
    { shortcode: 'eye', emoji: '\u{1F441}\u{FE0F}' },
    { shortcode: 'brain', emoji: '\u{1F9E0}' },
    // Hearts & Symbols
    { shortcode: 'heart', emoji: '\u{2764}\u{FE0F}' },
    { shortcode: 'red_heart', emoji: '\u{2764}\u{FE0F}' },
    { shortcode: 'orange_heart', emoji: '\u{1F9E1}' },
    { shortcode: 'yellow_heart', emoji: '\u{1F49B}' },
    { shortcode: 'green_heart', emoji: '\u{1F49A}' },
    { shortcode: 'blue_heart', emoji: '\u{1F499}' },
    { shortcode: 'purple_heart', emoji: '\u{1F49C}' },
    { shortcode: 'black_heart', emoji: '\u{1F5A4}' },
    { shortcode: 'broken_heart', emoji: '\u{1F494}' },
    { shortcode: 'two_hearts', emoji: '\u{1F495}' },
    { shortcode: 'sparkling_heart', emoji: '\u{1F496}' },
    { shortcode: 'heartpulse', emoji: '\u{1F497}' },
    { shortcode: 'heartbeat', emoji: '\u{1F493}' },
    { shortcode: 'fire', emoji: '\u{1F525}' },
    { shortcode: 'star', emoji: '\u{2B50}' },
    { shortcode: 'star2', emoji: '\u{1F31F}' },
    { shortcode: 'sparkles', emoji: '\u{2728}' },
    { shortcode: 'zap', emoji: '\u{26A1}' },
    { shortcode: 'boom', emoji: '\u{1F4A5}' },
    { shortcode: '100', emoji: '\u{1F4AF}' },
    { shortcode: 'checkmark', emoji: '\u{2714}\u{FE0F}' },
    { shortcode: 'white_check_mark', emoji: '\u{2705}' },
    { shortcode: 'x', emoji: '\u{274C}' },
    { shortcode: 'question', emoji: '\u{2753}' },
    { shortcode: 'exclamation', emoji: '\u{2757}' },
    { shortcode: 'warning', emoji: '\u{26A0}\u{FE0F}' },
    // Animals
    { shortcode: 'dog', emoji: '\u{1F436}' },
    { shortcode: 'cat', emoji: '\u{1F431}' },
    { shortcode: 'mouse', emoji: '\u{1F42D}' },
    { shortcode: 'rabbit', emoji: '\u{1F430}' },
    { shortcode: 'bear', emoji: '\u{1F43B}' },
    { shortcode: 'panda_face', emoji: '\u{1F43C}' },
    { shortcode: 'lion', emoji: '\u{1F981}' },
    { shortcode: 'pig', emoji: '\u{1F437}' },
    { shortcode: 'frog', emoji: '\u{1F438}' },
    { shortcode: 'monkey_face', emoji: '\u{1F435}' },
    { shortcode: 'see_no_evil', emoji: '\u{1F648}' },
    { shortcode: 'hear_no_evil', emoji: '\u{1F649}' },
    { shortcode: 'speak_no_evil', emoji: '\u{1F64A}' },
    { shortcode: 'chicken', emoji: '\u{1F414}' },
    { shortcode: 'penguin', emoji: '\u{1F427}' },
    { shortcode: 'bird', emoji: '\u{1F426}' },
    { shortcode: 'eagle', emoji: '\u{1F985}' },
    { shortcode: 'duck', emoji: '\u{1F986}' },
    { shortcode: 'owl', emoji: '\u{1F989}' },
    { shortcode: 'bat', emoji: '\u{1F987}' },
    { shortcode: 'wolf', emoji: '\u{1F43A}' },
    { shortcode: 'fox_face', emoji: '\u{1F98A}' },
    { shortcode: 'unicorn', emoji: '\u{1F984}' },
    { shortcode: 'bee', emoji: '\u{1F41D}' },
    { shortcode: 'bug', emoji: '\u{1F41B}' },
    { shortcode: 'butterfly', emoji: '\u{1F98B}' },
    { shortcode: 'snail', emoji: '\u{1F40C}' },
    { shortcode: 'turtle', emoji: '\u{1F422}' },
    { shortcode: 'snake', emoji: '\u{1F40D}' },
    { shortcode: 'dragon', emoji: '\u{1F409}' },
    { shortcode: 'octopus', emoji: '\u{1F419}' },
    { shortcode: 'whale', emoji: '\u{1F433}' },
    { shortcode: 'dolphin', emoji: '\u{1F42C}' },
    { shortcode: 'shark', emoji: '\u{1F988}' },
    { shortcode: 'crab', emoji: '\u{1F980}' },
    { shortcode: 'shrimp', emoji: '\u{1F990}' },
    // Food & Drink (abbreviated for brevity - full list available in website version)
    { shortcode: 'apple', emoji: '\u{1F34E}' },
    { shortcode: 'pizza', emoji: '\u{1F355}' },
    { shortcode: 'hamburger', emoji: '\u{1F354}' },
    { shortcode: 'coffee', emoji: '\u{2615}' },
    { shortcode: 'beer', emoji: '\u{1F37A}' },
    // Activities & Objects (abbreviated)
    { shortcode: 'trophy', emoji: '\u{1F3C6}' },
    { shortcode: 'guitar', emoji: '\u{1F3B8}' },
    { shortcode: 'computer', emoji: '\u{1F4BB}' },
    { shortcode: 'rocket', emoji: '\u{1F680}' }
];
/** Instant default emojis for empty query (no async). Show as soon as user types ":". */
export const DEFAULT_EMOJIS = UNICODE_EMOJIS.slice(0, 24).map((e) => ({
    shortcode: e.shortcode,
    url: e.emoji,
    source: 'unicode'
}));
/**
 * Extract emoji tags from a Nostr event
 */
function getEmojiTags(event) {
    if (!event || !event.tags)
        return [];
    return event.tags
        .filter((tag) => tag[0] === 'emoji' && tag[1] && tag[2])
        .map((tag) => ({
        shortcode: tag[1],
        url: tag[2]
    }));
}
/**
 * Creates an emoji search service for a given user
 */
export function createEmojiSearch(userPubkey = null) {
    // Map of shortcode -> emoji data
    const emojis = new Map();
    let isInitialized = false;
    let initPromise = null;
    // Add Unicode emojis immediately
    for (const e of UNICODE_EMOJIS) {
        emojis.set(e.shortcode.toLowerCase(), {
            shortcode: e.shortcode,
            url: e.emoji,
            source: 'unicode'
        });
    }
    /**
     * Add a custom emoji (from kind 10030 or 30030)
     */
    function addEmoji(shortcode, url, source = 'custom') {
        const normalized = shortcode.toLowerCase().replace(/^:|:$/g, '');
        // User emojis have priority over sets, and both have priority over unicode
        const existing = emojis.get(normalized);
        if (existing) {
            if (existing.source === 'user' && source !== 'user') {
                return; // Don't overwrite user emojis
            }
            if (existing.source !== 'unicode' && source === 'unicode') {
                return; // Don't overwrite custom with unicode
            }
        }
        emojis.set(normalized, {
            shortcode: normalized,
            url,
            source
        });
    }
    /**
     * Add emojis from user's emoji list (kind 10030)
     */
    function addUserEmojiList(event) {
        if (!event || event.kind !== KIND_USER_EMOJI_LIST)
            return;
        const emojiTags = getEmojiTags(event);
        for (const emoji of emojiTags) {
            addEmoji(emoji.shortcode, emoji.url, 'user');
        }
        console.log('[EmojiSearch] Added', emojiTags.length, 'user emojis from kind 10030');
    }
    /**
     * Add emojis from an emoji set (kind 30030)
     */
    function addEmojiSet(event) {
        if (!event || event.kind !== KIND_EMOJI_SET)
            return;
        const identifier = event.tags.find((t) => t[0] === 'd')?.[1] || 'unnamed';
        const emojiTags = getEmojiTags(event);
        for (const emoji of emojiTags) {
            addEmoji(emoji.shortcode, emoji.url, `set:${identifier}`);
        }
        console.log('[EmojiSearch] Added', emojiTags.length, 'emojis from set:', identifier);
    }
    /**
     * Initialize the service by loading user's custom emojis
     */
    async function init() {
        if (isInitialized)
            return;
        if (initPromise)
            return initPromise;
        if (!userPubkey) {
            isInitialized = true;
            return;
        }
        initPromise = (async () => {
            try {
                console.log('[EmojiSearch] Initializing for user:', userPubkey);
                // Fetch user's emoji list (kind 10030)
                const emojiListFilter = {
                    kinds: [KIND_USER_EMOJI_LIST],
                    authors: [userPubkey],
                    limit: 1
                };
                const userEmojiListEvents = await queryEvents(emojiListFilter);
                // Fetch user's emoji sets (kind 30030)
                const emojiSetFilter = {
                    kinds: [KIND_EMOJI_SET],
                    authors: [userPubkey],
                    limit: 50
                };
                const userEmojiSets = await queryEvents(emojiSetFilter);
                // Process user emoji list
                if (userEmojiListEvents && userEmojiListEvents.length > 0) {
                    const userEmojiList = userEmojiListEvents[0];
                    addUserEmojiList(userEmojiList);
                    // Also fetch referenced emoji sets from "a" tags
                    const aTags = userEmojiList.tags.filter((t) => t[0] === 'a' && t[1]?.startsWith('30030:'));
                    if (aTags.length > 0) {
                        console.log('[EmojiSearch] Found', aTags.length, 'referenced emoji sets');
                        // Fetch referenced emoji sets
                        const setCoordinates = aTags
                            .map((t) => {
                            const coordinate = t[1];
                            const parts = coordinate.split(':');
                            return { kind: parseInt(parts[0]), pubkey: parts[1], identifier: parts[2] };
                        })
                            .filter((c) => c.kind && c.pubkey && c.identifier !== undefined);
                        // Fetch each referenced set
                        for (const coord of setCoordinates) {
                            try {
                                const setFilter = {
                                    kinds: [coord.kind],
                                    authors: [coord.pubkey],
                                    '#d': [coord.identifier],
                                    limit: 1
                                };
                                const setEvents = await queryEvents(setFilter);
                                if (setEvents && setEvents.length > 0) {
                                    addEmojiSet(setEvents[0]);
                                }
                            }
                            catch (e) {
                                console.warn('[EmojiSearch] Failed to fetch emoji set:', coord, e);
                            }
                        }
                    }
                }
                // Process user's own emoji sets
                if (userEmojiSets && userEmojiSets.length > 0) {
                    console.log('[EmojiSearch] Found', userEmojiSets.length, 'user-authored emoji sets');
                    for (const setEvent of userEmojiSets) {
                        addEmojiSet(setEvent);
                    }
                }
                console.log('[EmojiSearch] Total emojis:', emojis.size);
                isInitialized = true;
            }
            catch (err) {
                console.error('[EmojiSearch] Init error:', err);
                isInitialized = true;
            }
        })();
        return initPromise;
    }
    /**
     * Search emojis by shortcode
     */
    async function search(query) {
        // Ensure initialized
        await init();
        if (!query || query.length < 1) {
            // Return a mix: user emojis first, then custom, then unicode (common emoji for new users)
            const results = [];
            const userEmojis = [];
            const customEmojis = [];
            const unicodeEmojis = [];
            for (const emoji of emojis.values()) {
                if (emoji.source === 'user') {
                    userEmojis.push(emoji);
                }
                else if (emoji.source !== 'unicode') {
                    customEmojis.push(emoji);
                }
                else {
                    unicodeEmojis.push(emoji);
                }
            }
            // Prioritize: user > custom sets > unicode; when no user/custom, show more common unicode
            const unicodeLimit = userEmojis.length + customEmojis.length > 0 ? 6 : 20;
            return [
                ...userEmojis.slice(0, 12),
                ...customEmojis.slice(0, 6),
                ...unicodeEmojis.slice(0, unicodeLimit)
            ].slice(0, 24);
        }
        const normalizedQuery = query.toLowerCase().replace(/^:|:$/g, '');
        // Filter emojis that match the query
        const matches = [];
        for (const emoji of emojis.values()) {
            if (emoji.shortcode.includes(normalizedQuery)) {
                matches.push(emoji);
            }
        }
        // Sort by relevance and source priority
        matches.sort((a, b) => {
            // Source priority
            const aPriority = a.source === 'user' ? 0 : a.source === 'unicode' ? 2 : 1;
            const bPriority = b.source === 'user' ? 0 : b.source === 'unicode' ? 2 : 1;
            if (aPriority !== bPriority)
                return aPriority - bPriority;
            // Then by match position (starts with > contains)
            const aStarts = a.shortcode.startsWith(normalizedQuery);
            const bStarts = b.shortcode.startsWith(normalizedQuery);
            if (aStarts && !bStarts)
                return -1;
            if (!aStarts && bStarts)
                return 1;
            return a.shortcode.localeCompare(b.shortcode);
        });
        return matches.slice(0, 24);
    }
    /**
     * Get total number of emojis
     */
    function getCount() {
        return emojis.size;
    }
    return { init, search, addEmoji, addUserEmojiList, addEmojiSet, getCount };
}
// Cache for emoji search instances per user
const emojiSearchCache = new Map();
/**
 * Gets or creates an emoji search service for a user
 */
export function getEmojiSearch(userPubkey = null) {
    const cacheKey = userPubkey || '__anonymous__';
    if (!emojiSearchCache.has(cacheKey)) {
        const service = createEmojiSearch(userPubkey);
        emojiSearchCache.set(cacheKey, service);
    }
    return emojiSearchCache.get(cacheKey);
}
/**
 * Clear the emoji search cache (call when user logs out)
 */
export function clearEmojiSearchCache() {
    emojiSearchCache.clear();
}
/**
 * Convenience function to create a search function for use with CommentInput.
 * Empty query returns instantly with DEFAULT_EMOJIS; otherwise runs async search.
 */
export function createSearchEmojisFunction(userPubkey = null) {
    const service = getEmojiSearch(userPubkey);
    return async (query) => {
        if (!query?.trim())
            return DEFAULT_EMOJIS;
        return service.search(query);
    };
}
/**
 * Simple search function that uses Unicode emojis only (no user context)
 */
export async function searchEmojis(query) {
    const service = getEmojiSearch();
    return service.search(query);
}
