/**
 * Debug Utilities
 * 
 * Provides functions for testing and debugging extension functionality
 */
import { Storage } from "@plasmohq/storage"
import { clearAllCaches } from "../services/cache"
import { verifyUserCategories } from "../services/categoryService"
import { createPostHash } from "./post"
import type { FeedlyDebug } from "../types"

const storage = new Storage()

/**
 * Shows a category update status message
 */
export function showCategoryUpdateStatus(message: string, autoHideAfter = 0): HTMLElement {
	// Check if a status element already exists
	let statusElement = document.getElementById("feed-ly-category-status")

	if (!statusElement) {
		// Create a new status element
		statusElement = document.createElement("div")
		statusElement.id = "feed-ly-category-status"
		statusElement.className = "feed-ly-category-status"

		// Create the text element
		const textElement = document.createElement("div")
		textElement.className = "feed-ly-category-status-text"
		statusElement.appendChild(textElement)

		// Add to the document
		document.body.appendChild(statusElement)
	}

	// Update the message
	const textElement = statusElement.querySelector(".feed-ly-category-status-text")
	if (textElement) {
		textElement.textContent = message
	}

	// Show the status
	statusElement.classList.add("feed-ly-category-status-visible")

	// Auto-hide after the specified time
	if (autoHideAfter > 0) {
		setTimeout(() => {
			hideCategoryUpdateStatus()
		}, autoHideAfter)
	}

	return statusElement
}

/**
 * Hides the category update status message
 */
export function hideCategoryUpdateStatus(): void {
	const statusElement = document.getElementById("feed-ly-category-status")
	if (statusElement) {
		statusElement.classList.remove("feed-ly-category-status-visible")
	}
}

/**
 * Initializes debug utilities for development and troubleshooting
 */
export function initDebugUtils(): void {
	console.log("🛠️ [Debug] Initializing debug utilities")

	// Import dynamically to avoid circular dependencies
	import("../config/selectors").then(({ FEED_SELECTORS, getCurrentPlatform }) => {
		import("../social-post-blocker").then(({ ContentFilterInstance }) => {
			const debugUtils: FeedlyDebug = {
				forceReload: () => {
					console.log("🔄 [Debug] Force reloading all posts")
					verifyUserCategories().then(() => {
						clearAllCaches()

						const platform = getCurrentPlatform()
						const feed = document.querySelector(FEED_SELECTORS[platform].FEED)
						if (feed && ContentFilterInstance.processPost) {
							const posts = feed.querySelectorAll(FEED_SELECTORS[platform].POST)
							posts.forEach((post) => ContentFilterInstance.processPost(post))
						}
					})
				},

				inspectPost: (selector: string | Element) => {
					console.log("🔍 [Debug] Inspecting post")

					let element: Element | null = null

					if (typeof selector === "string") {
						element = document.querySelector(selector)
					} else if (selector instanceof Element) {
						element = selector
					}

					if (!element) {
						console.error("❌ [Debug] No element found with selector:", selector)
						return
					}

					// Get the post text
					const isTwitter =
						window.location.hostname.includes("twitter.com") ||
						window.location.hostname.includes("x.com")

					let postText = ""

					try {
						if (isTwitter) {
							const tweetTextElement = element.querySelector(
								'[data-testid="tweetText"]'
							)
							postText = tweetTextElement?.textContent || element.textContent || ""
						} else {
							const textElement = element.querySelector(
								".feed-shared-update-v2__description, .update-components-text"
							)
							postText = textElement?.textContent || element.textContent || ""
						}

						console.log(
							`📝 [Debug] Post text: "${postText.substring(0, 200)}${postText.length > 200 ? "..." : ""}"`
						)

						// Check if we have cached results
						import("../services/cache").then(({ processedPosts }) => {
							const postHash = createPostHash({ text: postText })

							if (processedPosts.has(postHash)) {
								const cachedResult = processedPosts.get(postHash)
								console.log("🔄 [Debug] Found cached result:", cachedResult)
							}

							// Process this post now
							if (ContentFilterInstance.processPost) {
								ContentFilterInstance.processPost(element)
							}
						})
					} catch (error) {
						console.error("❌ [Debug] Error inspecting post:", error)
					}
				},

				logState: () => {
					console.log("📊 [Debug] Current state:")

					// Check if extension is enabled
					storage.get("enabled").then((enabled) => {
						console.log(`🔌 Extension enabled: ${enabled ? "YES" : "NO"}`)
					})

					// Check categories
					storage.get("user-categories").then((categories) => {
						console.log("📋 Categories:", categories)
					})

					// Check API key
					storage.get("openai-api-key").then((apiKey) => {
						console.log(`🔑 API key set: ${apiKey ? "YES" : "NO"}`)
					})
				},

				explainFilter: () => {
					console.log(
						"🔍 FEEDLY FILTER DEBUGGING HELP 🔍\n\n" +
						"Available commands:\n" +
						"- window.__feedlyDebug.forceReload() - Reprocess all posts in the feed\n" +
						"- window.__feedlyDebug.inspectPost(element) - Inspect a specific post (pass a selector or element)\n" +
						"- window.__feedlyDebug.logState() - Log current extension state\n" +
						"- window.__feedlyDebug.refreshCategories() - Refresh categories from storage and reprocess posts\n" +
						"- window.__feedlyDebug.explainFilter() - Show this help message\n\n" +
						"Common issues:\n" +
						"1. Make sure the extension is enabled (check with logState())\n" +
						"2. Verify you have categories set to exclude (check with logState())\n" +
						"3. For Twitter, try clicking on a post to expand it, then use inspectPost()\n" +
						"4. If posts aren't being filtered, try forceReload()\n" +
						"5. Check the console for any error messages\n\n" +
						"CURRENT MODE: Advanced LLM Classification\n" +
						"This extension uses sophisticated AI models to classify content without relying on\n" +
						"simple keyword matching. Each post is analyzed by a large language model to determine\n" +
						"its categories based on the full context and content.\n\n" +
						"For official government accounts like The White House, content is automatically\n" +
						"categorized as POLITICS regardless of the specific content.\n\n" +
						"For more help, visit the extension options page."
					)
				},

				refreshCategories: async () => {
					console.log("🔄 [Debug] Refreshing categories and reprocessing posts")

					try {
						// Force a refresh of categories from storage
						const categories = await verifyUserCategories()
						console.log("🔄 [Categories] Refreshed from storage:", categories)

						// Clear caches
						clearAllCaches()

						// Trigger a categories-updated event to force reprocessing
						await storage.set("categories-updated", Date.now())
						return Promise.resolve()
					} catch (error) {
						console.error("❌ [Debug] Error refreshing categories:", error)
						return Promise.reject(error)
					}
				},

				triggerCategoryUpdate: async () => {
					console.log("🔄 [Debug] Manually triggering category update")

					import("../services/categoryService").then(async ({ updateCategoriesTimestamp, setCategoriesUpdatedDirty, checkVisiblePostsForUpdate }) => {
						// Update the timestamp
						await updateCategoriesTimestamp()
						console.log(
							`🔄 [Debug] Categories update timestamp set to: ${new Date(Date.now()).toLocaleTimeString()}`
						)

						// Set the dirty flag to indicate categories have been updated
						setCategoriesUpdatedDirty(true)

						// Show the status indicator with a more noticeable message for testing
						showCategoryUpdateStatus(
							"🔄 TEST: Categories updated - reprocessing posts"
						)

						// Immediately reprocess visible posts
						checkVisiblePostsForUpdate()
					})

					return Promise.resolve()
				},

				testCategoryStatus: () => {
					console.log("🧪 [Debug] Testing category status indicator")

					// Show a test message
					const statusElement = showCategoryUpdateStatus(
						"⚠️ TEST: This is a test of the category status indicator",
						20000 // Keep visible for 20 seconds
					)

					// Log the element for inspection
					console.log("🧪 [Debug] Status element:", statusElement)

					// Flash the indicator after 2 seconds
					setTimeout(() => {
						console.log("🧪 [Debug] Flashing indicator")
						if (statusElement && statusElement.style) {
							statusElement.style.transform = "translateY(-10px) scale(1.05)"
							setTimeout(() => {
								if (statusElement && statusElement.style) {
									statusElement.style.transform = ""
								}
							}, 300)
						}
					}, 2000)

					// Update the message after 5 seconds
					setTimeout(() => {
						console.log("🧪 [Debug] Updating indicator message")
						const textElement = statusElement.querySelector(
							".feed-ly-category-status-text"
						)
						if (textElement) {
							textElement.textContent =
								"⚠️ TEST: Message updated - indicator working!"
						}
					}, 5000)

					return "Test initiated - check the bottom left corner of the screen"
				},

				testStorageWatch: async () => {
					console.log(
						"🧪 [Debug] Testing storage.watch functionality via background"
					)

					try {
						// Send a message to the background script to test storage watch
						const response = await chrome.runtime.sendMessage({
							type: "test-storage-watch"
						})

						console.log("🧪 [Debug] Background response:", response)

						if (response && response.success) {
							// Show a status indicator to confirm the test was initiated
							showCategoryUpdateStatus(
								`Storage watch test initiated via background: ${response.value}`,
								5000
							)
							return "Storage watch test initiated - check console for results"
						} else {
							console.error(
								"❌ [Debug] Error in storage watch test:",
								response?.error || "Unknown error"
							)
							return "Storage watch test failed - see console for details"
						}
					} catch (error) {
						console.error("❌ [Debug] Error sending message to background:", error)
						return "Storage watch test failed - see console for details"
					}
				},

				testMessageBasedUpdate: async () => {
					console.log("🧪 [Debug] Testing message-based storage update system")

					try {
						// Show a status indicator to confirm the test was initiated
						showCategoryUpdateStatus(
							"Testing message-based updates - check console for results",
							5000
						)

						// Set a test value directly in storage
						const testKey = "user-categories"
						const testValue = {
							include: ["Test Category " + Date.now()],
							exclude: []
						}

						console.log(`🧪 [Debug] Setting ${testKey} to:`, testValue)
						await storage.set(testKey, testValue)
						console.log(`🧪 [Debug] Set ${testKey} successfully`)

						return "Message-based update test initiated - check console for results"
					} catch (error) {
						console.error("❌ [Debug] Error in message-based update test:", error)
						return "Message-based update test failed - see console for details"
					}
				}
			}

			// Assign to window
			window.__feedlyDebug = debugUtils

			console.log(
				"✅ [Debug] Debug utilities initialized - use window.__feedlyDebug to access"
			)
		})
	})
} 