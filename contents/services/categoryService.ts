/**
 * Category Service
 * 
 * Manages user categories and category-related functionality
 */
import { Storage } from "@plasmohq/storage"
import type { UserCategories } from "../types"

const storage = new Storage()

// Track when categories were last updated
let lastCategoriesUpdate = Date.now()
let categoriesUpdatedDirty = false

/**
 * Verifies and maintains the integrity of user categories
 */
export async function verifyUserCategories(): Promise<UserCategories> {
	console.log("🔍 [Categories] Verifying configuration...")

	try {
		const userCategoriesRaw = (await storage.get<{
			include: string[] | Set<string> | unknown
			exclude: string[] | Set<string> | unknown
		}>("user-categories")) || { include: [], exclude: [] }

		let userCategories: UserCategories = {
			include: [],
			exclude: []
		}

		if (!userCategoriesRaw) {
			console.log("⚠️ [Categories] None found, setting defaults")
			userCategories = { include: [], exclude: [] }
		} else {
			userCategories = {
				include: Array.isArray(userCategoriesRaw.include)
					? userCategoriesRaw.include
					: userCategoriesRaw.include instanceof Set
						? Array.from(userCategoriesRaw.include as Set<string>)
						: [],
				exclude: Array.isArray(userCategoriesRaw.exclude)
					? userCategoriesRaw.exclude
					: userCategoriesRaw.exclude instanceof Set
						? Array.from(userCategoriesRaw.exclude as Set<string>)
						: []
			}
		}

		// Validate and store clean data
		await storage.set(
			"user-categories",
			JSON.parse(JSON.stringify(userCategories))
		)

		console.log("✅ [Categories] Verified configuration:", userCategories)
		return userCategories
	} catch (error) {
		console.error("❌ [Categories] Error verifying:", error)
		const defaults = { include: [], exclude: [] }
		await storage.set("user-categories", defaults)
		return defaults
	}
}

/**
 * Updates the last categories update timestamp
 */
export async function updateCategoriesTimestamp(): Promise<void> {
	lastCategoriesUpdate = Date.now()
	await storage.set("categories-updated", lastCategoriesUpdate)
	categoriesUpdatedDirty = true
}

/**
 * Gets the last categories update timestamp
 */
export function getLastCategoriesUpdate(): number {
	return lastCategoriesUpdate
}

/**
 * Sets the categories updated dirty flag
 */
export function setCategoriesUpdatedDirty(value: boolean): void {
	categoriesUpdatedDirty = value
}

/**
 * Gets the categories updated dirty flag
 */
export function getCategoriesUpdatedDirty(): boolean {
	return categoriesUpdatedDirty
}

/**
 * Checks visible posts for updates after category changes
 */
export function checkVisiblePostsForUpdate(): void {
	if (!categoriesUpdatedDirty) {
		return
	}

	console.log("🔍 [Categories] Checking visible posts for updates")

	const platform =
		window.location.hostname.includes("twitter.com") ||
			window.location.hostname.includes("x.com")
			? "TWITTER"
			: "LINKEDIN"

	// Import dynamically to avoid circular dependencies
	import("../config/selectors").then(({ FEED_SELECTORS }) => {
		const feed = document.querySelector(FEED_SELECTORS[platform].FEED)
		if (!feed) {
			return
		}

		const allPosts = feed.querySelectorAll(FEED_SELECTORS[platform].POST)
		let visiblePostsCount = 0

		allPosts.forEach((post) => {
			// Check if post is in viewport
			const rect = post.getBoundingClientRect()
			const isVisible =
				rect.top >= -rect.height &&
				rect.left >= -rect.width &&
				rect.bottom <=
				(window.innerHeight || document.documentElement.clientHeight) +
				rect.height &&
				rect.right <=
				(window.innerWidth || document.documentElement.clientWidth) +
				rect.width

			if (isVisible) {
				visiblePostsCount++

				// Import dynamically to avoid circular dependencies
				import("../utils/post").then(({ createPostHash }) => {
					// Force immediate reprocessing by removing from cache
					const postText = post.textContent || ""
					const postHash = createPostHash({ text: postText })

					// Import dynamically to avoid circular dependencies
					import("./cache").then(({ processedPosts }) => {
						if (processedPosts.has(postHash)) {
							processedPosts.delete(postHash)
						}

						// Import dynamically to avoid circular dependencies
						import("../social-post-blocker").then(({ ContentFilterInstance }) => {
							// Process the post
							if (ContentFilterInstance.processPost) {
								ContentFilterInstance.processPost(post)
							}
						})
					})
				})
			}
		})

		console.log(
			`🔄 [Categories] Reprocessed ${visiblePostsCount} visible posts`
		)

		// Reset the dirty flag if we've processed at least one post
		if (visiblePostsCount > 0) {
			categoriesUpdatedDirty = false
		}
	})
}

/**
 * Sets up scroll event listener to check for posts that need updating
 * after category changes
 */
export function setupCategoryUpdateScrollCheck(): void {
	let scrollTimeout: number | null = null

	window.addEventListener("scroll", () => {
		if (scrollTimeout !== null) {
			clearTimeout(scrollTimeout)
		}

		scrollTimeout = window.setTimeout(() => {
			if (categoriesUpdatedDirty) {
				checkVisiblePostsForUpdate()
			}
		}, 100)
	})
} 