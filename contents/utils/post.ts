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
			const fullArticleText = container.textContent || ""
			const tweetTextElement = container.querySelector(
				'[data-testid="tweetText"]'
			)
			const mainText = tweetTextElement?.textContent || ""
			postText = mainText || fullArticleText

			if (postText.length < 30 && fullArticleText.length > postText.length) {
				postText = fullArticleText
			}
		} else {
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


		console.log("🔍 [Post Text] Extracted text:", postText)
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

	if (platform === "TWITTER") {
		// First, try to find the cellInnerDiv which is the highest-level container
		const cellInnerDiv = container.closest('[data-testid="cellInnerDiv"]')

		if (cellInnerDiv) {
			targetElement = cellInnerDiv
			return targetElement
		}

		// If no cellInnerDiv, try to find the article element
		const article = container.closest("article")

		if (article) {
			targetElement = article

			// For media tweets, we need to find the parent that fully contains the media
			const mediaContainer = article.querySelector(
				'[data-testid="videoPlayer"], [data-testid="tweetPhoto"], [data-testid="videoComponent"]'
			)

			if (mediaContainer) {
				console.log("🎥 [Media Tweet] Found media content, optimizing overlay")
				const articleParent =
					article.parentElement?.parentElement?.parentElement
				if (articleParent) {
					targetElement = articleParent
				}
			}
		}
	} else if (platform === "LINKEDIN") {
		// LinkedIn-specific element targeting logic
		const postContainer = container.closest(".feed-shared-update-v2")

		if (postContainer) {
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
					targetElement = element
					break
				}
			}
		}
	}

	return targetElement
} 