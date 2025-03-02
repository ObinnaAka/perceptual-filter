import type { PlasmoCSConfig } from "plasmo"
import React from "react"
import { createRoot } from "react-dom/client"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

export const config: PlasmoCSConfig = {
  matches: [
    "https://www.linkedin.com/feed*",
    "https://twitter.com/home*",
    "https://x.com/home*"
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

  // Prioritize matched categories for display if available
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
            {displayCategories.map((category) => (
              <span key={category} className="feed-ly-compact-tag">
                {category}
              </span>
            ))}
            {categories.length > 3 && displayCategories.length === 3 && (
              <span className="feed-ly-compact-tag feed-ly-more-tag">
                +{categories.length - 3}
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

    // Check if we already have a cover on this element
    const existingCover = container.querySelector(".feed-ly-cover")
    if (existingCover) {
      return
    }

    // Create a wrapper div with position relative to ensure proper positioning context
    const wrapperDiv = document.createElement("div")
    wrapperDiv.className = "feed-ly-wrapper"
    wrapperDiv.style.position = "relative"
    wrapperDiv.style.width = "100%"
    wrapperDiv.style.height = "100%"
    wrapperDiv.style.overflow = "hidden"

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
    coverDiv.className = "feed-ly-cover"

    // Apply more aggressive inline styles with blur effect
    coverDiv.style.position = "absolute"
    coverDiv.style.top = "0"
    coverDiv.style.right = "0"
    coverDiv.style.bottom = "0"
    coverDiv.style.left = "0"
    coverDiv.style.zIndex = "9999" // Use much higher z-index
    coverDiv.style.backgroundColor = "rgba(255, 255, 255, 0.05)" // Reduced to 5% opacity
    coverDiv.style.backdropFilter = "blur(10px)" // Stronger blur effect
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
function findBestOverlayTarget(
  container: Element,
  platform: string
): HTMLElement {
  // Cast the container to HTMLElement
  const htmlContainer = container as HTMLElement

  // For Twitter, try to find a more specific container if possible
  if (platform === "TWITTER") {
    // Try to find a more specific container for better positioning
    const tweetInner = container.querySelector(
      '[data-testid="tweet"] > div:first-child'
    )
    if (tweetInner && tweetInner instanceof HTMLElement) {
      console.log(
        `📌 [Positioning] Using tweet inner container for better positioning`
      )
      return tweetInner
    }

    // Alternative Twitter selectors that might provide better positioning context
    const alternativeSelectors = [
      'div[data-testid="tweetText"]',
      'div.css-1dbjc4n[style*="position: relative"]',
      'div[data-testid="cellInnerDiv"] > div'
    ]

    for (const selector of alternativeSelectors) {
      const element = container.querySelector(selector)
      if (element && element instanceof HTMLElement) {
        console.log(`📌 [Positioning] Using alternative container: ${selector}`)
        return element
      }
    }
  }

  // For LinkedIn, also try specific containers
  if (platform === "LINKEDIN") {
    const feedItem = container.querySelector(".feed-shared-update-v2__content")
    if (feedItem && feedItem instanceof HTMLElement) {
      console.log(
        `📌 [Positioning] Using LinkedIn feed item content for better positioning`
      )
      return feedItem
    }
  }

  // Return the original container if no better target found
  return htmlContainer
}

// Update processPost to use the new targeting function
async function processPost(container: Element) {
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
    // Get main tweet text
    const tweetTextElement = container.querySelector(
      '[data-testid="tweetText"]'
    )
    postText = tweetTextElement?.textContent || ""

    // Check for media content descriptions
    const mediaElements = container.querySelectorAll(
      'div[data-testid="tweetPhoto"], div[data-testid="videoPlayer"]'
    )
    if (mediaElements.length > 0) {
      // Look for alt text or descriptions
      mediaElements.forEach((media) => {
        const mediaDescription =
          media.getAttribute("aria-label") ||
          media.querySelector("[aria-label]")?.getAttribute("aria-label") ||
          media.querySelector("img")?.getAttribute("alt")

        if (
          mediaDescription &&
          !mediaDescription.includes("Image") &&
          !mediaDescription.includes("Video")
        ) {
          console.log(
            `🖼️ [Media] Found media description: "${mediaDescription.substring(0, 50)}${mediaDescription.length > 50 ? "..." : ""}"`
          )
          postText = postText
            ? `${postText} | Media: ${mediaDescription}`
            : mediaDescription
        }
      })
    }

    // Check for quoted tweet content
    const quotedTweet = container.querySelector(
      'div[role="link"][tabindex="0"].css-175oi2r.r-adacv'
    )
    if (quotedTweet) {
      // Find the text content in the quoted tweet
      const quotedTweetText =
        quotedTweet.querySelector('[data-testid="tweetText"]')?.textContent ||
        ""

      // If we found quoted tweet text, add it to the main text with a separator
      if (quotedTweetText) {
        console.log(
          `🔄 [Quote Tweet] Found quoted content: "${quotedTweetText.substring(0, 50)}${quotedTweetText.length > 50 ? "..." : ""}"`
        )
        postText = postText
          ? `${postText} | Quoted: ${quotedTweetText}`
          : quotedTweetText
      } else {
        // Try alternative selectors for quoted tweet text
        const alternativeQuotedSelectors = [
          '.css-146c3p1[dir="auto"]',
          ".css-1jxf684",
          'div[lang="en"]'
        ]

        for (const selector of alternativeQuotedSelectors) {
          const element = quotedTweet.querySelector(selector)
          if (
            element &&
            element.textContent &&
            element.textContent.trim().length > 0
          ) {
            const quotedText = element.textContent.trim()
            console.log(
              `🔄 [Quote Tweet] Found quoted content (alt): "${quotedText.substring(0, 50)}${quotedText.length > 50 ? "..." : ""}"`
            )
            postText = postText
              ? `${postText} | Quoted: ${quotedText}`
              : quotedText
            break
          }
        }
      }
    }

    // If we still couldn't find text, try a more comprehensive approach
    if (!postText || postText.trim().length < 5) {
      console.log(
        `⚠️ [Text Extraction] Minimal text found, trying comprehensive extraction`
      )

      // Get all text nodes that might contain meaningful content
      const allTextElements = Array.from(
        container.querySelectorAll(
          '.css-901oao, .css-1jxf684, [data-testid="tweet"] span, [dir="auto"]'
        )
      ).filter((el) => {
        const text = el.textContent?.trim() || ""
        // Filter out very short texts, usernames, timestamps, etc.
        return (
          text.length > 5 &&
          !text.startsWith("@") &&
          !text.match(/^\d+[KM]?$/) && // Metrics like 10K, 5M
          !text.match(/^\w{3} \d{1,2}$/)
        ) // Date formats like "Feb 28"
      })

      // Combine all found text elements
      const combinedText = allTextElements
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .join(" | ")

      if (combinedText && combinedText.length > postText.length) {
        console.log(
          `📝 [Text Extraction] Found comprehensive text: "${combinedText.substring(0, 50)}${combinedText.length > 50 ? "..." : ""}"`
        )
        postText = combinedText
      }
    }

    // If we still couldn't find text with the primary selector, try some alternatives
    if (!postText) {
      // Try other potential text containers
      const alternativeSelectors = [
        '[data-testid="tweet"] > div:nth-child(2)',
        ".css-901oao"
      ]
      for (const selector of alternativeSelectors) {
        const element = container.querySelector(selector)
        if (element && element.textContent) {
          postText = element.textContent
          break
        }
      }
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

  const actorNameElement = container.querySelector<HTMLElement>(
    ".update-components-actor__title"
  )
  data.actorName = actorNameElement?.innerText?.trim() || ""

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

    // Get post categorization
    const response = await sendToBackground({
      name: "categorize-post",
      body: {
        text: postText,
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

      // If text contains a politics-related term and we're checking for politics
      if (pattern === "POLITIC" || pattern === "POLITICAL") {
        const hasPoliticalTerms =
          postText.toUpperCase().includes("POLITIC") ||
          postText.toUpperCase().includes("VOTE") ||
          postText.toUpperCase().includes("ELECTION") ||
          postText.toUpperCase().includes("GOVERNMENT") ||
          postText.toUpperCase().includes("PRESIDENT") ||
          postText.toUpperCase().includes("DEMOCRAT") ||
          postText.toUpperCase().includes("REPUBLICAN")

        if (hasPoliticalTerms && !enhancedCategories.includes("POLITICS")) {
          console.log(
            `🔍 [Post ${postHash.substring(0, 8)}] Political terms detected in post text - adding POLITICS category`
          )
          enhancedCategories.push("POLITICS")
        }
      }

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
}

// Update startObserving to add more debugging info
function startObserving() {
  console.log("👀 [Observer] Starting feed observation")
  const isTwitter =
    window.location.hostname.includes("twitter.com") ||
    window.location.hostname.includes("x.com")

  const platform = isTwitter ? "TWITTER" : "LINKEDIN"
  const feed = document.querySelector(FEED_SELECTORS[platform].FEED)

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

// Update watch function
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
      allPosts.forEach(processPost)
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
        allPosts.forEach(processPost)
      }
    })
  },
  enabled: (newValue) => {
    // Cast the newValue to boolean explicitly
    const enabled = Boolean(newValue)
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
    if (feed) {
      const allPosts = feed.querySelectorAll(FEED_SELECTORS[platform].POST)
      if (enabled) {
        console.log(
          `🔄 [Feed] Reprocessing ${allPosts.length} posts due to enabled state change`
        )
        allPosts.forEach(processPost)
      } else {
        console.log("🔄 [Feed] Filter disabled - no posts will be blocked")
      }
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

// Initialize extension with category check and debug message
const initializeExtension = async () => {
  console.log("===============================================")
  console.log("🚀 [Feed.ly] Initializing")
  console.log("===============================================")

  try {
    // Check if we're on a supported site
    const isTwitter =
      window.location.hostname.includes("twitter.com") ||
      window.location.hostname.includes("x.com")
    const isLinkedIn = window.location.hostname.includes("linkedin.com")

    if (!isTwitter && !isLinkedIn) {
      console.log("❌ [Site] Not supported")
      return
    }

    console.log(`✅ [Site] Supported: ${isTwitter ? "Twitter/X" : "LinkedIn"}`)

    // Verify enabled state
    const enabled = await storage.get<boolean>("enabled")
    console.log(`⚙️ [State] Filter ${enabled ? "ENABLED ✅" : "DISABLED ❌"}`)

    // Verify categories - force a clean verification
    await storage.remove("user-categories-temp") // Remove any temporary storage
    const userCategories = await verifyUserCategories()

    // Output how many categories are configured
    if (userCategories) {
      console.log("📋 [Categories] Configuration:")
      console.log(
        `  • Include (${userCategories.include.length}): ${userCategories.include.length ? userCategories.include.join(", ") : "(none)"}`
      )
      console.log(
        `  • Exclude (${userCategories.exclude.length}): ${userCategories.exclude.length ? userCategories.exclude.join(", ") : "(none)"}`
      )

      if (userCategories.exclude.length === 0) {
        console.log(
          "⚠️ [Categories] No exclude categories set - nothing will be filtered"
        )
      } else if (enabled) {
        console.log(
          `🛡️ [Filter] Active for: ${userCategories.exclude.join(", ")}`
        )
      }
    }

    // Check for API key
    const apiKey = await storage.get("openai-api-key")
    if (apiKey && typeof apiKey === "string" && apiKey.trim() !== "") {
      console.log("✅ [API] OpenAI key configured")
    } else {
      console.log("❌ [API] OpenAI key not set - categorization will fail")
    }

    // Start observing
    console.log("👀 [Feed] Starting observation")
    startObserving()

    console.log("===============================================")
    console.log("✅ [Feed.ly] Initialization complete")
    console.log("===============================================")
  } catch (error) {
    console.error("❌ [Init] Error:", error)
  }
}

// Replace startObserving() with initializeExtension() at the end of the file
initializeExtension()
