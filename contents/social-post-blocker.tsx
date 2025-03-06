/**
 * Social Post Blocker - Content Script
 * This is a browser extension that filters social media posts based on user-defined categories.
 * It works on Twitter/X and LinkedIn, analyzing post content using AI to determine categories
 * and applying filters based on user preferences.
 */

import type { PlasmoCSConfig } from "plasmo"
import React, { useCallback } from "react"
import { createRoot } from "react-dom/client"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

// Import CSS files for styling components and animations
import "./styles/social-post-blocker.css"
import "./styles/feed-ly-cover.css"
import "./styles/compact-mode.css"
import "./styles/status-indicators.css"
import "./styles/animations.css"

// Import message listener for background script communication
import { initializeMessageListener } from "./messaging"

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
    "https://twitter.com/home",
    "https://x.com/home"
  ],
  all_frames: false
}

// ! Refactor: Consider moving these caches to a separate caching service
// Cache for storing API responses and processed posts
const apiCache = new Map<string, boolean>()
const processedPosts = new Map<
  string,
  {
    categories: string[]
    tldr: string
    shouldBlock: boolean
    matchedCategories?: string[]
    processedAt: number
  }
>()

// Track when categories were last updated
let lastCategoriesUpdate = Date.now()

// Initialize storage instance for managing extension data
const storage = new Storage()

// ! Refactor: Move interfaces to types.ts file
interface PostData {
  actorName?: string
  text?: string
  categories?: string[]
  tldr?: string
}

/**
 * Creates a unique identifier for a post based on its content and author
 * Used for caching and tracking processed posts
 */
const createPostHash = (data: PostData): string => {
  try {
    // Using first 150 chars of text should be enough for uniqueness
    return `${data.actorName || ""}-${data.text?.slice(0, 150) || ""}`
  } catch (error) {
    console.error("❌ Error creating post hash:", error)
    // Return a fallback hash with timestamp to avoid errors
    return `error-${Date.now()}`
  }
}

// ! Refactor: Consider moving UI components to separate files
/**
 * React component that renders the cover overlay for filtered posts
 * Displays categories and provides an option to unmute/show the post
 */
const FeedlyCoverElement: React.FC<{
  postId: string
  categories: string[]
  tldr: string
  onUnmute: () => void
  matchedCategories?: string[]
}> = ({ postId, categories, tldr, onUnmute, matchedCategories = [] }) => {
  const [isVisible, setIsVisible] = React.useState(false)
  const [isUnmuting, setIsUnmuting] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    // Trigger fade-in animation after mount
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const handleUnmute = () => {
    setIsUnmuting(true)
    setTimeout(() => {
      onUnmute()
    }, 600)
  }

  // Display matched categories if available, otherwise show first three categories
  const displayCategories =
    matchedCategories.length > 0 ? matchedCategories : categories.slice(0, 3)

  return (
    <div
      ref={containerRef}
      className={`feed-ly-container feed-ly-fade-in ${isVisible ? "feed-ly-visible" : ""} ${isUnmuting ? "feed-ly-unmuting" : ""}`}>
      <div className="feed-ly-compact">
        <div className="feed-ly-compact-tags-container">
          <span className="feed-ly-badge-dot"></span>
          <div className="feed-ly-compact-tags">
            {displayCategories.map((category, index) => (
              <span key={index} className="feed-ly-compact-tag">
                {category.toUpperCase()}
              </span>
            ))}
            {categories.length > 3 && matchedCategories.length === 0 && (
              <span className="feed-ly-more-tag">
                +{categories.length - 3} more
              </span>
            )}
          </div>
        </div>
        <button onClick={handleUnmute} className="feed-ly-compact-button">
          <span className="feed-ly-button-text">Show</span>
          <span className="feed-ly-button-icon">→</span>
        </button>
      </div>
    </div>
  )
}

// ! Refactor: Consider splitting this into smaller, more focused functions
/**
 * Applies a cover overlay to posts that should be blocked
 * Handles different social media platforms and post types (including media posts)
 */
async function applyPostCover(
  container: Element,
  postHash: string,
  categories: string[],
  tldr: string,
  matchedCategories: string[] = []
): Promise<void> {
  try {
    // Check if post is already unmuted
    const unmutedPosts = (await storage.get<string[]>("unmutedPosts")) || []

    if (unmutedPosts.includes(postHash)) {
      return
    }

    // First, check if container is still in the DOM
    if (!document.body.contains(container)) {
      return
    }

    // Check if this is a media tweet to add special handling
    const isTwitter =
      window.location.hostname.includes("twitter.com") ||
      window.location.hostname.includes("x.com")

    const hasMedia =
      isTwitter &&
      (container.querySelector('[data-testid="videoPlayer"]') ||
        container.querySelector('[data-testid="tweetPhoto"]') ||
        container.querySelector("video"))

    // Check if this is a cellInnerDiv tweet (highest level container)
    const isCellInnerDiv =
      isTwitter &&
      (container.matches('[data-testid="cellInnerDiv"]') ||
        container.closest('[data-testid="cellInnerDiv"]') === container)

    // Check if we already have a cover on this element
    const existingCover = container.querySelector(".feed-ly-cover")
    if (existingCover) {
      return
    }

    // Note: We don't need to handle status indicators separately anymore
    // The addStatusIndicator function will handle transitions between states
    // Just update the indicator to blocked state
    addStatusIndicator(container, "blocked")

    // Create a wrapper div with position relative to ensure proper positioning context
    const wrapperDiv = document.createElement("div")
    let wrapperClass = "feed-ly-wrapper"

    if (hasMedia) {
      wrapperClass += " feed-ly-media-wrapper"
    }

    if (isCellInnerDiv) {
      wrapperClass += " feed-ly-cell-wrapper"
    }

    wrapperDiv.className = wrapperClass
    wrapperDiv.style.position = "relative"
    wrapperDiv.style.width = "100%"
    wrapperDiv.style.height = "100%"
    wrapperDiv.style.overflow = "hidden"
    wrapperDiv.style.zIndex = isCellInnerDiv ? "9999" : "9000" // Higher z-index for cellInnerDiv

    // Cast to HTMLElement to access style properties
    const htmlContainer = container as HTMLElement

    // Store original styles for restoration when unmuting
    const originalPosition = window.getComputedStyle(htmlContainer).position
    const originalOverflow = window.getComputedStyle(htmlContainer).overflow

    // Force the container to have position relative if it's not already
    if (originalPosition !== "relative" && originalPosition !== "absolute") {
      htmlContainer.style.position = "relative"
    }

    // Create the cover div
    const coverDiv = document.createElement("div")
    let coverClass = "feed-ly-cover"

    if (hasMedia) {
      coverClass += " feed-ly-media-cover"
    }

    if (isCellInnerDiv) {
      coverClass += " feed-ly-cell-cover"
    }

    coverDiv.className = coverClass

    // Apply base positioning styles
    coverDiv.style.position = "absolute"
    coverDiv.style.top = "0"
    coverDiv.style.right = "0"
    coverDiv.style.bottom = "0"
    coverDiv.style.left = "0"
    coverDiv.style.zIndex = isCellInnerDiv ? "10000" : "9999"
    coverDiv.style.display = "flex"
    coverDiv.style.justifyContent = "center"
    coverDiv.style.alignItems = "flex-start"
    coverDiv.style.width = "100%"
    coverDiv.style.height = "100%"
    coverDiv.style.padding = "16px"

    // Add the cover directly to the container
    container.appendChild(coverDiv)

    // Trigger the fade-in animation after a small delay
    setTimeout(() => {
      coverDiv.classList.add("feed-ly-visible")
    }, 50)

    // Log positioning information for debugging
    console.log(
      `🎯 [Post ${postHash.substring(0, 8)}] Applied cover - Container position: ${originalPosition}`
    )

    const unmute = async () => {
      console.log(`👁️ [Post ${postHash.substring(0, 8)}] User unmuted post`)
      const unmutedPosts = (await storage.get<string[]>("unmutedPosts")) || []
      await storage.set("unmutedPosts", [...unmutedPosts, postHash])

      // Remove the cover
      coverDiv.remove()

      // Restore original styles if they were changed
      if (originalPosition !== "relative" && originalPosition !== "absolute") {
        htmlContainer.style.position = originalPosition
      }
    }

    // Add the styles if they don't exist yet - with scoped class names
    if (!document.getElementById("feed-ly-styles")) {
      const style = document.createElement("style")
      style.id = "feed-ly-styles"
      style.textContent = `
        /* Scoped feed.ly styles with more aggressive specificity */
        .feed-ly-cover {
          position: absolute !important;
          top: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          z-index: 9999 !important;
          background-color: rgba(255, 255, 255, 0.05) !important;
          backdrop-filter: blur(15px) !important;
          -webkit-backdrop-filter: blur(15px) !important;
          padding: 16px !important;
          display: flex !important;
          justify-content: center !important;
          align-items: flex-start !important;
        }
        
        /* React component styling with !important to prevent overrides */
        .feed-ly-container {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 1rem !important;
          width: 100% !important;
          max-width: 500px !important;
          transition: opacity 0.3s ease, transform 0.4s ease !important;
        }
        
        .feed-ly-unmuting {
          opacity: 0 !important;
          transform: translateY(-20px) !important;
        }
        
        /* Compact mode styles */
        .feed-ly-compact {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: space-between !important;
          width: 100% !important;
          padding: 10px 18px !important;
          background-color: rgba(255, 255, 255, 0.95) !important;
          border-radius: 16px !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 0 1px rgba(0, 0, 0, 0.1) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
          border: 1px solid rgba(207, 217, 222, 0.2) !important;
          transition: transform 0.2s ease, box-shadow 0.2s ease !important;
          transform: translateY(0) !important;
        }
        
        .feed-ly-compact:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05), 0 0 1px rgba(0, 0, 0, 0.1) !important;
        }
        
        .feed-ly-compact-tags-container {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
        }
        
        .feed-ly-badge-dot {
          width: 6px !important;
          height: 6px !important;
          background-color: #1d9bf0 !important;
          border-radius: 50% !important;
          display: inline-block !important;
          opacity: 0.9 !important;
          box-shadow: 0 0 0 2px rgba(29, 155, 240, 0.1) !important;
        }
        
        .feed-ly-compact-tags {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 6px !important;
          align-items: center !important;
        }
        
        .feed-ly-compact-tag {
          display: inline-flex !important;
          align-items: center !important;
          padding: 4px 12px !important;
          border-radius: 16px !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          background-color: rgba(239, 243, 244, 0.95) !important;
          color: #536471 !important;
          border: 1px solid rgba(207, 217, 222, 0.3) !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          transition: background-color 0.2s ease, transform 0.2s ease !important;
        }
        
        .feed-ly-compact-tag:hover {
          background-color: rgba(239, 243, 244, 1) !important;
          transform: translateY(-1px) !important;
        }
        
        .feed-ly-more-tag {
          background-color: rgba(239, 243, 244, 0.7) !important;
          color: #536471 !important;
        }
        
        .feed-ly-compact-button {
          padding: 8px 18px !important;
          background-color: #1d9bf0 !important;
          color: white !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          border-radius: 9999px !important;
          border: none !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          transition: all 0.2s ease !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
        }
        
        .feed-ly-compact-button:hover {
          background-color: #1a8cd8 !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15) !important;
        }
        
        .feed-ly-button-icon {
          font-size: 14px !important;
          transition: transform 0.2s ease !important;
          opacity: 1 !important;
        }
        
        .feed-ly-compact-button:hover .feed-ly-button-icon {
          transform: translateX(3px) !important;
        }
        
        .feed-ly-fade-in {
          opacity: 0 !important;
          transform: translateY(10px) !important;
          transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1), transform 400ms cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .feed-ly-fade-in.feed-ly-visible {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
        
        @keyframes feed-ly-pulse {
          0% { box-shadow: 0 0 0 0 rgba(29, 155, 240, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(29, 155, 240, 0); }
          100% { box-shadow: 0 0 0 0 rgba(29, 155, 240, 0); }
        }
      `
      document.head.appendChild(style)
    }

    try {
      const root = createRoot(coverDiv)
      root.render(
        <FeedlyCoverElement
          postId={postHash}
          categories={categories}
          tldr={tldr}
          onUnmute={unmute}
          matchedCategories={matchedCategories}
        />
      )
    } catch (error) {
      console.error(`❌ [UI] Error rendering cover:`, error)
    }
  } catch (error) {
    console.error(`❌ Error applying post cover:`, error)
  }
}

// ! Refactor: Move platform-specific selectors to a configuration file
/**
 * Selectors for identifying feed and post elements on different platforms
 */
const FEED_SELECTORS = {
  LINKEDIN: {
    FEED: "div.scaffold-finite-scroll__content, .feed-container",
    POST: "div.feed-shared-update-v2, div.update-components-actor, .feed-shared-update-v2__description-wrapper"
  },
  TWITTER: {
    FEED: '[data-testid="primaryColumn"], [aria-label="Timeline: Your Home Timeline"], main[role="main"]',
    POST: 'article[data-testid="tweet"], div[data-testid="cellInnerDiv"]'
  }
}

// ! Refactor: Consider moving helper functions to a separate utilities file
/**
 * Helper function to find the best element to apply the overlay to
 * Handles different social media platforms and post types
 */
function findBestOverlayTarget(container: Element, platform: string): Element {
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

// ! Refactor: Consider implementing a proper state management solution
/**
 * Singleton to store the processPost function
 * Used to share functionality between React and non-React code
 */
const ContentFilterInstance = {
  processPost: null as ((container: Element) => Promise<void>) | null
}

// Create a React context to share functionality
const ContentFilterContext = React.createContext<{
  processPost: (container: Element) => Promise<void>
}>({
  processPost: async () => {}
})

// ! Refactor: Consider moving status indicators to a separate component
/**
 * Manages the status indicators that show the processing state of posts
 * Handles transitions between different states (processing, processed, filtered, blocked)
 */
function addStatusIndicator(
  container: Element,
  status: "processing" | "processed" | "filtered" | "blocked"
): HTMLElement | null {
  try {
    // Check if multiple indicators exist and remove extras
    const allIndicators = container.querySelectorAll(
      ".feed-ly-status-indicator"
    )
    if (allIndicators.length > 1) {
      for (let i = 1; i < allIndicators.length; i++) {
        allIndicators[i].remove()
      }
    }

    // Check if an indicator already exists
    const existingIndicator = container.querySelector(
      ".feed-ly-status-indicator"
    )

    if (existingIndicator) {
      // Update existing indicator
      existingIndicator.classList.remove(
        "feed-ly-status-processing",
        "feed-ly-status-processed",
        "feed-ly-status-filtered",
        "feed-ly-status-blocked"
      )

      void (existingIndicator as HTMLElement).offsetWidth
      existingIndicator.classList.add(`feed-ly-status-${status}`)

      // Update icon and tooltip based on status
      let icon = ""
      let title = ""
      switch (status) {
        case "processing":
          icon = "⏳"
          title = "Processing post..."
          break
        case "processed":
          icon = "✓"
          title = "Post processed and allowed"
          break
        case "filtered":
          icon = "⚠️"
          title = "Post filtered"
          break
        case "blocked":
          icon = "✕"
          title = "Post blocked"
          break
      }

      existingIndicator.textContent = icon
      ;(existingIndicator as HTMLElement).title = title

      return existingIndicator as HTMLElement
    } else {
      // Create a new indicator
      const indicator = document.createElement("div")
      indicator.className = `feed-ly-status-indicator feed-ly-status-${status} feed-ly-status-new`

      // Set tooltip title based on status
      let title = ""
      switch (status) {
        case "processing":
          title = "Processing post..."
          break
        case "processed":
          title = "Post processed and allowed"
          break
        case "filtered":
          title = "Post filtered"
          break
        case "blocked":
          title = "Post blocked"
          break
      }
      indicator.title = title

      container.appendChild(indicator)
      return indicator
    }
  } catch (error) {
    console.error("❌ Error adding status indicator:", error)
    return null
  }
}

/**
 * Removes the status indicator from a post with a smooth fade-out animation.
 * @param container The post container element
 * @returns void
 */
function removeStatusIndicator(container: Element): void {
  try {
    const existingIndicator = container.querySelector(
      ".feed-ly-status-indicator"
    )
    if (!existingIndicator) {
      return
    }

    existingIndicator.classList.add("feed-ly-unmuting")

    setTimeout(() => {
      if (existingIndicator.parentNode === container) {
        existingIndicator.remove()
      }
    }, 400)
  } catch (error) {
    console.error("❌ Error removing status indicator:", error)
  }
}

/**
 * Removes the processing attribute from a post container
 * Allows the post to be processed again in the future
 */
function removeProcessingAttribute(container: Element): void {
  try {
    if (container.hasAttribute("data-feedlyprocessing")) {
      container.removeAttribute("data-feedlyprocessing")
    }
  } catch (error) {
    console.error("❌ Error removing processing attribute:", error)
  }
}

/**
 * Removes the cover overlay from a post when it no longer needs to be blocked
 * Restores original styling to the container element
 */
function removePostCover(container: Element): void {
  try {
    const existingCover = container.querySelector(".feed-ly-cover")
    if (!existingCover) {
      return
    }

    console.log(
      "🔄 Removing existing cover as post no longer needs to be blocked"
    )
    existingCover.remove()

    const htmlContainer = container as HTMLElement
    if (htmlContainer.style.position === "relative") {
      htmlContainer.style.position = ""
    }
  } catch (error) {
    console.error("❌ Error removing post cover:", error)
  }
}

// Update the processPost function to add status indicators
export function ContentFilterProvider({ children }) {
  const storage = new Storage()

  // Convert processPost to useCallback
  const processPost = useCallback(async (container: Element) => {
    // Check if filter is enabled
    const enabled = await storage.get("enabled")

    if (!enabled) {
      return
    }

    // Prevent duplicate processing
    if (container.hasAttribute("data-feedlyprocessing")) {
      return
    }

    // Determine platform
    const isTwitter =
      window.location.hostname.includes("twitter.com") ||
      window.location.hostname.includes("x.com")

    const platform = isTwitter ? "TWITTER" : "LINKEDIN"

    // Skip if not a post container
    if (!container.matches(FEED_SELECTORS[platform].POST)) {
      return
    }

    // Mark post as being processed
    container.setAttribute("data-feedlyprocessing", "true")

    // Add processing indicator
    addStatusIndicator(container, "processing")

    // Track processing duration for visual feedback
    const processingStartTime = Date.now()
    const minimumProcessingTime = 400

    // Extract post content based on platform
    let postText = ""

    // ! Refactor: Move platform-specific content extraction to separate functions
    if (isTwitter) {
      try {
        const fullArticleText = container.textContent || ""
        const tweetTextElement = container.querySelector(
          '[data-testid="tweetText"]'
        )
        const mainText = tweetTextElement?.textContent || ""
        postText = mainText || fullArticleText

        if (postText.length < 30 && fullArticleText.length > postText.length) {
          postText = fullArticleText
        }
      } catch (error) {
        postText = container.textContent || ""
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

    // Get user categories - handle both array format (from storage) and Set format (if extracted from memory)
    const userCategoriesRaw = (await storage.get<{
      include: string[] | Set<string> | unknown
      exclude: string[] | Set<string> | unknown
    }>("user-categories")) || { include: [], exclude: [] }

    // Convert to arrays if needed - storage always returns arrays, but we handle Sets too for future compatibility
    const userCategories = {
      include: Array.isArray(userCategoriesRaw?.include)
        ? userCategoriesRaw.include
        : userCategoriesRaw?.include instanceof Set
          ? Array.from(userCategoriesRaw.include as Set<string>)
          : [],
      exclude: Array.isArray(userCategoriesRaw?.exclude)
        ? userCategoriesRaw.exclude
        : userCategoriesRaw?.exclude instanceof Set
          ? Array.from(userCategoriesRaw.exclude as Set<string>)
          : []
    }

    if (
      !userCategories ||
      !userCategories.exclude ||
      userCategories.exclude.length === 0
    ) {
      return
    }

    // Extract post data first
    const data: PostData = {}
    data.text = postText

    // Extract author name based on platform
    if (isTwitter) {
      // Twitter author extraction - try multiple selectors
      let authorElement = container.querySelector('[data-testid="User-Name"]')

      // If not found, try alternative selectors
      if (!authorElement) {
        // Try to find author in tweet header
        authorElement = container
          .querySelector('[data-testid="tweetText"]')
          ?.closest("article")
          ?.querySelector('[data-testid="User-Name"]')
      }

      if (!authorElement) {
        // Try to find in quoted tweets
        authorElement = container
          .querySelector('[data-testid="tweet"]')
          ?.querySelector('[data-testid="User-Name"]')
      }

      if (authorElement) {
        // The first span usually contains the display name
        const nameElement = authorElement.querySelector("span")
        // The second span with dir="ltr" usually contains the @username
        const usernameElement = authorElement.querySelector('span[dir="ltr"]')

        const displayName = nameElement?.textContent?.trim() || ""
        const username = usernameElement?.textContent?.trim() || ""

        // Check if the account is verified (has a checkmark)
        const isVerified = !!authorElement.querySelector(
          '[data-testid="icon-verified"]'
        )

        // Include both display name and username when available, plus verification status
        if (displayName && username) {
          data.actorName = `${displayName} (${username})${isVerified ? " [Verified Account]" : ""}`
        } else {
          data.actorName = `${displayName || username}${isVerified ? " [Verified Account]" : ""}`
        }
      } else {
        // Try one more approach - look for verified badge's parent
        const verifiedBadge = container.querySelector(
          '[data-testid="icon-verified"]'
        )
        if (verifiedBadge) {
          const verifiedParent = verifiedBadge.closest('div[dir="auto"]')
          if (verifiedParent) {
            data.actorName = `${verifiedParent.textContent?.trim() || ""} [Verified Account]`
          }
        }
      }
    } else {
      // LinkedIn author extraction
      const actorNameElement = container.querySelector<HTMLElement>(
        ".update-components-actor__title"
      )
      data.actorName = actorNameElement?.innerText?.trim() || ""
    }

    // Create unique identifier from post content
    const postHash = createPostHash(data)

    // Check if we already have a cover element on this post to avoid duplicates
    const existingCover = container.querySelector(".feed-ly-cover")
    if (existingCover) {
      return
    }

    // Check if we've already processed this post and have cached results
    if (processedPosts.has(postHash)) {
      const cachedResult = processedPosts.get(postHash)

      // Add detailed logging to debug reprocessing
      console.debug(
        `[Post ${postHash.substring(0, 8)}] Cache check: ` +
          `Processed at ${new Date(cachedResult.processedAt).toLocaleTimeString()}, ` +
          `Last categories update: ${new Date(lastCategoriesUpdate).toLocaleTimeString()}, ` +
          `Should reprocess: ${cachedResult.processedAt < lastCategoriesUpdate}`
      )

      // Check if the post was processed before the last categories update
      // If so, we need to reprocess it with the new categories
      if (cachedResult.processedAt < lastCategoriesUpdate) {
        // Post needs to be reprocessed with new categories
        console.debug(
          `🔄 [Post ${postHash.substring(0, 8)}] Reprocessing due to category update`
        )
        // Remove from cache to force reprocessing
        processedPosts.delete(postHash)
        // Continue with processing (don't return early)
      } else {
        // Use cached results and return early
        // If post should be blocked, apply the cover
        if (cachedResult.shouldBlock) {
          // Update status indicator to blocked with possible delay
          const processingElapsed = Date.now() - processingStartTime
          if (processingElapsed < minimumProcessingTime) {
            await new Promise((resolve) =>
              setTimeout(resolve, minimumProcessingTime - processingElapsed)
            )
          }
          addStatusIndicator(container, "blocked")

          // Find the best element to apply the overlay to
          const targetElement = findBestOverlayTarget(container, platform)

          applyPostCover(
            targetElement,
            postHash,
            cachedResult.categories,
            cachedResult.tldr,
            cachedResult.matchedCategories || []
          )

          // Remove the processing attribute
          removeProcessingAttribute(container)
        } else {
          // Post shouldn't be blocked, remove any existing cover
          const targetElement = findBestOverlayTarget(container, platform)
          removePostCover(targetElement)

          // Check if the post matches any filtered categories but not enough to block
          const hasFilteredContent = cachedResult.categories.some(
            (cat: string) =>
              userCategories?.exclude?.includes(cat) ||
              userCategories?.exclude?.some((exclude: string) =>
                cat.toUpperCase().includes(exclude.toUpperCase())
              )
          )

          // Update to filtered or processed based on content
          const processingElapsed = Date.now() - processingStartTime
          if (processingElapsed < minimumProcessingTime) {
            await new Promise((resolve) =>
              setTimeout(resolve, minimumProcessingTime - processingElapsed)
            )
          }

          if (hasFilteredContent) {
            addStatusIndicator(container, "filtered")
          } else {
            addStatusIndicator(container, "processed")
          }

          // Remove the processing attribute
          removeProcessingAttribute(container)
        }
        return
      }
    }

    try {
      // Special handling for very short tweets that might be quote tweets
      if (
        postText.length < 15 &&
        container.querySelector(
          'div[role="link"][tabindex="0"].css-175oi2r.r-adacv'
        )
      ) {
        // For very short tweets, add context that this is likely a commentary on the quoted content
        if (!postText.includes("Quoted:")) {
          const originalText = postText
          postText = `Commentary "${originalText}" on quoted content: ${postText.includes("|") ? postText.split("|")[1].trim() : "unknown content"}`
        }
      }

      // Get post categorization
      let response
      try {
        // Check if we have a cached result from the background script
        const debugObj = window.__feedlyDebug as any
        if (
          debugObj &&
          debugObj.categorizeCache &&
          debugObj.categorizeCache.has(postHash)
        ) {
          console.log(
            `🔍 [Post ${postHash.substring(0, 8)}] Using cached categorization result`
          )
          response = debugObj.categorizeCache.get(postHash)
        } else {
          // Send request to background script
          response = await sendToBackground({
            name: "categorize-post",
            body: {
              text: postText,
              authorName: data.actorName,
              userCategories: {
                include: userCategories?.include || [],
                exclude: userCategories?.exclude || []
              }
            }
          })
        }

        // Add error handling to check if response and response.categories exist
        if (!response || !response.categories) {
          console.error(
            `❌ [Post ${postHash.substring(0, 8)}] Error processing: Invalid response from background script`,
            response
          )
          // Remove processing indicator on error
          removeStatusIndicator(container)
          // Remove the processing attribute on error
          removeProcessingAttribute(container)
          return
        }
      } catch (error) {
        console.error(
          `❌ [Post ${postHash.substring(0, 8)}] Error processing:`,
          error
        )
        // Remove processing indicator on error
        removeStatusIndicator(container)
        // Remove the processing attribute on error
        removeProcessingAttribute(container)
        return
      }

      const categories = response.categories.map((cat) => cat.toUpperCase())
      const tldr = response.tldr || "No summary available"

      // Check if post should be blocked based on exclude categories
      const matchingExcludeCategories = []

      // Enhanced category matching with pattern recognition
      // This helps ensure categories like "POLITICS" are detected even if returned as "POLITICAL" or similar
      const enhancedCategories = [...categories]

      // Map of common category variations to standardized forms
      const categoryVariations = {
        POLITIC: "POLITICS",
        POLITICAL: "POLITICS",
        POLICY: "POLITICS",
        POLITICIAN: "POLITICS",
        GOVERNMENT: "POLITICS",
        ELECTION: "POLITICS",
        SPORT: "SPORTS",
        ATHLETIC: "SPORTS",
        TECHNOLOGY: "TECH",
        "ARTIFICIAL INTELLIGENCE": "AI",
        "MACHINE LEARNING": "AI",
        ML: "AI",
        "BUSINESS NEWS": "BUSINESS",
        ENTREPRENEURSHIP: "BUSINESS",
        STARTUP: "BUSINESS",
        ADVERTISEMENT: "PROMOTIONAL",
        SPONSORED: "PROMOTIONAL",
        SELLING: "PROMOTIONAL",
        PRODUCT: "PROMOTIONAL",
        HUMOR: "MEME",
        FUNNY: "MEME",
        JOKE: "MEME"
      }

      // Check if there are any patterns that match additional categories
      for (const [pattern, category] of Object.entries(categoryVariations)) {
        // If the categories already include the standardized form, skip
        if (enhancedCategories.includes(category)) continue

        // Check if any existing category contains the pattern
        const hasPattern = categories.some((cat) =>
          cat.toUpperCase().includes(pattern)
        )

        // If the pattern is found, add the standardized category
        if (hasPattern) {
          enhancedCategories.push(category)
        }
      }

      const shouldBlock = userCategories?.exclude?.some((excludeCategory) => {
        // Ensure case-insensitive comparison by converting both to uppercase
        const upperExclude = excludeCategory.toUpperCase()

        // Check if any of the post categories match this exclude category
        const isMatch = enhancedCategories.some(
          (category) => category.toUpperCase() === upperExclude
        )

        if (isMatch) {
          matchingExcludeCategories.push(upperExclude)
        }

        return isMatch
      })

      // Store the result in our cache
      processedPosts.set(postHash, {
        categories: enhancedCategories,
        tldr,
        shouldBlock,
        matchedCategories: matchingExcludeCategories,
        processedAt: Date.now()
      })

      // If categories were updated and this post was processed with the new categories,
      // check if we should update the status indicator
      if (categoriesUpdatedDirty) {
        // Check if all visible posts have been processed with the new categories
        const platform =
          window.location.hostname.includes("twitter.com") ||
          window.location.hostname.includes("x.com")
            ? "TWITTER"
            : "LINKEDIN"
        const feed = document.querySelector(FEED_SELECTORS[platform].FEED)

        if (feed) {
          const allVisiblePosts = Array.from(
            feed.querySelectorAll(FEED_SELECTORS[platform].POST)
          ).filter((post) => {
            const rect = post.getBoundingClientRect()
            return (
              rect.top >= -rect.height &&
              rect.left >= -rect.width &&
              rect.bottom <=
                (window.innerHeight || document.documentElement.clientHeight) +
                  rect.height &&
              rect.right <=
                (window.innerWidth || document.documentElement.clientWidth) +
                  rect.width
            )
          })

          // Check if all visible posts have been processed after the last categories update
          const allProcessed = allVisiblePosts.every((post) => {
            const postText = post.textContent || ""
            const postHash = createPostHash({ text: postText })

            if (!processedPosts.has(postHash)) {
              return false
            }

            const cachedResult = processedPosts.get(postHash)
            return cachedResult.processedAt >= lastCategoriesUpdate
          })

          if (allProcessed && allVisiblePosts.length > 0) {
            // All visible posts have been processed with the new categories
            showCategoryUpdateStatus(
              "All visible posts updated with new categories",
              3000
            )

            // We'll keep the dirty flag true until the user scrolls to update more posts
          }
        }
      }

      // Calculate how much time has elapsed since processing started
      const processingElapsed = Date.now() - processingStartTime

      // This ensures users can see the transition between states
      const updateStatusWithDelay = async (
        status: "processed" | "filtered" | "blocked"
      ) => {
        // Ensure minimum processing time for visual feedback
        const currentTime = Date.now()
        const elapsedTime = currentTime - processingStartTime

        if (elapsedTime < minimumProcessingTime) {
          await new Promise((resolve) =>
            setTimeout(resolve, minimumProcessingTime - elapsedTime)
          )
        }

        // Update status indicator - don't remove it to ensure smooth transitions
        addStatusIndicator(container, status)

        // Remove the processing attribute after updating the status
        removeProcessingAttribute(container)
      }

      if (shouldBlock) {
        // Update status indicator to blocked with possible delay
        await updateStatusWithDelay("blocked")

        // Find the best element to apply the overlay to
        const targetElement = findBestOverlayTarget(container, platform)

        applyPostCover(
          targetElement,
          postHash,
          enhancedCategories,
          tldr,
          matchingExcludeCategories
        )

        // Remove the processing attribute
        removeProcessingAttribute(container)
      } else {
        // If the post shouldn't be blocked, make sure to remove any existing cover
        removePostCover(findBestOverlayTarget(container, platform))

        // Check if the post matches any filtered categories but not enough to block
        const hasFilteredContent = enhancedCategories.some(
          (cat: string) =>
            userCategories?.exclude?.includes(cat) ||
            userCategories?.exclude?.some((exclude: string) =>
              cat.toUpperCase().includes(exclude.toUpperCase())
            )
        )

        // Update to filtered or processed based on content
        if (hasFilteredContent) {
          await updateStatusWithDelay("filtered")
        } else {
          // Update status indicator to processed (allowed) with possible delay
          await updateStatusWithDelay("processed")
        }

        // Remove the processing attribute
        removeProcessingAttribute(container)
      }
    } catch (error) {
      console.error(
        `❌ [Post ${postHash.substring(0, 8)}] Error processing:`,
        error
      )

      // Remove processing indicator on error
      removeStatusIndicator(container)

      // Remove the processing attribute on error
      removeProcessingAttribute(container)

      // Check for API key issues
      try {
        const apiKey = await storage.get("openai-api-key")
        if (!apiKey) {
          console.error(
            "❌ [API] OpenAI API key not set - please configure in extension options"
          )
        }
      } catch (storageError) {
        console.error("❌ [Storage] Error checking API key:", storageError)
      }
    }
  }, []) // Empty dependency array since this doesn't depend on props or state

  // Store the processPost function in the singleton for non-React code
  ContentFilterInstance.processPost = processPost

  return (
    <ContentFilterContext.Provider value={{ processPost }}>
      {children}
    </ContentFilterContext.Provider>
  )
}

// Create a hook to use the context
export function useContentFilter() {
  return React.useContext(ContentFilterContext)
}

// * Update startObserving to use the singleton
function startObserving() {
  console.log("👀 [Observer] Starting feed observation")
  const isTwitter =
    window.location.hostname.includes("twitter.com") ||
    window.location.hostname.includes("x.com")

  const platform = isTwitter ? "TWITTER" : "LINKEDIN"
  const feed = document.querySelector(FEED_SELECTORS[platform].FEED)

  if (!ContentFilterInstance.processPost) {
    console.error("❌ [Observer] processPost function not available yet")
    setTimeout(startObserving, 500)
    return
  }

  const processPost = ContentFilterInstance.processPost

  if (feed) {
    const observerOptions = {
      childList: true,
      subtree: true,
      attributes: isTwitter,
      attributeFilter: isTwitter ? ["style", "class"] : []
    }

    // ! Refactor: Consider splitting mutation handling into separate functions
    const observer = new MutationObserver((mutations) => {
      const addedNodes = new Set<Node>()

      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => addedNodes.add(node))
        } else if (isTwitter && mutation.type === "attributes") {
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
          if (isTwitter && node.matches(FEED_SELECTORS.TWITTER.POST)) {
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

    // Initial process of existing posts
    const initialPosts = feed.querySelectorAll(FEED_SELECTORS[platform].POST)
    console.log(`🔍 [Feed] Processing ${initialPosts.length} initial posts`)

    // Process posts in batches to avoid freezing the UI
    const processBatch = (startIndex: number, batchSize: number) => {
      const endIndex = Math.min(startIndex + batchSize, initialPosts.length)

      for (let i = startIndex; i < endIndex; i++) {
        const post = initialPosts[i]
        // Only process if it doesn't already have a status indicator
        // and isn't currently being processed
        if (
          !post.querySelector(".feed-ly-status-indicator") &&
          !post.hasAttribute("data-feedlyprocessing")
        ) {
          processPost(post)
        }
      }

      // Process next batch if there are more posts
      if (endIndex < initialPosts.length) {
        setTimeout(() => {
          processBatch(endIndex, batchSize)
        }, 100) // Small delay between batches
      }
    }

    // Start processing the first batch
    processBatch(0, 5)

    // For Twitter, set up an interval to recheck for posts (handles scroll events)
    if (isTwitter) {
      setInterval(() => {
        const visiblePosts = feed.querySelectorAll(FEED_SELECTORS.TWITTER.POST)
        let processedCount = 0

        // Only process a limited number of posts per interval to avoid performance issues
        for (let i = 0; i < visiblePosts.length && processedCount < 5; i++) {
          const post = visiblePosts[i]
          // Only process posts that don't already have a status indicator
          // and aren't currently being processed
          if (
            !post.querySelector(".feed-ly-status-indicator") &&
            !post.hasAttribute("data-feedlyprocessing")
          ) {
            processPost(post)
            processedCount++
          }
        }
      }, 2000) // Check every 2 seconds instead of 1 second
    }
  } else {
    console.log("⏳ [Feed] Feed not found, retrying in 1s")
    setTimeout(startObserving, 1000)
  }
}

// * Update verifyUserCategories to be compatible with Set-based categories
async function verifyUserCategories() {
  console.log("🔍 [Categories] Verifying configuration...")

  try {
    // Get user categories with proper typing
    const userCategoriesRaw = (await storage.get<{
      include: string[] | Set<string> | unknown
      exclude: string[] | Set<string> | unknown
    }>("user-categories")) || { include: [], exclude: [] }

    // First handle possibility of getting raw Set objects (which shouldn't happen from storage, but we check anyway)
    let userCategories: { include: string[]; exclude: string[] } = {
      include: [],
      exclude: []
    }

    if (!userCategoriesRaw) {
      console.log("⚠️ [Categories] None found, setting defaults")
      userCategories = { include: [], exclude: [] }
    } else {
      // Convert from Set if needed
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

    // Validate structure
    if (!userCategories) {
      console.log("⚠️ [Categories] None found, setting defaults")
      await storage.set("user-categories", { include: [], exclude: [] })
      return { include: [], exclude: [] }
    }

    // Validate include array
    if (!Array.isArray(userCategories.include)) {
      console.log("⚠️ [Categories] Include is not an array, fixing")
      userCategories.include = []
    }

    // Validate exclude array
    if (!Array.isArray(userCategories.exclude)) {
      console.log("⚠️ [Categories] Exclude is not an array, fixing")
      userCategories.exclude = []
    }

    // Ensure storage has an array version (even if we got Sets somehow)
    // Use JSON.parse/stringify to ensure we're storing a clean object
    await storage.set(
      "user-categories",
      JSON.parse(JSON.stringify(userCategories))
    )

    console.log("✅ [Categories] Verified configuration:", userCategories)
    return userCategories
  } catch (error) {
    console.error("❌ [Categories] Error verifying:", error)
    // Set defaults on error
    const defaults = { include: [], exclude: [] }
    await storage.set("user-categories", defaults)
    return defaults
  }
}

// ! Refactor: Consider moving initialization logic to a separate file
/**
 * Initializes the extension
 * Sets up message listeners, verifies configuration, and starts post processing
 */
async function initializeExtension() {
  console.log("🚀 [Initialization] Starting extension initialization")

  initializeMessageListener()
  console.log("🎧 [Initialization] Message listener initialized")

  // Check extension state and configuration
  const enabled = await storage.get<boolean>("enabled")
  const lastUpdate = await storage.get<number>("categories-updated")
  if (lastUpdate) {
    lastCategoriesUpdate = lastUpdate
    console.log(
      `🔄 [Initialization] Last categories update: ${new Date(lastCategoriesUpdate).toLocaleTimeString()}`
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

  // Initialize React app
  const rootDiv = document.createElement("div")
  rootDiv.id = "feed-ly-react-root"
  document.body.appendChild(rootDiv)

  const root = createRoot(rootDiv)
  root.render(
    <ContentFilterProvider>
      <div id="feed-ly-initialized" style={{ display: "none" }} />
    </ContentFilterProvider>
  )

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
}

// ! Refactor: Consider moving CSS management to a separate service
/**
 * Verifies that required CSS styles are properly loaded
 * Injects fallback styles if necessary
 */
function verifyCssLoaded() {
  console.log("🔍 [Styles] Checking if CSS is properly loaded...")

  const cssRules = Array.from(document.styleSheets)
    .filter((sheet) => {
      try {
        return sheet.href === null || sheet.href.includes("chrome-extension://")
      } catch (e) {
        return false
      }
    })
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules)
      } catch (e) {
        return []
      }
    })
    .map((rule) => rule.cssText)

  const hasFeedlyCss = cssRules.some(
    (rule) =>
      rule.includes(".feed-ly-compact") ||
      rule.includes(".feed-ly-wrapper") ||
      rule.includes(".feed-ly-cover")
  )

  if (!hasFeedlyCss) {
    console.log(
      "⚠️ [Styles] CSS may not be properly loaded, injecting it manually"
    )
    injectFallbackStyles()
  }
}

// ! Refactor: Consider moving debug utilities to a separate module
/**
 * Initializes debug utilities for development and troubleshooting
 * Provides functions for testing and debugging extension functionality
 */
function initDebugUtils() {
  console.log("🛠️ [Debug] Initializing debug utilities")

  window.__feedlyDebug = {
    forceReload: () => {
      console.log("🔄 [Debug] Force reloading all posts")
      verifyUserCategories().then((categories) => {
        processedPosts.clear()
        apiCache.clear()

        const platform =
          window.location.hostname.includes("twitter.com") ||
          window.location.hostname.includes("x.com")
            ? "TWITTER"
            : "LINKEDIN"
        const feed = document.querySelector(FEED_SELECTORS[platform].FEED)
        if (feed) {
          const posts = feed.querySelectorAll(FEED_SELECTORS[platform].POST)
          posts.forEach((post) => ContentFilterInstance.processPost(post))
        }
      })
    },

    // Additional debug utilities...
  }
}

// ! Refactor: Consider moving category update handling to a separate service
/**
 * Sets up scroll event listener to check for posts that need updating
 * after category changes
 */
function setupCategoryUpdateScrollCheck() {
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

// Start the extension
initializeExtension()

// * Track if categories have been updated but not all posts have been reprocessed
let categoriesUpdatedDirty = false
let categoryStatusTimeout: number | null = null

// * Function to create and show the category update status indicator
function showCategoryUpdateStatus(message: string, autoHideAfter = 0) {
  // Remove any existing status indicator
  const existingStatus = document.querySelector(".feed-ly-category-status")
  if (existingStatus) {
    existingStatus.remove()
  }

  // Clear any existing timeout
  if (categoryStatusTimeout !== null) {
    clearTimeout(categoryStatusTimeout)
    categoryStatusTimeout = null
  }

  // Create the status indicator
  const statusElement = document.createElement("div")
  statusElement.className = "feed-ly-category-status"

  // Add a data attribute for testing
  statusElement.setAttribute("data-feedly-status", "visible")

  // Create the icon
  const iconElement = document.createElement("span")
  iconElement.className = "feed-ly-category-status-icon"

  // Create the text
  const textElement = document.createElement("span")
  textElement.className = "feed-ly-category-status-text"

  // Add emoji to make the message more noticeable
  const enhancedMessage = message.includes("🔄") ? message : `🔄 ${message}`
  textElement.textContent = enhancedMessage

  // Create the close button
  const closeElement = document.createElement("span")
  closeElement.className = "feed-ly-category-status-close"
  closeElement.textContent = "✕"
  closeElement.addEventListener("click", hideCategoryUpdateStatus)

  // Assemble the status indicator
  statusElement.appendChild(iconElement)
  statusElement.appendChild(textElement)
  statusElement.appendChild(closeElement)

  // Add to the DOM
  document.body.appendChild(statusElement)

  // Force a reflow to ensure the animation works
  void statusElement.offsetWidth

  // Make it visible
  statusElement.classList.add("visible")

  // Log that we're showing the status indicator (for debugging)
  console.log(`🔔 [Status] Showing indicator: "${enhancedMessage}"`)

  // Flash the indicator to draw attention
  setTimeout(() => {
    statusElement.style.transform = "translateY(-5px) scale(1.02)"
    setTimeout(() => {
      if (statusElement && statusElement.style) {
        statusElement.style.transform = ""
      }
    }, 200)
  }, 1000)

  // Auto-hide after the specified time if requested
  if (autoHideAfter > 0) {
    // Use a longer minimum time to ensure visibility
    const minimumVisibleTime = Math.max(autoHideAfter, 5000)

    categoryStatusTimeout = window.setTimeout(() => {
      hideCategoryUpdateStatus()
      categoryStatusTimeout = null
    }, minimumVisibleTime)
  }

  return statusElement
}

// * Function to hide the category update status indicator
function hideCategoryUpdateStatus() {
  console.log("🔔 [Status] Attempting to hide category status indicator")

  const statusElement = document.querySelector(".feed-ly-category-status")
  if (statusElement) {
    // Log that we're hiding the status indicator (for debugging)
    console.log("🔔 [Status] Found indicator, hiding it now")

    // Remove the visible class to trigger the fade-out animation
    statusElement.classList.remove("visible")

    // Remove from DOM after animation completes
    setTimeout(() => {
      if (statusElement.parentNode) {
        statusElement.remove()
        console.log("🔔 [Status] Indicator removed from DOM")
      } else {
        console.log("🔔 [Status] Indicator already removed from DOM")
      }
    }, 600) // Match the animation duration (slightly longer to ensure completion)
  } else {
    console.log("🔔 [Status] No indicator found to hide")
  }

  // Clear any existing timeout
  if (categoryStatusTimeout !== null) {
    console.log("🔔 [Status] Clearing existing timeout")
    clearTimeout(categoryStatusTimeout)
    categoryStatusTimeout = null
  }
}

// * Function to check if all posts have been processed after scrolling
function setupCategoryUpdateScrollCheck() {
  let scrollTimeout: number | null = null

  window.addEventListener("scroll", () => {
    // Debounce the scroll event
    if (scrollTimeout !== null) {
      clearTimeout(scrollTimeout)
    }

    scrollTimeout = window.setTimeout(() => {
      // Only check if categories are in a dirty state
      if (categoriesUpdatedDirty) {
        const platform =
          window.location.hostname.includes("twitter.com") ||
          window.location.hostname.includes("x.com")
            ? "TWITTER"
            : "LINKEDIN"
        const feed = document.querySelector(FEED_SELECTORS[platform].FEED)

        if (feed) {
          // Get all visible posts
          const allVisiblePosts = Array.from(
            feed.querySelectorAll(FEED_SELECTORS[platform].POST)
          ).filter((post) => {
            const rect = post.getBoundingClientRect()
            return (
              rect.top >= -rect.height &&
              rect.left >= -rect.width &&
              rect.bottom <=
                (window.innerHeight || document.documentElement.clientHeight) +
                  rect.height &&
              rect.right <=
                (window.innerWidth || document.documentElement.clientWidth) +
                  rect.width
            )
          })

          // Check if all visible posts have been processed after the last categories update
          const allProcessed = allVisiblePosts.every((post) => {
            const postText = post.textContent || ""
            const postHash = createPostHash({ text: postText })
            return (
              processedPosts.has(postHash) &&
              processedPosts.get(postHash).processedAt >= lastCategoriesUpdate
            )
          })

          if (allProcessed && allVisiblePosts.length > 0) {
            // All visible posts have been processed with the new categories
            showCategoryUpdateStatus(
              "All visible posts updated with new categories",
              3000
            )
          }
        }
      }
    }, 100)
  })
}

// * Add these variables and functions to fix the linter errors
let categoriesDirty = false

/**
 * Reprocesses all currently visible posts when categories are updated.
 * Removes posts from the cache and triggers immediate reprocessing.
 * @returns void
 */
const reprocessVisiblePosts = (): void => {
  try {
    console.log("🔍 [Feed] Checking for visible posts to reprocess immediately")

    const platform =
      window.location.hostname.includes("twitter.com") ||
      window.location.hostname.includes("x.com")
        ? "TWITTER"
        : "LINKEDIN"

    const feed = document.querySelector(FEED_SELECTORS[platform].FEED)
    if (!feed) {
      console.log("❌ [Feed] Feed not found, cannot reprocess posts")
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
        // Force immediate reprocessing by removing from cache
        const postText = post.textContent || ""
        const postHash = createPostHash({ text: postText })
        if (processedPosts.has(postHash)) {
          processedPosts.delete(postHash)
        }
        // Process the post
        ContentFilterInstance.processPost(post)
      }
    })

    console.log(
      `🔄 [Feed] Immediately reprocessed ${visiblePostsCount} visible posts`
    )

    // Update the status indicator if all visible posts have been reprocessed
    if (visiblePostsCount > 0) {
      showCategoryUpdateStatus(
        `Reprocessed ${visiblePostsCount} visible posts - scroll to update more`,
        5000
      )
    }
  } catch (error) {
    console.error("❌ Error reprocessing visible posts:", error)
  }
}

/**
 * Watch for changes to user categories and trigger reprocessing.
 * When categories are updated:
 * 1. Sets categoriesDirty flag to true
 * 2. Updates lastCategoriesUpdate timestamp
 * 3. Triggers immediate reprocessing of visible posts
 * 4. Posts will be refiltered with the new categories
 */
storage.watch({
  "user-categories": (newValue) => {
    console.log("🔄 [Categories] Update received:", newValue)

    categoriesDirty = true
    lastCategoriesUpdate = Date.now() // Update the timestamp when categories change
    // Trigger reprocessing of visible posts with new categories
    reprocessVisiblePosts()
  }
})
