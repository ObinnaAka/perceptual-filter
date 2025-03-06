/**
 * Platform-specific selectors for identifying feed and post elements
 */
import type { FeedSelectors } from "../types"

/**
 * Selectors for identifying feed and post elements on different platforms
 */
export const FEED_SELECTORS: FeedSelectors = {
	LINKEDIN: {
		FEED: "div.scaffold-finite-scroll__content, .feed-container",
		POST: "div.feed-shared-update-v2, div.update-components-actor, .feed-shared-update-v2__description-wrapper"
	},
	TWITTER: {
		FEED: '[data-testid="primaryColumn"], [aria-label="Timeline: Your Home Timeline"], main[role="main"]',
		POST: 'article[data-testid="tweet"], div[data-testid="cellInnerDiv"]'
	}
}

/**
 * Determines the current platform based on the hostname
 */
export function getCurrentPlatform(): "TWITTER" | "LINKEDIN" {
	const isTwitter =
		window.location.hostname.includes("twitter.com") ||
		window.location.hostname.includes("x.com")

	return isTwitter ? "TWITTER" : "LINKEDIN"
}

/**
 * Gets the selectors for the current platform
 */
export function getCurrentPlatformSelectors(): { FEED: string; POST: string } {
	return FEED_SELECTORS[getCurrentPlatform()]
} 