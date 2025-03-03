/**
 * Type definitions for the messaging system
 */

/**
 * Defines the structure of a message handler function
 */
export type MessageHandler = (message: any) => void;

/**
 * Interface for background to content script messages
 */
export interface BackgroundMessage {
	type: 'from-background';
	action: string;
	data: any;
}

/**
 * Interface for content script to background responses
 */
export interface ContentResponse {
	success: boolean;
	error?: string;
}

/**
 * Interface for the global debug object
 */
export interface FeedlyDebugObject {
	categorizeCache?: Map<string, any>;
	categoriesUpdated?: boolean;
	triggerCategoryUpdate?: () => Promise<void>;
	[key: string]: any;
} 