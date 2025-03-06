/**
 * Hook for accessing the ContentFilter context
 */
import { useContext } from "react"
import { ContentFilterContext } from "../social-post-blocker"

/**
 * Hook to use the ContentFilter context
 */
export function useContentFilter() {
	return useContext(ContentFilterContext)
} 