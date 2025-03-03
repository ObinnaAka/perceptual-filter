/**
 * Default message handlers
 */

import type { FeedlyDebugObject } from './types';
import { registerMessageHandler } from './registry';

/**
 * Register default message handlers
 */
export function registerDefaultHandlers(): void {
	console.log('🔌 [Handlers] Registering default message handlers');

	// Handler for category updates
	registerMessageHandler("category-update", handleCategoryUpdate);

	// Handler for post categorization results
	registerMessageHandler("categorization-result", handleCategorizationResult);
}

/**
 * Handle category update messages
 * 
 * @param data The message data
 */
function handleCategoryUpdate(data: any): void {
	console.log("🔄 [Handlers] Category update received:", data);

	// Set a flag to indicate that categories have been updated
	const debugObj = window.__feedlyDebug as unknown as FeedlyDebugObject;

	if (debugObj) {
		// Mark categories as updated
		debugObj.categoriesUpdated = true;

		// Trigger reprocessing of visible posts
		if (typeof debugObj.triggerCategoryUpdate === "function") {
			debugObj.triggerCategoryUpdate();
		} else {
			console.warn("⚠️ [Handlers] triggerCategoryUpdate function not available");
		}
	}
}

/**
 * Handle categorization result messages
 * 
 * @param data The message data
 */
function handleCategorizationResult(data: any): void {
	console.log("📊 [Handlers] Categorization result received:", data);

	// Store the result in the global cache
	if (data.postHash) {
		const debugObj = window.__feedlyDebug as unknown as FeedlyDebugObject;

		if (debugObj && debugObj.categorizeCache) {
			debugObj.categorizeCache.set(data.postHash, {
				categories: data.categories || ["ERROR"],
				tldr: data.tldr || "No summary available",
				confidence: data.confidence || 0,
				processedAt: Date.now()
			});

			console.log(`✅ [Handlers] Cached categorization result for post ${data.postHash}`);
		}
	}
} 