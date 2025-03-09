/**
 * Utility functions for post processing
 */
import type { PostData } from "../types"
import { getCurrentPlatform } from "../config/selectors"

/**
 * Creates a unique identifier for a post based on its content and author
 */
export const createPostHash = (data: PostData): string => {
	try {
		// Using first 150 chars of text should be enough for uniqueness
		return `${data.actorName || ""}-${data.text?.slice(0, 150) || ""}`
	} catch (error) {
		console.error("❌ Error creating post hash:", error)
		// Return a fallback hash with timestamp to avoid errors
		return `error-${Date.now()}`
	}
}

/**
 * Extracts text content from a post element based on the current platform
 */
export function extractPostText(container: Element): string {
	const platform = getCurrentPlatform()
	let postText = ""

	try {
		if (platform === "TWITTER") {
			// First try to find the tweetText element using data-testid
			const tweetTextElement = container.querySelector('[data-testid="tweetText"]')

			if (tweetTextElement) {
				postText = tweetTextElement.textContent || ""
				console.log("🔍 [Twitter] Found text via tweetText data-testid")
			} else {
				// If not found, look for text in article elements with specific IDs
				const articleElement = container.closest('article[role="article"]')
				if (articleElement) {
					// Find all text elements within the article that might contain the tweet content
					const possibleTextElements = articleElement.querySelectorAll('[dir="auto"][lang="en"], [dir="auto"][lang]')
					console.log(`🔍 [Twitter] Found ${possibleTextElements.length} possible text elements in article`)

					for (const element of possibleTextElements) {
						// Skip elements that are likely user names or metadata
						if (element.closest('[data-testid="User-Name"]') ||
							element.textContent?.includes('@') ||
							element.textContent?.length < 5) {
							continue
						}

						// If we find a substantial text element, use it
						if (element.textContent && element.textContent.length > 10) {
							postText = element.textContent
							console.log("🔍 [Twitter] Found text via article content")
							break
						}
					}
				} else {
					console.log("🔍 [Twitter] No article element found")
				}
			}

			// If still no text found, fall back to container text
			if (!postText) {
				postText = container.textContent || ""
				console.log("🔍 [Twitter] Using fallback container text")
			}
		} else if (platform === "LINKEDIN") {
			const textElement = container.querySelector(
				".feed-shared-update-v2__description, .update-components-text"
			)
			postText = textElement?.textContent || ""

			if (!postText) {
				const alternativeLinkedInSelectors = [
					".update-components-text",
					".feed-shared-text"
				]
				for (const selector of alternativeLinkedInSelectors) {
					const element = container.querySelector(selector)
					if (element && element.textContent) {
						postText = element.textContent
						break
					}
				}
			}
		}

		console.log(`🔍 [Post Text] Extracted text (${postText.length} chars): "${postText.substring(0, 50)}${postText.length > 50 ? "..." : ""}"`)
		return postText
	} catch (error) {
		console.error("❌ Error extracting post text:", error)
		return container.textContent || ""
	}
}

/**
 * Finds the best element to apply the overlay to
 */
export function findBestOverlayTarget(container: Element, platform: string): Element {
	// Default to the container itself
	let targetElement = container

	try {
		if (platform === "TWITTER") {
			console.log("🔍 [Target] Finding best overlay target for Twitter")

			// First, try to find the article element which is the main tweet container
			const article = container.closest('article[role="article"]')

			if (article) {
				console.log("🔍 [Target] Found article element")
				targetElement = article

				// For media tweets, we need to find the parent that fully contains the media
				const mediaContainer = article.querySelector(
					'[data-testid="videoPlayer"], [data-testid="tweetPhoto"], video, img[src*="twimg.com"]'
				)

				if (mediaContainer) {
					console.log("🎥 [Target] Found media content, optimizing overlay")

					// Try to find a higher-level container that will fully cover the media
					// First try the direct parent of the article
					const articleParent = article.parentElement
					if (articleParent) {
						targetElement = articleParent
						console.log("🎯 [Target] Using article parent for media tweet")
					}
				}

				return targetElement
			}

			// If no article found, try to find the cellInnerDiv which is another high-level container
			const cellInnerDiv = container.closest('[data-testid="cellInnerDiv"]')
			if (cellInnerDiv) {
				console.log("🔍 [Target] Found cellInnerDiv element")
				targetElement = cellInnerDiv
				return targetElement
			}

			// If neither article nor cellInnerDiv found, try to find any tweet-like container
			const tweetContainer = container.closest('.css-175oi2r[role="article"], div[data-testid="tweet"]')
			if (tweetContainer) {
				console.log("🔍 [Target] Found tweet container element")
				targetElement = tweetContainer
				return targetElement
			}

			console.log("⚠️ [Target] Using fallback container for Twitter")
		} else if (platform === "LINKEDIN") {
			console.log("🔍 [Target] Finding best overlay target for LinkedIn")

			// LinkedIn-specific element targeting logic
			const postContainer = container.closest(".feed-shared-update-v2")

			if (postContainer) {
				console.log("🔍 [Target] Found LinkedIn post container")
				targetElement = postContainer
			} else {
				const alternativeSelectors = [
					".feed-shared-update-v2__content",
					".update-components-actor",
					".update-components-text"
				]

				for (const selector of alternativeSelectors) {
					const element =
						container.closest(selector) || container.querySelector(selector)
					if (element) {
						console.log(`🔍 [Target] Found LinkedIn element with selector: ${selector}`)
						targetElement = element
						break
					}
				}
			}
		}

		console.log(`🎯 [Target] Final target element: ${targetElement.tagName}, classes: ${(targetElement as HTMLElement).className.substring(0, 50)}...`)
		return targetElement;
	} catch (error) {
		console.error("❌ [Target] Error finding best overlay target:", error)
		return container;
	}
} 