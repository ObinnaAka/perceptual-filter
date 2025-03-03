/**
 * This file provides backward compatibility with the previous message listener system
 * It re-exports functionality from the new modular message system
 */

import type { MessageHandler } from './messaging/types';
import {
	registerMessageHandler as register,
	initializeMessageListener as initialize
} from './messaging';

/**
 * Register a handler for a specific message action
 * @param action The action to handle
 * @param handler The handler function
 */
export function registerMessageHandler(action: string, handler: MessageHandler) {
	register(action, handler);
}

/**
 * Initialize the message listener
 * This should be called once when the content script starts
 */
export function initializeMessageListener() {
	initialize();
} 