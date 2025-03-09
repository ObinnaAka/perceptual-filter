/**
 * Social Post Blocker - Content Script
 * This is a browser extension that filters social media posts based on user-defined categories.
 * It works on Twitter/X and LinkedIn, analyzing post content using AI to determine categories
 * and applying filters based on user preferences.
 */

import type { PlasmoCSConfig } from "plasmo"
import React, { useCallback } from "react"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

import type { CategorizePostRequest } from "../background/messages/categorize-post"
// Import CSS files for styling components and animations
import "./styles/social-post-blocker.css"
import "./styles/feed-ly-cover.css"
import "./styles/compact-mode.css"
import "./styles/status-indicators.css"
import "./styles/animations.css"

import { applyPostCover, removePostCover } from "./components/PostCover"
import {
  addStatusIndicator,
  removeProcessingAttribute,
  removeStatusIndicator
} from "./components/StatusIndicator"
import { FEED_SELECTORS, getCurrentPlatform } from "./config/selectors"
// Import services and utilities
import { processedPosts } from "./services/cache"
import { initializeExtension } from "./services/initService"
// Import types
import type { ContentFilterContextType, UserCategories } from "./types"
import { createPostHash, extractPostText } from "./utils/post"

// ! Refactor: Consider moving type declarations to a separate types.ts file
// Extend Window interface to include debug utilities
declare global {
  interface Window {
    __feedlyDebugMenuAdded?: boolean
    __feedlyLastClickedElement?: Element
    __feedlyDebug: {
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
  }
}

// Configuration for the content script - defines which sites it runs on
export const config: PlasmoCSConfig = {
  matches: [
    "https://www.linkedin.com/feed*",
    "https://twitter.com/home*",
    "https://x.com/home*"
  ],
  all_frames: false
}

// Initialize storage instance for managing extension data
const storage = new Storage()

// Singleton to store the processPost function
export const ContentFilterInstance = {
  processPost: null as ((container: Element) => Promise<void>) | null
}

// Create a React context to share functionality
export const ContentFilterContext =
  React.createContext<ContentFilterContextType>({
    processPost: async () => {}
  })

/**
 * React Context Provider component for content filtering functionality
 * Provides post processing capabilities to the entire application
 */
export function ContentFilterProvider({ children }) {
  const processPost = useCallback(async (container: Element) => {
    // Check if filter is enabled
    const enabled = await storage.get("enabled")

    if (!enabled) return

    // Prevent duplicate processing
    if (container.hasAttribute("data-feedlyprocessing")) return

    // Determine platform
    const platform = getCurrentPlatform()

    // Skip if not a post container
    if (!container.matches(FEED_SELECTORS[platform].POST)) return

    // Mark post as being processed
    container.setAttribute("data-feedlyprocessing", "true")

    // Add processing indicator
    addStatusIndicator(container, "processing")

    // Track processing duration for visual feedback
    const processingStartTime = Date.now()

    // ? What does this do?
    const minimumProcessingTime = 400

    // Extract post content
    const postText = extractPostText(container)

    // Create a hash for this post
    const postHash = createPostHash({ text: postText })

    // * Check if we've already processed this post
    if (processedPosts.has(postHash)) {
      const cachedResult = processedPosts.get(postHash)

      console.log("🔄 [Cache] Using cached result for post:", cachedResult)

      // Ensure minimum processing time for visual feedback
      const processingTime = Date.now() - processingStartTime
      if (processingTime < minimumProcessingTime) {
        await new Promise((resolve) =>
          setTimeout(resolve, minimumProcessingTime - processingTime)
        )
      }

      // Apply the cached result
      if (cachedResult.shouldBlock) {
        // Update status indicator
        addStatusIndicator(container, "blocked")

        // Apply cover
        await applyPostCover(
          container,
          postHash,
          cachedResult.categories,
          cachedResult.tldr,
          cachedResult.matchedCategories
        )
      } else {
        // Update status indicator
        addStatusIndicator(container, "processed")
      }

      // Remove processing attribute
      removeProcessingAttribute(container)
      return
    }

    try {
      // Get user categories
      const userCategoriesRaw = (await storage.get<UserCategories>(
        "user-categories"
      )) || { include: [], exclude: [] }

      // Skip processing if no categories are set
      if (
        userCategoriesRaw.include.length === 0 &&
        userCategoriesRaw.exclude.length === 0
      ) {
        console.log("⚠️ [Categories] No categories set, skipping processing")
        removeProcessingAttribute(container)
        removeStatusIndicator(container)
        return
      }

      // Prepare the API request
      const apiRequest = {
        content: postText.slice(0, 1500), // Limit text length
        userCategories: userCategoriesRaw,
        authorName: container.getAttribute("data-author-name") || undefined
      } as CategorizePostRequest

      // Send to background script for processing
      const response = await sendToBackground({
        name: "categorize-post",
        body: apiRequest
      })

      // Ensure minimum processing time for visual feedback
      const processingTime = Date.now() - processingStartTime
      if (processingTime < minimumProcessingTime) {
        await new Promise((resolve) =>
          setTimeout(resolve, minimumProcessingTime - processingTime)
        )
      }

      if (response.success) {
        console.log("✅ [API] Post processed successfully:", response)
        const { categories, tldr, confidence, matchedCategories } = response


				let shouldBlock = categories.reduce((acc, category) => {
					 return acc || userCategoriesRaw.exclude.includes(category)
				}, false)

				const shouldInclude = categories.reduce((acc, category) => {
					 return acc || userCategoriesRaw.include.includes(category)
				}, false)

				// Include categories take precedence over block categories
				if (shouldInclude) {
					shouldBlock = false
				}

        // * Cache the result
        processedPosts.set(postHash, {
          categories,
          tldr,
          shouldBlock,
          matchedCategories,
          processedAt: Date.now()
        })

        if (shouldBlock) {
          console.log("[Processing] Post processed, should block ❌")
          // Update status indicator
          addStatusIndicator(container, "blocked")

          // Apply cover
          await applyPostCover(
            container,
            postHash,
            categories,
            tldr,
            matchedCategories
          )
        } else {
          console.log("[Processing] Post processed, no action required ✅")
          // Update status indicator
          addStatusIndicator(container, "processed")

          // Remove any existing cover
          removePostCover(container)
        }
      } else {
        console.log("❌ [API] Error processing post:", response)
        console.error("❌ [API] Error processing post:", response.error)
        removeStatusIndicator(container)
      }
    } catch (error) {
      console.error("❌ [Processing] Error processing post:", error)
      removeStatusIndicator(container)
    } finally {
      // Remove processing attribute
      removeProcessingAttribute(container)
    }
  }, [])

  // Store the processPost function in the singleton
  ContentFilterInstance.processPost = processPost

  return (
    <ContentFilterContext.Provider value={{ processPost }}>
      {children}
    </ContentFilterContext.Provider>
  )
}

// Start the extension
initializeExtension()
