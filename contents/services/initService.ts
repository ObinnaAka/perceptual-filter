/**
 * Initialization Service
 * 
 * Handles extension initialization and setup
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { Storage } from "@plasmohq/storage"
import { verifyCssLoaded } from "./cssService"
import { verifyUserCategories } from "./categoryService"
import { setupCategoryUpdateScrollCheck } from "./categoryService"
import { initDebugUtils } from "../utils/debug"
import { initializeMessageListener } from "../messaging"
import { FEED_SELECTORS, getCurrentPlatform } from "../config/selectors"

const storage = new Storage()

/**
 * Initializes the extension
 */
export async function initializeExtension(): Promise<void> {
	console.log("🚀 [Initialization] Starting extension initialization")

	initializeMessageListener()
	console.log("🎧 [Initialization] Message listener initialized")

	// Check extension state and configuration
	const enabled = await storage.get<boolean>("enabled")
	const lastUpdate = await storage.get<number>("categories-updated")
	if (lastUpdate) {
		console.log(
			`🔄 [Initialization] Last categories update: ${new Date(lastUpdate).toLocaleTimeString()}`
		)
	}

	// Verify platform support
	const isTwitter =
		window.location.hostname.includes("twitter.com") ||
		window.location.hostname.includes("x.com")
	const isLinkedIn = window.location.hostname.includes("linkedin.com")

	if (!isTwitter && !isLinkedIn) {
		console.log(
			"⚠️ [Initialization] Not on a supported site, extension will not activate"
		)
		return
	}

	if (enabled === false) {
		console.log("⚠️ [Initialization] Extension is disabled")
		return
	}

	// Verify CSS is properly loaded
	verifyCssLoaded()

	// Initialize debug utilities early
	initDebugUtils()

	// Verify user categories
	await verifyUserCategories()

	try {
		// Import ContentFilterProvider dynamically to avoid circular dependencies
		const socialPostBlocker = await import("../social-post-blocker")
		const { ContentFilterProvider } = socialPostBlocker

		// Initialize React app
		const rootDiv = document.createElement("div")
		rootDiv.id = "feed-ly-react-root"
		document.body.appendChild(rootDiv)

		const root = createRoot(rootDiv)

		// Create the React element
		const element = React.createElement(
			ContentFilterProvider,
			null,
			React.createElement("div", {
				id: "feed-ly-initialized",
				style: { display: "none" }
			})
		)

		// Render the element
		root.render(element)

		// Start observing once React is mounted
		const checkReactInitialized = setInterval(() => {
			if (document.getElementById("feed-ly-initialized")) {
				clearInterval(checkReactInitialized)
				startObserving()
				console.log(
					"✅ [Initialization] Extension initialized successfully with React context"
				)
			}
		}, 100)

		setupCategoryUpdateScrollCheck()
	} catch (error) {
		console.error("❌ [Initialization] Error initializing extension:", error)
	}
}

/**
 * Starts observing the feed for new posts
 */
export function startObserving(): void {
	console.log("👀 [Observer] Starting feed observation")

	const platform = getCurrentPlatform()
	const feed = document.querySelector(FEED_SELECTORS[platform].FEED)

	// Import ContentFilterInstance dynamically to avoid circular dependencies
	import("../social-post-blocker").then((socialPostBlocker) => {
		const { ContentFilterInstance } = socialPostBlocker

		if (!ContentFilterInstance || !ContentFilterInstance.processPost) {
			console.error("❌ [Observer] processPost function not available yet")
			setTimeout(startObserving, 500)
			return
		}

		const processPost = ContentFilterInstance.processPost

		if (feed) {
			const observerOptions = {
				childList: true,
				subtree: true,
				attributes: platform === "TWITTER",
				attributeFilter: platform === "TWITTER" ? ["style", "class"] : []
			}

			const observer = new MutationObserver((mutations) => {
				const addedNodes = new Set<Node>()

				for (const mutation of mutations) {
					if (mutation.type === "childList") {
						mutation.addedNodes.forEach((node) => addedNodes.add(node))
					} else if (platform === "TWITTER" && mutation.type === "attributes") {
						if (
							mutation.target instanceof HTMLElement &&
							mutation.target.matches(FEED_SELECTORS.TWITTER.POST) &&
							!mutation.target.hasAttribute("data-feedlyprocessing") &&
							!mutation.target.querySelector(".feed-ly-status-indicator")
						) {
							addedNodes.add(mutation.target)
						}
					}
				}

				addedNodes.forEach((node) => {
					if (node instanceof HTMLElement) {
						if (platform === "TWITTER" && node.matches(FEED_SELECTORS.TWITTER.POST)) {
							if (
								!node.querySelector(".feed-ly-status-indicator") &&
								!node.hasAttribute("data-feedlyprocessing")
							) {
								processPost(node)
							}
						} else {
							const posts = node.querySelectorAll(FEED_SELECTORS[platform].POST)
							posts.forEach((post) => {
								if (
									!post.querySelector(".feed-ly-status-indicator") &&
									!post.hasAttribute("data-feedlyprocessing")
								) {
									processPost(post)
								}
							})
						}
					}
				})
			})

			observer.observe(feed, observerOptions)

			// Process initial posts in batches
			const initialPosts = feed.querySelectorAll(FEED_SELECTORS[platform].POST)
			console.log(`🔍 [Feed] Processing ${initialPosts.length} initial posts`)

			const processBatch = (startIndex: number, batchSize: number) => {
				const endIndex = Math.min(startIndex + batchSize, initialPosts.length)

				for (let i = startIndex; i < endIndex; i++) {
					const post = initialPosts[i]
					if (
						!post.querySelector(".feed-ly-status-indicator") &&
						!post.hasAttribute("data-feedlyprocessing")
					) {
						processPost(post)
					}
				}

				if (endIndex < initialPosts.length) {
					setTimeout(() => {
						processBatch(endIndex, batchSize)
					}, 100)
				}
			}

			processBatch(0, 5)

			// Set up interval for Twitter to handle scroll events
			if (platform === "TWITTER") {
				setInterval(() => {
					const visiblePosts = feed.querySelectorAll(FEED_SELECTORS.TWITTER.POST)
					let processedCount = 0

					for (let i = 0; i < visiblePosts.length && processedCount < 5; i++) {
						const post = visiblePosts[i]
						if (
							!post.querySelector(".feed-ly-status-indicator") &&
							!post.hasAttribute("data-feedlyprocessing")
						) {
							processPost(post)
							processedCount++
						}
					}
				}, 2000)
			}
		} else {
			console.log("⏳ [Feed] Feed not found, retrying in 1s")
			setTimeout(startObserving, 1000)
		}
	}).catch((error) => {
		console.error("❌ [Observer] Error importing ContentFilterInstance:", error)
		setTimeout(startObserving, 1000)
	})
} 