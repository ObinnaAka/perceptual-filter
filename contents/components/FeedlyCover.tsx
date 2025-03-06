/**
 * FeedlyCover Component
 *
 * Renders a cover overlay for filtered posts with category information
 * and an option to unmute/show the post.
 */
import React, { useEffect, useRef, useState } from "react"

import type { FeedlyCoverProps } from "../types"

/**
 * FeedlyCover component that displays over filtered posts
 */
export const FeedlyCoverElement: React.FC<FeedlyCoverProps> = ({
  postId,
  categories,
  tldr,
  onUnmute,
  matchedCategories = []
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isUnmuting, setIsUnmuting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
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
