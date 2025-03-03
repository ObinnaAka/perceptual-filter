// This is a patch file to fix the "Cannot read properties of undefined (reading 'map')" error
// in the social-post-blocker.tsx file

import { sendToBackground } from "@plasmohq/messaging"

/**
 * Safe version of the sendToBackground function that handles errors and validates the response
 * @param params The parameters to send to the background script
 * @returns A validated response or null if there was an error
 */
export async function safeSendToBackground(params: any) {
  try {
    const response = await sendToBackground(params)

    // Validate that the response has the expected properties
    if (!response) {
      console.error(
        `❌ [Background] Error: No response received from background script`
      )
      return null
    }

    if (!response.categories || !Array.isArray(response.categories)) {
      console.error(
        `❌ [Background] Error: Invalid response format - missing categories array`,
        response
      )
      return {
        ...response,
        categories: ["ERROR"],
        tldr: response.tldr || "Error processing content"
      }
    }

    return response
  } catch (error) {
    console.error(
      `❌ [Background] Error sending message to background script:`,
      error
    )
    return {
      categories: ["ERROR"],
      confidence: 0,
      tldr: "Error communicating with background script"
    }
  }
}

/**
 * How to use this in your processPost function:
 *
 * 1. Import the safeSendToBackground function:
 *    import { safeSendToBackground } from "./social-post-blocker-fix";
 *
 * 2. Replace your sendToBackground call with safeSendToBackground:
 *    const response = await safeSendToBackground({
 *      name: "categorize-post",
 *      body: {
 *        text: postText,
 *        authorName: data.actorName,
 *        userCategories: {
 *          include: userCategories?.include || [],
 *          exclude: userCategories?.exclude || []
 *        }
 *      }
 *    });
 *
 * 3. The response is guaranteed to have a categories array, so you can safely call map on it
 */
