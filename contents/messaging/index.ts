/**
 * Messaging system for browser extension
 * 
 * This module handles communication between content scripts and background scripts.
 */

// Export the main types
export type { MessageHandler, BackgroundMessage, ContentResponse } from './types';

// Export the registry functions
export { registerMessageHandler, hasMessageHandler, getRegisteredActions } from './registry';

// Export the listener functions
export { initializeMessageListener, resetListener } from './listener';

// Re-export the default handlers registration
export { registerDefaultHandlers } from './handlers'; 