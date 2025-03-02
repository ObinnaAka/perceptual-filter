import type { PlasmoCSConfig } from "plasmo"
import React, { useCallback } from "react"
import { createRoot } from "react-dom/client"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

// Import our CSS
import "./social-post-blocker.css"

// Add TypeScript interface extensions for the window object
declare global {
  interface Window {
    __feedlyDebugMenuAdded?: boolean
    __feedlyLastClickedElement?: Element
    __feedlyDebug: {
      forceReload: () => void
      inspectPost: (selector: string | Element) => void
      logState: () => void
      explainFilter: () => void
    }
  }
}

export const config: PlasmoCSConfig = {
  matches: [
    "https://www.linkedin.com/feed*",
    "https://twitter.com/home",
    "https://x.com/home"
  ],
  all_frames: false
}

// Cache for API responses and processed posts
const apiCache = new Map<string, boolean>()
// Replace processedPosts Set with a Map that stores categorization results
const processedPosts = new Map<
  string,
  {
    categories: string[]
    tldr: string
    shouldBlock: boolean
    matchedCategories?: string[]
  }
>()
const storage = new Storage({ area: "local" })

interface PostData {
  actorName?: string
  text?: string
  categories?: string[]
  tldr?: string
}

// Create a hash from post data to use as identifier
const createPostHash = (data: PostData): string => {
  return `${data.actorName}-${data.text?.slice(0, 150)}` // Using first 150 chars of text should be enough
}

// Create a new component with scoped class names
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
  // Always use compact mode
  const [isCompact, setIsCompact] = React.useState(true)

  React.useEffect(() => {
    // Trigger fade-in animation after mount
    const timer = setTimeout(() => setIsVisible(true), 50)

    // We're always using compact mode now, so no need to check container height
    console.log(`📏 [UI] Using compact mode for all overlays`)

    return () => clearTimeout(timer)
  }, [])

  const handleUnmute = () => {
    // Start the unmute animation
    setIsUnmuting(true)

    // Wait for animation to complete before actually unmuting
    setTimeout(() => {
      onUnmute()
    }, 400) // Match this with the CSS animation duration
  }

  // Display matched categories if available, otherwise show first three categories
  const displayCategories =
    matchedCategories.length > 0 ? matchedCategories : categories.slice(0, 3)

  return (
    <div
      ref={containerRef}
      className={`feed-ly-container feed-ly-fade-in ${isVisible ? "feed-ly-visible" : ""} ${isUnmuting ? "feed-ly-unmuting" : ""}`}>
      {/* Always use compact layout */}
      <div className="feed-ly-compact">
        <div className="feed-ly-compact-header">
          <div className="feed-ly-compact-badge">
            <span className="feed-ly-badge-dot"></span>
            <p className="feed-ly-compact-title">Filtered content</p>
          </div>
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

// Enhance the applyPostCover function with better debugging
async function applyPostCover(
  container: Element,
  postHash: string,
  categories: string[],
  tldr: string,
  matchedCategories: string[] = []
) {
  // Check if post is already unmuted
  const unmutedPosts = (await storage.get<string[]>("unmutedPosts")) || []

  if (!unmutedPosts.includes(postHash)) {
    // First, check if container is still in the DOM
    if (!document.body.contains(container)) {
      console.log(
        `❌ [Post ${postHash.substring(0, 8)}] Container not in DOM, skipping cover`
      )
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

    if (hasMedia) {
      console.log(
        `🎥 [Post ${postHash.substring(0, 8)}] Applying media-specific cover`
      )
    }

    if (isCellInnerDiv) {
      console.log(
        `📱 [Post ${postHash.substring(0, 8)}] Applying cellInnerDiv-specific cover`
      )
    }

    // Check if we already have a cover on this element
    const existingCover = container.querySelector(".feed-ly-cover")
    if (existingCover) {
      return
    }

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

    // Apply more aggressive inline styles with blur effect
    coverDiv.style.position = "absolute"
    coverDiv.style.top = "0"
    coverDiv.style.right = "0"
    coverDiv.style.bottom = "0"
    coverDiv.style.left = "0"
    coverDiv.style.zIndex = isCellInnerDiv ? "10000" : "9999"
    coverDiv.style.backgroundColor =
      hasMedia || isCellInnerDiv
        ? "rgba(255, 255, 255, 0.4)"
        : "rgba(255, 255, 255, 0.05)"
    coverDiv.style.backdropFilter =
      hasMedia || isCellInnerDiv ? "blur(15px)" : "blur(10px)"
    coverDiv.style.display = "flex"
    coverDiv.style.justifyContent = "center" // Center horizontally
    coverDiv.style.alignItems = "flex-start" // Align to top
    coverDiv.style.width = "100%"
    coverDiv.style.height = "100%"
    coverDiv.style.padding = "16px" // Add some padding

    // Add the cover directly to the container
    container.appendChild(coverDiv)

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
          backdrop-filter: blur(10px) !important;
          -webkit-backdrop-filter: blur(10px) !important;
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
          padding: 14px 18px !important;
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
        
        .feed-ly-compact-header {
          display: flex !important;
          flex-direction: column !important;
          gap: 8px !important;
        }
        
        .feed-ly-compact-badge {
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
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
        
        .feed-ly-compact-title {
          font-size: 15px !important;
          font-weight: 600 !important;
          color: #0f1419 !important;
          margin: 0 !important;
          letter-spacing: 0.01em !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
        
        .feed-ly-compact-tags {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 6px !important;
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
  }
}

// Update Twitter-specific selectors and processing
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

// Helper function to analyze post container and find best element to apply overlay
function findBestOverlayTarget(container: Element, platform: string): Element {
  // Default to the container itself
  let targetElement = container

  if (platform === "TWITTER") {
    // First, try to find the cellInnerDiv which is the highest-level container
    const cellInnerDiv = container.closest('[data-testid="cellInnerDiv"]')

    if (cellInnerDiv) {
      // If we found the cellInnerDiv, use it as it's the highest level container
      targetElement = cellInnerDiv
      console.log("🎯 [Overlay] Using cellInnerDiv for complete coverage")
      return targetElement
    }

    // If no cellInnerDiv, try to find the article element
    const article = container.closest("article")

    if (article) {
      // If we found an article, use it
      targetElement = article
      console.log("🎯 [Overlay] Using article element for overlay")

      // For media tweets, we need to find the parent that fully contains the media
      // Look for video or image containers
      const mediaContainer = article.querySelector(
        '[data-testid="videoPlayer"], [data-testid="tweetPhoto"], [data-testid="videoComponent"]'
      )

      if (mediaContainer) {
        console.log("🎥 [Media Tweet] Found media content, optimizing overlay")
        // If we found media content, use the article's parent to ensure full coverage
        const articleParent =
          article.parentElement?.parentElement?.parentElement
        if (articleParent) {
          targetElement = articleParent
          console.log(
            "🎯 [Overlay] Using article's grandparent for media tweet overlay"
          )
        }
      }
    } else {
      // Try to find the main content area of the tweet
      const tweetContent = container
        .querySelector('[data-testid="tweetText"]')
        ?.closest('div[dir="auto"]')?.parentElement

      if (tweetContent) {
        targetElement = tweetContent
        console.log("🎯 [Overlay] Using tweet content element for overlay")
      } else {
        // Try alternative selectors for Twitter's new layout
        const alternativeSelectors = [
          // Media containers
          '[data-testid="cellInnerDiv"] div[style*="max-height"]',
          '[data-testid="videoPlayer"]',
          // Main tweet container in timeline
          '[data-testid="cellInnerDiv"]',
          // Tweet container in thread view
          '[data-testid="tweet"]',
          // General tweet container
          ".css-1dbjc4n.r-1iusvr4.r-16y2uox",
          // Fallback to any div with substantial content
          "div.css-1dbjc4n:not(.r-18u37iz)"
        ]

        for (const selector of alternativeSelectors) {
          const element = container.closest(selector)
          if (element) {
            targetElement = element
            console.log(
              `🎯 [Overlay] Using alternative selector "${selector}" for overlay`
            )
            break
          }
        }
      }
    }
  } else if (platform === "LINKEDIN") {
    // For LinkedIn, try to find the main post container
    const postContainer = container.closest(".feed-shared-update-v2")

    if (postContainer) {
      targetElement = postContainer
    } else {
      // Try alternative LinkedIn selectors
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

// This is a singleton to store the processPost function
const ContentFilterInstance = {
  processPost: null as ((container: Element) => Promise<void>) | null
}

// Create a React context to share functionality
const ContentFilterContext = React.createContext<{
  processPost: (container: Element) => Promise<void>
}>({
  processPost: async () => {}
})

// Create a provider component
export function ContentFilterProvider({ children }) {
  const storage = new Storage()

  // Convert processPost to useCallback
  const processPost = useCallback(async (container: Element) => {
    // Check if filter is enabled
    const enabled = await storage.get("enabled")

    if (!enabled) {
      return
    }

    // Determine which platform we're on
    const isTwitter =
      window.location.hostname.includes("twitter.com") ||
      window.location.hostname.includes("x.com")

    const platform = isTwitter ? "TWITTER" : "LINKEDIN"

    // Skip if not a post container
    if (!container.matches(FEED_SELECTORS[platform].POST)) {
      return
    }

    // Extract text content based on platform
    let postText = ""

    if (isTwitter) {
      // Twitter-specific content extraction
      try {
        // For improved Twitter extraction, get the full article content
        const fullArticleText = container.textContent || ""

        // Get main tweet text - try multiple selectors
        const tweetTextElement = container.querySelector(
          '[data-testid="tweetText"]'
        )

        // Extract the main text
        const mainText = tweetTextElement?.textContent || ""

        // Combine with full context for better categorization
        postText = mainText || fullArticleText

        console.log(
          `🔍 [Twitter] Extracted text (${postText.length} chars): "${postText.substring(0, 100)}${postText.length > 100 ? "..." : ""}`
        )

        // Add additional context for shortened tweets
        if (postText.length < 30 && fullArticleText.length > postText.length) {
          console.log(
            `📝 [Twitter] Adding additional context from full article`
          )
          postText = fullArticleText
        }
      } catch (error) {
        console.error(`❌ [Twitter] Error extracting text:`, error)
        // Fallback to full element text
        postText = container.textContent || ""
      }

      // Check for media content descriptions
      if (!postText) {
        postText = container.textContent || ""
      }
    } else {
      // LinkedIn text extraction
      const textElement = container.querySelector(
        ".feed-shared-update-v2__description, .update-components-text"
      )
      postText = textElement?.textContent || ""

      // Try alternative LinkedIn selectors if needed
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

    // Log the categories being used for filtering
    console.log(`🔍 [Categories] Using categories for filtering:`, {
      include: userCategories.include,
      exclude: userCategories.exclude
    })

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

        console.log(`👤 [Twitter Author] Found: ${data.actorName}`)
      } else {
        // Try one more approach - look for verified badge's parent
        const verifiedBadge = container.querySelector(
          '[data-testid="icon-verified"]'
        )
        if (verifiedBadge) {
          const verifiedParent = verifiedBadge.closest('div[dir="auto"]')
          if (verifiedParent) {
            data.actorName = `${verifiedParent.textContent?.trim() || ""} [Verified Account]`
            console.log(
              `👤 [Twitter Author] Found via verified badge: ${data.actorName}`
            )
          }
        }
      }
    } else {
      // LinkedIn author extraction
      const actorNameElement = container.querySelector<HTMLElement>(
        ".update-components-actor__title"
      )
      data.actorName = actorNameElement?.innerText?.trim() || ""

      if (data.actorName) {
        console.log(`👤 [LinkedIn Author] Found: ${data.actorName}`)
      }
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
      console.log(
        `🔄 [Post ${postHash.substring(0, 8)}] Using cached categorization`
      )

      // If post should be blocked, apply the cover
      if (cachedResult.shouldBlock) {
        // Find the best element to apply the overlay to
        const targetElement = findBestOverlayTarget(container, platform)

        applyPostCover(
          targetElement,
          postHash,
          cachedResult.categories,
          cachedResult.tldr,
          cachedResult.matchedCategories || []
        )
      }
      return
    }

    try {
      console.log(
        `🔍 [Post ${postHash.substring(0, 8)}] Categorizing text: "${postText.substring(0, 100)}${postText.length > 100 ? "..." : ""}"`
      )

      // Special handling for very short tweets that might be quote tweets
      if (
        postText.length < 15 &&
        container.querySelector(
          'div[role="link"][tabindex="0"].css-175oi2r.r-adacv'
        )
      ) {
        console.log(
          `⚠️ [Short Tweet] Detected very short tweet with quote: "${postText}"`
        )

        // For very short tweets, add context that this is likely a commentary on the quoted content
        if (!postText.includes("Quoted:")) {
          const originalText = postText
          postText = `Commentary "${originalText}" on quoted content: ${postText.includes("|") ? postText.split("|")[1].trim() : "unknown content"}`
          console.log(
            `🔄 [Context] Added context to short tweet: "${postText.substring(0, 100)}${postText.length > 100 ? "..." : ""}"`
          )
        }
      }

      // Log the final text that will be sent for categorization
      console.log(
        `📤 [Final Text] Sending for categorization: "${postText.substring(0, 100)}${postText.length > 100 ? "..." : ""}"`
      )

      if (data.actorName) {
        console.log(`👤 [Author] Post author: "${data.actorName}"`)
      }

      // Get post categorization
      const response = await sendToBackground({
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

      const categories = response.categories.map((cat) => cat.toUpperCase())
      const tldr = response.tldr

      console.log(
        `📊 [Post ${postHash.substring(0, 8)}] Categories: ${categories.join(", ")}`
      )
      console.log(`📝 [Post ${postHash.substring(0, 8)}] TLDR: ${tldr}`)

      // Check if post should be blocked based on exclude categories
      const matchingExcludeCategories = []

      // Special logging for POLITICS category (since that's what the user is trying to filter)
      if (categories.includes("POLITICS")) {
        console.log(
          `🔴 [Post ${postHash.substring(0, 8)}] Contains POLITICS category which should be filtered`
        )
      }

      // Log the excluded categories we're checking against
      console.log(
        `🔍 [Post ${postHash.substring(0, 8)}] Checking against exclude categories:`,
        userCategories.exclude.map((cat) => cat.toUpperCase())
      )

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
          console.log(
            `🔄 [Post ${postHash.substring(0, 8)}] Found pattern "${pattern}" - adding "${category}" category`
          )
          enhancedCategories.push(category)
        }
      }

      // Log enhanced categories if they differ from the original
      if (enhancedCategories.length > categories.length) {
        console.log(
          `📊 [Post ${postHash.substring(0, 8)}] Enhanced categories: ${enhancedCategories.join(", ")}`
        )
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
          console.log(
            `🎯 [Post ${postHash.substring(0, 8)}] Matched exclude category: ${upperExclude}`
          )
        }

        return isMatch
      })

      // Log the filtering results
      if (shouldBlock) {
        console.log(
          `🚫 [Post ${postHash.substring(0, 8)}] FILTERED - Matched exclude ${matchingExcludeCategories.length > 1 ? "categories" : "category"}: ${matchingExcludeCategories.join(", ")}`
        )
      } else {
        console.log(
          `✅ [Post ${postHash.substring(0, 8)}] ALLOWED - No matching exclude categories`
        )
      }

      // Store the result in our cache
      processedPosts.set(postHash, {
        categories: enhancedCategories,
        tldr,
        shouldBlock,
        matchedCategories: matchingExcludeCategories
      })

      if (shouldBlock) {
        // Find the best element to apply the overlay to
        const targetElement = findBestOverlayTarget(container, platform)

        applyPostCover(
          targetElement,
          postHash,
          enhancedCategories,
          tldr,
          matchingExcludeCategories
        )
      }
    } catch (error) {
      console.error(
        `❌ [Post ${postHash.substring(0, 8)}] Error processing:`,
        error
      )

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

// Update startObserving to use the singleton
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
    // For Twitter, we need a more aggressive observer setup
    const observerOptions = {
      childList: true,
      subtree: true,
      attributes: isTwitter, // Watch for attribute changes on Twitter
      attributeFilter: isTwitter ? ["style", "class"] : [] // Watch these attrs on Twitter
    }

    const observer = new MutationObserver((mutations) => {
      // Group the added nodes to avoid processing the same posts multiple times
      const addedNodes = new Set<Node>()

      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => addedNodes.add(node))
        } else if (isTwitter && mutation.type === "attributes") {
          // On attribute changes on Twitter, recheck the entire container
          if (
            mutation.target instanceof HTMLElement &&
            mutation.target.matches(FEED_SELECTORS.TWITTER.POST)
          ) {
            addedNodes.add(mutation.target)
          }
        }
      }

      // Process all the uniquely added nodes
      addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          // For Twitter posts that are brought back into view
          if (isTwitter && node.matches(FEED_SELECTORS.TWITTER.POST)) {
            processPost(node)
          }
          // For all cases, check if any child elements are posts
          else {
            const posts = node.querySelectorAll(FEED_SELECTORS[platform].POST)
            posts.forEach((post) => processPost(post))
          }
        }
      })
    })

    observer.observe(feed, observerOptions)

    // Initial process of existing posts
    const initialPosts = feed.querySelectorAll(FEED_SELECTORS[platform].POST)
    console.log(`🔍 [Feed] Processing ${initialPosts.length} initial posts`)
    initialPosts.forEach(processPost)

    // For Twitter, set up an interval to recheck for posts (handles scroll events)
    if (isTwitter) {
      setInterval(() => {
        const visiblePosts = feed.querySelectorAll(FEED_SELECTORS.TWITTER.POST)
        visiblePosts.forEach(processPost)
      }, 1000) // Check every 1 second - adjust if needed
    }
  } else {
    console.log("⏳ [Feed] Feed not found, retrying in 1s")
    setTimeout(startObserving, 1000)
  }
}

// Update storage watch handlers
storage.watch({
  "user-categories": (newValue) => {
    // Type guard to check if newValue has the expected structure
    if (newValue && typeof newValue === "object") {
      const categories = newValue as unknown as {
        include?: string[]
        exclude?: string[]
      }

      console.log("🔄 [Categories] Updated:")
      if (categories.include && Array.isArray(categories.include)) {
        console.log(
          `  • Include (${categories.include.length}): ${categories.include.length ? categories.include.join(", ") : "(none)"}`
        )
      }

      if (categories.exclude && Array.isArray(categories.exclude)) {
        console.log(
          `  • Exclude (${categories.exclude.length}): ${categories.exclude.length ? categories.exclude.join(", ") : "(none)"}`
        )
      }
    }

    // Clear processed posts cache and reprocess
    console.log("🧹 [Cache] Cleared due to category update")
    processedPosts.clear()
    apiCache.clear() // Also clear API cache to force re-categorization

    const platform =
      window.location.hostname.includes("twitter.com") ||
      window.location.hostname.includes("x.com")
        ? "TWITTER"
        : "LINKEDIN"
    const feed = document.querySelector(FEED_SELECTORS[platform].FEED)
    if (feed) {
      const allPosts = feed.querySelectorAll(FEED_SELECTORS[platform].POST)
      console.log(
        `🔄 [Feed] Reprocessing ${allPosts.length} posts due to category update`
      )
      allPosts.forEach((post) => ContentFilterInstance.processPost(post))
    }
  },
  "categories-updated": (newValue) => {
    console.log("🔄 [Categories] Update triggered from popup:", newValue)

    // Force a refresh of categories from storage
    verifyUserCategories().then((categories) => {
      console.log("🔄 [Categories] Refreshed from storage:", categories)

      // Clear caches
      processedPosts.clear()
      apiCache.clear()

      // Reprocess all posts
      const platform =
        window.location.hostname.includes("twitter.com") ||
        window.location.hostname.includes("x.com")
          ? "TWITTER"
          : "LINKEDIN"
      const feed = document.querySelector(FEED_SELECTORS[platform].FEED)
      if (feed) {
        const allPosts = feed.querySelectorAll(FEED_SELECTORS[platform].POST)
        console.log(
          `🔄 [Feed] Reprocessing ${allPosts.length} posts due to category update trigger`
        )
        allPosts.forEach((post) => ContentFilterInstance.processPost(post))
      }
    })
  },
  enabled: (newEnabled) => {
    // Cast the newValue to boolean explicitly
    const enabled = Boolean(newEnabled)
    console.log(`⚙️ [State] Filter ${enabled ? "ENABLED ✅" : "DISABLED ❌"}`)

    // Clear processed posts cache and reprocess
    console.log("🧹 [Cache] Cleared due to enabled state change")
    processedPosts.clear()

    const platform =
      window.location.hostname.includes("twitter.com") ||
      window.location.hostname.includes("x.com")
        ? "TWITTER"
        : "LINKEDIN"
    const feed = document.querySelector(FEED_SELECTORS[platform].FEED)
    if (newEnabled && feed) {
      const allPosts = feed.querySelectorAll(FEED_SELECTORS[platform].POST)
      console.log(
        `🔄 [Feed] Reprocessing ${allPosts.length} posts due to enabled state change`
      )
      allPosts.forEach((post) => ContentFilterInstance.processPost(post))
    } else {
      console.log("🔄 [Feed] Filter disabled - no posts will be blocked")
    }
  }
})

// Update verifyUserCategories to be compatible with Set-based categories
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

// Initialize the extension
async function initializeExtension() {
  console.log("🚀 [Initialization] Starting extension initialization")

  // Check if we're on a supported site
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

  // Check if extension is enabled
  const enabled = await storage.get<boolean>("enabled")
  if (enabled === false) {
    console.log("⚠️ [Initialization] Extension is disabled")
    return
  }

  // Log current categories for debugging
  const userCategoriesRaw = await storage.get<{
    include: string[] | Set<string> | unknown
    exclude: string[] | Set<string> | unknown
  }>("user-categories")

  console.log(
    "📋 [Categories] Current categories from storage:",
    userCategoriesRaw
  )

  // Verify if POLITICS is in the exclude categories
  const excludeCategories = Array.isArray(userCategoriesRaw?.exclude)
    ? userCategoriesRaw.exclude
    : userCategoriesRaw?.exclude instanceof Set
      ? Array.from(userCategoriesRaw.exclude as Set<string>)
      : []

  if (excludeCategories.some((cat) => cat.toUpperCase() === "POLITICS")) {
    console.log(
      "✅ [Categories] POLITICS is in the exclude categories - political content will be filtered"
    )
  } else {
    console.log(
      "⚠️ [Categories] POLITICS is NOT in the exclude categories - political content will NOT be filtered"
    )
  }

  // Verify CSS is properly loaded
  verifyCssLoaded()

  // Initialize debug utilities early
  initDebugUtils()

  // Verify user categories
  await verifyUserCategories()

  // Create a root div for React to render into
  const rootDiv = document.createElement("div")
  rootDiv.id = "feed-ly-react-root"
  document.body.appendChild(rootDiv)

  // Initialize React app with ContentFilterProvider
  const root = createRoot(rootDiv)
  root.render(
    <ContentFilterProvider>
      <div id="feed-ly-initialized" style={{ display: "none" }} />
    </ContentFilterProvider>
  )

  // Start observing the feed once React is mounted
  // We'll use an observer pattern so the React context is available
  const checkReactInitialized = setInterval(() => {
    if (document.getElementById("feed-ly-initialized")) {
      clearInterval(checkReactInitialized)
      startObserving()
      console.log(
        "✅ [Initialization] Extension initialized successfully with React context"
      )
    }
  }, 100)
}

// Function to verify CSS is properly loaded
function verifyCssLoaded() {
  console.log("🔍 [Styles] Checking if CSS is properly loaded...")

  // Check if a CSS rule from our stylesheet exists
  const cssRules = Array.from(document.styleSheets)
    .filter((sheet) => {
      try {
        // Only consider sheets from our extension
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

  // Look for our specific CSS classes
  const hasFeedlyCss = cssRules.some(
    (rule) =>
      rule.includes(".feed-ly-compact") ||
      rule.includes(".feed-ly-wrapper") ||
      rule.includes(".feed-ly-cover")
  )

  if (hasFeedlyCss) {
    console.log("✅ [Styles] CSS is properly loaded")
  } else {
    console.log(
      "⚠️ [Styles] CSS may not be properly loaded, injecting it manually"
    )

    // Inject the CSS manually as a fallback
    const style = document.createElement("style")
    style.textContent = `
      .feed-ly-wrapper {
        position: relative;
        width: 100%;
        height: 100%;
        z-index: 1000;
      }
      .feed-ly-compact {
        background: rgba(29, 155, 240, 0.1);
        border: 1px solid rgba(29, 155, 240, 0.2);
        border-radius: 12px;
        padding: 12px 16px;
        margin: 8px 0;
        backdrop-filter: blur(8px);
      }
      .feed-ly-compact-header {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
      }
      .feed-ly-badge-dot {
        width: 8px;
        height: 8px;
        background: #1d9bf0;
        border-radius: 50%;
        margin-right: 8px;
      }
      .feed-ly-compact-title {
        font-weight: 600;
        font-size: 15px;
        color: #0f1419;
      }
      .feed-ly-compact-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 12px;
      }
      .feed-ly-compact-tag {
        background: rgba(29, 155, 240, 0.2);
        color: #1d9bf0;
        padding: 4px 8px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 500;
      }
      .feed-ly-more-tag {
        color: #536471;
        font-size: 12px;
      }
      .feed-ly-compact-button {
        background: #1d9bf0;
        color: white;
        border: none;
        border-radius: 20px;
        padding: 6px 16px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      .feed-ly-compact-button:hover {
        background: #1a8cd8;
      }
      .feed-ly-button-text {
        margin-right: 4px;
      }
      .feed-ly-button-icon {
        font-size: 16px;
      }
      .feed-ly-fade-in {
        animation: feedlyFadeIn 0.3s ease forwards;
      }
      @keyframes feedlyFadeIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      /* Dark mode support */
      body.twitter-night .feed-ly-compact,
      .dark .feed-ly-compact {
        background: rgba(29, 155, 240, 0.15);
        border-color: rgba(29, 155, 240, 0.3);
      }
      body.twitter-night .feed-ly-compact-title,
      .dark .feed-ly-compact-title {
        color: #e7e9ea;
      }
    `
    document.head.appendChild(style)
    console.log("✅ [Styles] CSS manually injected as fallback")
  }
}

// Initialize debug utilities
function initDebugUtils() {
  console.log("🛠️ [Debug] Initializing debug utilities")

  window.__feedlyDebug = {
    // Force reload of all posts
    forceReload: () => {
      console.log("🔄 [Debug] Force reloading all posts")

      // Clear caches
      processedPosts.clear()

      // Verify user categories
      verifyUserCategories()

      // Reprocess posts from feed
      const isTwitter =
        window.location.hostname.includes("twitter.com") ||
        window.location.hostname.includes("x.com")
      const platform = isTwitter ? "TWITTER" : "LINKEDIN"

      const posts = document.querySelectorAll(FEED_SELECTORS[platform].POST)
      console.log(`🔍 [Debug] Found ${posts.length} posts to reprocess`)

      posts.forEach((post) => {
        ContentFilterInstance.processPost(post)
      })

      return `Reprocessed ${posts.length} posts`
    },

    // Inspect a specific post
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
        return "No element found"
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
        const postHash = createPostHash({ text: postText })

        if (processedPosts.has(postHash)) {
          const cachedResult = processedPosts.get(postHash)
          console.log("🔄 [Debug] Found cached result:", cachedResult)
        }

        // Process this post now
        ContentFilterInstance.processPost(element)

        return "Post inspection complete - check console for details"
      } catch (error) {
        console.error("❌ [Debug] Error inspecting post:", error)
        return "Error inspecting post"
      }
    },

    // Log current state
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

      return "State logged to console"
    },

    // Explain how to use the filter
    explainFilter: () => {
      console.log(
        "🔍 FEEDLY FILTER DEBUGGING HELP 🔍\n\n" +
          "Available commands:\n" +
          "- window.__feedlyDebug.forceReload() - Reprocess all posts in the feed\n" +
          "- window.__feedlyDebug.inspectPost(element) - Inspect a specific post (pass a selector or element)\n" +
          "- window.__feedlyDebug.logState() - Log current extension state\n" +
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

      return "Help information logged to console"
    }
  }

  console.log(
    "✅ [Debug] Debug utilities initialized - use window.__feedlyDebug to access"
  )
}

// Replace startObserving() with initializeExtension() at the end of the file
initializeExtension()
