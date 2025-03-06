/**
 * Type definitions for the Social Post Blocker extension
 */

/**
 * Debug utilities interface
 */
export interface FeedlyDebug {
	forceReload: () => void
	inspectPost: (selector: string | Element) => void
	logState: () => void
	explainFilter: () => void
	refreshCategories: () => Promise<void>
	triggerCategoryUpdate: () => Promise<void>
	testCategoryStatus: () => string
	testStorageWatch: () => Promise<string>
	testMessageBasedUpdate: () => Promise<string>
}

/**
 * Data structure for post information
 */
export interface PostData {
	actorName?: string
	text?: string
	categories?: string[]
	tldr?: string
}

/**
 * Props for the FeedlyCover component
 */
export interface FeedlyCoverProps {
	postId: string
	categories: string[]
	tldr: string
	onUnmute: () => void
	matchedCategories?: string[]
}

/**
 * Status indicator types
 */
export type StatusType = "processing" | "processed" | "filtered" | "blocked"

/**
 * Platform-specific selectors for identifying feed and post elements
 */
export interface PlatformSelectors {
	FEED: string
	POST: string
}

/**
 * Feed selectors for different platforms
 */
export interface FeedSelectors {
	LINKEDIN: PlatformSelectors
	TWITTER: PlatformSelectors
}

/**
 * Content filter context interface
 */
export interface ContentFilterContextType {
	processPost: (container: Element) => Promise<void>
}

/**
 * Processed post cache entry
 */
export interface ProcessedPostEntry {
	categories: string[]
	tldr: string
	shouldBlock: boolean
	matchedCategories?: string[]
	processedAt: number
}

/**
 * User categories configuration
 */
export interface UserCategories {
	include: string[]
	exclude: string[]
}

// Declare global to extend Window interface
declare global {
	interface Window {
		__feedlyDebugMenuAdded?: boolean
		__feedlyLastClickedElement?: Element
		__feedlyDebug: FeedlyDebug
	}
} 