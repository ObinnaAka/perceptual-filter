/**
 * CSS Service
 * 
 * Manages CSS styles and ensures they are properly loaded
 */

/**
 * Verifies that required CSS styles are properly loaded
 */
export function verifyCssLoaded(): void {
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

/**
 * Injects fallback CSS styles when the extension's CSS files fail to load
 */
export function injectFallbackStyles(): void {
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