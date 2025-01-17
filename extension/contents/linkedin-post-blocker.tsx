import type { PlasmoCSConfig } from "plasmo"
import React from "react"
import { createRoot } from "react-dom/client"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

export const config: PlasmoCSConfig = {
  matches: ["https://www.linkedin.com/feed*"],
  all_frames: false
}

// Cache for API responses and processed posts
const apiCache = new Map<string, boolean>()
const processedPosts = new Set<string>()
const storage = new Storage()

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

const CoverElement: React.FC<{
  postId: string
  categories: string[]
  tldr: string
  onUnmute: () => void
}> = ({ postId, categories, tldr, onUnmute }) => {
  return (
    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm p-5 flex flex-col items-center justify-center gap-4 z-10">
      <div className="text-center space-y-3">
        <p className="text-base font-medium text-gray-600">
          This post was categorized as:
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {categories.map((category) => (
            <span
              key={category}
              style={{ fontSize: "14px" }}
              className="inline-flex items-center px-4 py-1.5 rounded-full font-medium bg-blue-100 text-blue-800">
              {category}
            </span>
          ))}
        </div>
      </div>
      <p className="text-base text-gray-500 text-center max-w-md">{tldr}</p>
      <button
        onClick={onUnmute}
        className="mt-2 inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-base font-medium rounded-lg transition-colors">
        Show Post
      </button>
    </div>
  )
}

async function processPost(container: Element) {
  // Check if filter is enabled
  const isEnabled = await storage.get<boolean>("filter-enabled")
  if (isEnabled === false) {
    return
  }

  // Get user categories
  const userCategories = await storage.get<{
    include: string[]
    exclude: string[]
  }>("user-categories")

  // Extract post data first
  const data: PostData = {}

  const actorNameElement = container.querySelector<HTMLElement>(
    ".update-components-actor__title"
  )
  data.actorName = actorNameElement?.innerText?.trim() || ""

  const textContent = container.querySelector<HTMLElement>(
    ".feed-shared-update-v2__description"
  )
  data.text = textContent?.innerText?.trim() || ""

  // Create unique identifier from post content
  const postHash = createPostHash(data)

  // Skip if we've already processed this post
  if (processedPosts.has(postHash)) {
    console.log("Post already processed, skipping:", postHash)
    return
  }

  processedPosts.add(postHash)

  try {
    console.log("Sending message")
    // Get post categorization
    const response = await sendToBackground({
      name: "categorize-post",
      body: {
        text: data.text,
        userCategories: [
          ...(userCategories?.include || []),
          ...(userCategories?.exclude || [])
        ].map((cat) => cat.toUpperCase())
      }
    })

    data.categories = response.categories.map((cat) => cat.toUpperCase())
    data.tldr = response.tldr

    // Check if post should be blocked based on exclude categories
    const shouldBlock = userCategories?.exclude?.some((excludeCategory) =>
      data.categories.includes(excludeCategory.toUpperCase())
    )

    console.log("Post categories:", data.categories)
    console.log("Exclude categories:", userCategories?.exclude)
    console.log("Should block:", shouldBlock)

    if (shouldBlock) {
      // Check if post is already unmuted
      const unmutedPosts = (await storage.get<string[]>("unmutedPosts")) || []

      if (!unmutedPosts.includes(postHash)) {
        container.setAttribute("style", "position: relative;")

        const coverDiv = document.createElement("div")
        coverDiv.className = "absolute inset-0 z-10"
        container.appendChild(coverDiv)

        const unmute = async () => {
          console.log("Unmuting post:", postHash)
          const unmutedPosts =
            (await storage.get<string[]>("unmutedPosts")) || []
          await storage.set("unmutedPosts", [...unmutedPosts, postHash])
          coverDiv.remove()
        }

        const style = document.createElement("style")
        style.textContent = `
          .absolute { position: absolute; }
          .inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
          .z-10 { z-index: 10; }
          .bg-white\\/95 { background-color: rgba(255, 255, 255, 0.95); }
          .backdrop-blur-sm { backdrop-filter: blur(4px); }
          .p-5 { padding: 1.25rem; }
          .flex { display: flex; }
          .flex-col { flex-direction: column; }
          .items-center { align-items: center; }
          .justify-center { justify-content: center; }
          .gap-4 { gap: 1rem; }
          .space-y-2 > * + * { margin-top: 0.5rem; }
          .text-center { text-align: center; }
          .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
          .text-xs { font-size: 0.75rem; line-height: 1rem; }
          .font-medium { font-weight: 500; }
          .text-gray-600 { color: rgb(75, 85, 99); }
          .text-gray-500 { color: rgb(107, 114, 128); }
          .text-blue-800 { color: rgb(30, 64, 175); }
          .bg-blue-100 { background-color: rgb(219, 234, 254); }
          .bg-blue-600 { background-color: rgb(37, 99, 235); }
          .hover\\:bg-blue-700:hover { background-color: rgb(29, 78, 216); }
          .text-white { color: rgb(255, 255, 255); }
          .rounded-full { border-radius: 9999px; }
          .rounded-lg { border-radius: 0.5rem; }
          .px-2\\.5 { padding-left: 0.625rem; padding-right: 0.625rem; }
          .py-0\\.5 { padding-top: 0.125rem; padding-bottom: 0.125rem; }
          .px-4 { padding-left: 1rem; padding-right: 1rem; }
          .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
          .mt-2 { margin-top: 0.5rem; }
          .inline-flex { display: inline-flex; }
          .items-center { align-items: center; }
          .max-w-md { max-width: 28rem; }
          .flex-wrap { flex-wrap: wrap; }
          .gap-2 { gap: 0.5rem; }
          .transition-colors { transition-property: color, background-color, border-color, text-decoration-color, fill, stroke; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
        `
        document.head.appendChild(style)

        const root = createRoot(coverDiv)
        root.render(
          <CoverElement
            postId={postHash}
            categories={data.categories}
            tldr={data.tldr}
            onUnmute={unmute}
          />
        )
      }
    }
  } catch (error) {
    console.error("Error processing post:", error)
  }
}

// Set up observer
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) {
        if (node.matches("div.feed-shared-update-v2")) {
          processPost(node)
        }
        // Also check children
        node.querySelectorAll("div.feed-shared-update-v2").forEach(processPost)
      }
    })
  })
})

// Start observing
const startObserving = () => {
  const feed = document.querySelector('main[aria-label="Main Feed"]')
  if (feed) {
    // Process existing posts
    feed.querySelectorAll("div.feed-shared-update-v2").forEach(processPost)

    // Observe for new posts
    observer.observe(feed, {
      childList: true,
      subtree: true
    })
    console.log("Observer attached to feed")
  } else {
    console.log("Feed not found, retrying in 1s")
    setTimeout(startObserving, 1000)
  }
}

startObserving()
