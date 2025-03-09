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
    console.log("🛡️ [Cover] Applying cover to post:", postHash.substring(0, 8))

    // Check if post is already unmuted
    const unmutedPosts = (await storage.get<string[]>("unmutedPosts")) || []

    if (unmutedPosts.includes(postHash)) {
      console.log("👁️ [Cover] Post is already unmuted, skipping cover")
      return
    }

    // First, check if container is still in the DOM
    if (!document.body.contains(container)) {
      console.log("❌ [Cover] Container no longer in DOM, skipping cover")
      return
    }

    // Check if this is a media tweet to add special handling
    const isTwitter =
      window.location.hostname.includes("twitter.com") ||
      window.location.hostname.includes("x.com")

    const platform = isTwitter ? "TWITTER" : "LINKEDIN"

    // Find the best element to apply the overlay to
    const targetElement = findBestOverlayTarget(container, platform)
    console.log("🎯 [Cover] Target element found:", targetElement.tagName)

    // Check if a cover already exists
    const existingCover = targetElement.querySelector(".feed-ly-cover")
    if (existingCover) {
      console.log("🔄 [Cover] Cover already exists, skipping")
      return
    }

    // Create a wrapper for the React component with inline styles
    const coverWrapper = document.createElement("div")
    coverWrapper.className = "feed-ly-cover"

    // Set inline styles directly with all properties at once for better compatibility
    coverWrapper.setAttribute(
      "style",
      `
      position: absolute !important;
      top: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      left: 0 !important;
      z-index: 9999 !important;
      background-color: rgba(255, 255, 255, 0.05) !important;
      backdrop-filter: blur(10px) !important;
      -webkit-backdrop-filter: blur(10px) !important;
      display: flex !important;
      justify-content: center !important;
      align-items: flex-start !important;
      width: 100% !important;
      height: 100% !important;
      padding: 16px !important;
      box-sizing: border-box !important;
    `
    )

    // Make sure the target element has position relative for proper overlay positioning
    const targetHtmlElement = targetElement as HTMLElement
    if (
      window.getComputedStyle(targetHtmlElement).position === "static" ||
      !window.getComputedStyle(targetHtmlElement).position
    ) {
      console.log("🔧 [Cover] Setting position:relative on target element")
      targetHtmlElement.style.position = "relative"
    }

    // Append the wrapper to the target element
    targetElement.appendChild(coverWrapper)
    console.log("✅ [Cover] Cover wrapper appended to target element")

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
            console.log(
              "👁️ [Cover] Post added to unmuted posts:",
              postHash.substring(0, 8)
            )
          })

          // Remove the cover with animation
          coverWrapper.classList.add("feed-ly-unmuting")
          setTimeout(() => {
            if (document.body.contains(coverWrapper)) {
              coverWrapper.remove()
              console.log("🔄 [Cover] Cover removed after unmute")
            }
          }, 600)
        }}
      />
    )
    console.log("✅ [Cover] FeedlyCover component rendered")
  } catch (error) {
    console.error("❌ [Cover] Error applying post cover:", error)
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
