import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()

export type PostCategory =
  | "INFORMATIONAL"
  | "BRAGGING"
  | "PROMOTIONAL"
  | "MEME"
  | "OTHER"
  | string // Allow any user-defined category

interface UserCategories {
  include: string[]
  exclude: string[]
}

interface CategoryResponse {
  categories: PostCategory[]
  confidence: number
  tldr: string
  success: boolean
}

const categorizeWithGPT4 = async (
  content: string,
  userCategories: UserCategories,
  authorName?: string
): Promise<CategoryResponse> => {
  try {
    const apiKey = await storage.get("openai-api-key")

    if (!apiKey) {
      throw new Error(
        "OpenAI API key not found. Please set it in the extension options."
      )
    }

    // Ensure userCategories is properly structured
    const safeUserCategories = {
      include: Array.isArray(userCategories?.include)
        ? userCategories.include
        : [],
      exclude: Array.isArray(userCategories?.exclude)
        ? userCategories.exclude
        : []
    }

    // Log the categories we're using
    console.log("Using categories for categorization:", safeUserCategories)

    // Combine all categories for the model to consider
    const allCategories = [
      ...new Set([
        // Default categories
        "INFORMATIONAL",
        "BRAGGING",
        "PROMOTIONAL",
        "MEME",
        "OTHER",
        // User-defined include categories
        ...safeUserCategories.include,
        // User-defined exclude categories
        ...safeUserCategories.exclude
      ])
    ]

    // Create a more structured prompt with examples
    const prompt = `You are an expert content categorizer for a social media filtering system. Your task is to analyze social media posts and assign the most appropriate categories.

## CATEGORIES:
${allCategories.map((cat) => `- ${cat.toUpperCase()}`).join("\n")}

## AUTHOR INFORMATION:
${
  authorName
    ? `The author of this post is: "${authorName}"

IMPORTANT: Pay close attention to the author's identity. If the author is:
- A politician (e.g., senators, representatives, presidents, etc.)
- A government official or agency (e.g., White House, Department of X, etc.)
- A political commentator or known political figure
- A news organization known for political content

Then the post should AUTOMATICALLY be categorized as "POLITICS" regardless of the specific content.`
    : "No author information available"
}

## INSTRUCTIONS:
1. Analyze the following social media post
2. Consider the author's identity when relevant (politicians, government officials, celebrities, etc.)
3. Assign ALL relevant categories from the list above
4. Provide a 1-2 sentence TL;DR of the post content
5. Return your response in JSON format with "categories", "confidence", and "tldr" fields


return your classification with the following JSON format:

${JSON.stringify(CategorizePostResponseTemplate)}

## POST TO CATEGORIZE:
"""
${content}
"""

Analyze both explicit and implicit content. If this appears to be from an official government source (like The White House) or a known political figure, it should automatically be categorized as POLITICS regardless of content.`

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Use a better model for more accurate categorization
        messages: [{ role: "system", content: prompt }],
        temperature: 0.2, // Lower temperature for more consistent results
        response_format: { type: "json_object" } // Ensure JSON response
      })
    })

    // Process the response and handle errors
    if (!response.ok) {
      const errorData = await response.json()
      console.error("OpenAI API error:", errorData)
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()

    // Extract and validate the response
    try {
      const result = data.choices[0].message.content
      const parsedResult = JSON.parse(result)

      // Ensure categories are strings and uppercase
      const categories = Array.isArray(parsedResult.categories)
        ? parsedResult.categories.map((cat) => String(cat).toUpperCase())
        : []

      // Validate confidence is a number between 0 and 1
      const confidence =
        typeof parsedResult.confidence === "number"
          ? Math.min(Math.max(parsedResult.confidence, 0), 1)
          : 0.5

      // Ensure tldr is a string
      const tldr =
        typeof parsedResult.tldr === "string"
          ? parsedResult.tldr
          : "No summary available"

      console.log("Categorization result:", { categories, confidence, tldr })

      return {
        categories,
        confidence,
        tldr,
        success: true
      }
    } catch (error) {
      console.error("Error parsing OpenAI result:", error, data)
      throw new Error("Failed to parse categorization result")
    }
  } catch (error) {
    console.error("Error categorizing post:", error)
    return {
      categories: ["ERROR"],
      confidence: 0,
      tldr: "Error processing content",
      success: false
    }
  }
}

export type CategorizePostRequest = {
  content: string
  userCategories: UserCategories
  authorName?: string
}

enum confidenceLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH"
}

export type CategorizePostResponse = {
  categories: string[]
  confidence: confidenceLevel
  tldr: string
  success: boolean
}

const CategorizePostResponseTemplate: CategorizePostResponse = {
  categories: ["AI", "POLITICS", "SPORTS"],
  confidence: confidenceLevel.MEDIUM,
  tldr: "A post about the president of ghana at the super bowl",
  success: true
}

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { content, userCategories, authorName } =
    req.body as CategorizePostRequest

  console.log(
    "Categorizing post:",
    content?.substring(0, 100) + (content?.length > 100 ? "..." : "")
  )
  console.log("Author:", authorName || "Unknown")
  console.log("User categories received:", userCategories)

  if (!content) {
    return res.send({
      categories: ["OTHER"],
      confidence: confidenceLevel.LOW,
      tldr: "No text provided",
      success: false
    })
  }

  const result = await categorizeWithGPT4(content, userCategories, authorName)

  console.log("Categorization result:", result)
  res.send(result)
}

export default handler
