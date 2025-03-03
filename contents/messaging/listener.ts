/**
 * Message listener for content script to receive messages from the background script
 */

import type { BackgroundMessage, ContentResponse, FeedlyDebugObject } from './types';
import { getMessageHandler, hasMessageHandler } from './registry';
import { registerDefaultHandlers } from './handlers';

let isInitialized = false;

/**
 * Initialize the message listener
 * This should be called once when the content script starts
 */
export function initializeMessageListener(): void {
	// Prevent multiple initializations
	if (isInitialized) {
		console.warn('⚠️ [Listener] Message listener already initialized');
		return;
	}

	console.log("🎧 [Listener] Initializing message listener");

	// Set up the message listener
	chrome.runtime.onMessage.addListener(
		(message: BackgroundMessage, sender, sendResponse: (response: ContentResponse) => void) => {
			console.log("📩 [Listener] Received message:", message);

			// Check if this is a message from the background script
			if (message.type === "from-background") {
				const { action, data } = message;

				// Check if we have a handler for this action
				if (action && hasMessageHandler(action)) {
					try {
						// Get the handler and call it
						const handler = getMessageHandler(action);
						handler(data);
						sendResponse({ success: true });
					} catch (error) {
						console.error(`❌ [Listener] Error handling action ${action}:`, error);
						sendResponse({
							success: false,
							error: error instanceof Error ? error.message : String(error)
						});
					}
				} else {
					console.warn(`⚠️ [Listener] No handler registered for action: ${action}`);
					sendResponse({
						success: false,
						error: "No handler registered for this action"
					});
				}

				return true; // Keep the message channel open for async response
			}

			// Not a message we recognize
			return false;
		}
	);

	// Register default handlers
	registerDefaultHandlers();

	// Initialize the cache in the global debug object
	initializeDebugCache();

	// Mark as initialized
	isInitialized = true;
	console.log('✅ [Listener] Message listener initialized successfully');
}

/**
 * Initialize the cache in the global debug object
 */
function initializeDebugCache(): void {
	const debugObj = window.__feedlyDebug as unknown as FeedlyDebugObject;

	if (debugObj) {
		// Initialize categorization cache if it doesn't exist
		if (!debugObj.categorizeCache) {
			debugObj.categorizeCache = new Map();
			console.log('🗄️ [Listener] Initialized categorization cache');
		}
	}
}

/**
 * Reset the listener state - primarily for testing
 */
export function resetListener(): void {
	isInitialized = false;
	console.log('🔄 [Listener] Reset listener state');
} 