/**
 * Registry for message handlers
 */

import type { MessageHandler } from './types';

// Store handlers for different message actions
const messageHandlers: Record<string, MessageHandler> = {};

/**
 * Register a handler for a specific message action
 * 
 * @param action The action to handle
 * @param handler The handler function
 * @returns True if the handler was registered successfully
 */
export function registerMessageHandler(action: string, handler: MessageHandler): boolean {
	if (!action || typeof handler !== 'function') {
		console.error('❌ [Registry] Invalid action or handler');
		return false;
	}

	messageHandlers[action] = handler;
	console.log(`📝 [Registry] Registered handler for action: ${action}`);
	return true;
}

/**
 * Get a handler for a specific action
 * 
 * @param action The action to get a handler for
 * @returns The handler function or undefined if no handler is registered
 */
export function getMessageHandler(action: string): MessageHandler | undefined {
	return messageHandlers[action];
}

/**
 * Check if a handler exists for a specific action
 * 
 * @param action The action to check
 * @returns True if a handler exists
 */
export function hasMessageHandler(action: string): boolean {
	return !!messageHandlers[action];
}

/**
 * Get all registered action types
 * 
 * @returns Array of action types
 */
export function getRegisteredActions(): string[] {
	return Object.keys(messageHandlers);
}

/**
 * Clear all registered handlers
 */
export function clearMessageHandlers(): void {
	Object.keys(messageHandlers).forEach(key => {
		delete messageHandlers[key];
	});
	console.log('🧹 [Registry] Cleared all message handlers');
} 