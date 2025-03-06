/**
 * Caching service for API responses and processed posts
 */
import type { PostData, ProcessedPostEntry } from "../types"
import { createPostHash } from "../utils/post"

/**
 * Cache for API responses
 */
export const apiCache = new Map<string, boolean>()

/**
 * Cache for processed posts
 */
export const processedPosts = new Map<string, ProcessedPostEntry>()

/**
 * Adds a post to the processed posts cache
 */
export function cacheProcessedPost(
	postData: PostData,
	result: Omit<ProcessedPostEntry, "processedAt">
): void {
	const postHash = createPostHash(postData)
	processedPosts.set(postHash, {
		...result,
		processedAt: Date.now()
	})
}

/**
 * Gets a processed post from the cache
 */
export function getProcessedPost(
	postData: PostData
): ProcessedPostEntry | undefined {
	const postHash = createPostHash(postData)
	return processedPosts.get(postHash)
}

/**
 * Checks if a post is in the processed posts cache
 */
export function isPostProcessed(postData: PostData): boolean {
	const postHash = createPostHash(postData)
	return processedPosts.has(postHash)
}

/**
 * Clears the processed posts cache
 */
export function clearProcessedPostsCache(): void {
	processedPosts.clear()
}

/**
 * Clears the API cache
 */
export function clearApiCache(): void {
	apiCache.clear()
}

/**
 * Clears all caches
 */
export function clearAllCaches(): void {
	clearProcessedPostsCache()
	clearApiCache()
} 