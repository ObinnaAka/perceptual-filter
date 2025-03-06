/**
 * PostCover Component
 *
 * Handles applying and removing cover overlays for posts
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { Storage } from "@plasmohq/storage"

import { findBestOverlayTarget } from "../utils/post"
import { FeedlyCoverElement } from "./FeedlyCover"

const storage = new Storage()

/**
 * Applies a cover overlay to posts that should be blocked
 */
export async function applyPostCover(
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

    const platform = isTwitter ? "TWITTER" : "LINKEDIN"

    // Find the best element to apply the overlay to
    const targetElement = findBestOverlayTarget(container, platform)

    // Check if a cover already exists
    const existingCover = targetElement.querySelector(".feed-ly-cover")
    if (existingCover) {
      return
    }

    // Create a wrapper for the React component
    const coverWrapper = document.createElement("div")
    coverWrapper.className = "feed-ly-cover"

    // Make sure the target element has position relative for proper overlay positioning
    const targetHtmlElement = targetElement as HTMLElement
    if (
      window.getComputedStyle(targetHtmlElement).position === "static" ||
      !window.getComputedStyle(targetHtmlElement).position
    ) {
      targetHtmlElement.style.position = "relative"
    }

    // Append the wrapper to the target element
    targetElement.appendChild(coverWrapper)

    // Create a React root and render the FeedlyCover component
    const root = createRoot(coverWrapper)
    root.render(
      <FeedlyCoverElement
        postId={postHash}
        categories={categories}
        tldr={tldr}
        matchedCategories={matchedCategories}
        onUnmute={() => {
          // Add to unmuted posts
          storage.get<string[]>("unmutedPosts").then((unmutedPosts) => {
            const updatedUnmutedPosts = [...(unmutedPosts || []), postHash]
            storage.set("unmutedPosts", updatedUnmutedPosts)
          })

          // Remove the cover with animation
          coverWrapper.classList.add("feed-ly-unmuting")
          setTimeout(() => {
            if (document.body.contains(coverWrapper)) {
              coverWrapper.remove()
            }
          }, 600)
        }}
      />
    )
  } catch (error) {
    console.error("❌ Error applying post cover:", error)
  }
}

/**
 * Removes the cover overlay from a post
 */
export function removePostCover(container: Element): void {
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
