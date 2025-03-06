/**
 * StatusIndicator Component
 *
 * Manages the status indicators that show the processing state of posts
 * Handles transitions between different states (processing, processed, filtered, blocked)
 */
import type { StatusType } from "../types"

/**
 * Adds or updates a status indicator on a post
 */
export function addStatusIndicator(
  container: Element,
  status: StatusType
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
 * Removes the status indicator from a post with a smooth fade-out animation
 */
export function removeStatusIndicator(container: Element): void {
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
 */
export function removeProcessingAttribute(container: Element): void {
  try {
    if (container.hasAttribute("data-feedlyprocessing")) {
      container.removeAttribute("data-feedlyprocessing")
    }
  } catch (error) {
    console.error("❌ Error removing processing attribute:", error)
  }
}
