import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()

export type PostCategory =
  | "INFORMATIONAL"
  | "BRAGGING"
  | "PROMOTIONAL"
  | "OTHER"

interface CategoryResponse {
  categories: PostCategory[]
  confidence: number
  tldr: string
}

const categorizeWithGPT4 = async (
  text: string,
  userCategories: string[]
): Promise<CategoryResponse> => {
  try {
    const apiKey = await storage.get("openai-api-key")

    if (!apiKey) {
      throw new Error(
        "OpenAI API key not found. Please set it in the extension options."
      )
    }

    const userPrompt = `Here is the text I'd like you to categorize: ${text}

In addition to your default categories, here is a list of other categories that the user has given you: ${userCategories.join(`,
	`)}


	Give me your response in the following JSON format:
	{
		"categories": ["INFORMATIONAL", "PROMOTIONAL", "OTHER"],
		"confidence": 0.9,
		"tldr": "This post is about a new product launch and is promoting a product."
	}

Thank you for your help!`

    console.log("userPrompt", userPrompt)

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a expert linkedin post auditor. Your job is to help categorize posts in a linkedin feed to help users filter out the noise.

You can categorize your posts into categories like:
INFORMATIONAL (useful knowledge sharing),
BRAGGING (self-promotion or humble bragging),
PROMOTIONAL (advertising products/services),
MEME (funny or interesting posts or memes),
As well as a list of other categories that the user gives you.
And OTHER (if it doesn't fit any of the categories)

A post can be in multiple categories. But only add it if you're very confident that it fits the category, and there isn't significant overlap with other categories.

Respond with JSON only please! Do your best!`
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      })
    })

    if (!response.ok) {
      console.error(response)
      throw new Error(`API request failed: ${response.statusText}`)
    }

    const data = await response.json()

    console.log(data)
    return JSON.parse(data.choices[0].message.content) as CategoryResponse
  } catch (error) {
    console.error("Error categorizing post:", error)
    return {
      categories: ["OTHER"],
      confidence: 0,
      tldr: error instanceof Error ? error.message : "Error processing post"
    }
  }
}

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { text, userCategories } = req.body

  console.log("Categorizing post:", text)

  if (!text) {
    return res.send({
      categories: ["OTHER"],
      confidence: 0,
      tldr: "No text provided"
    })
  }

  const result = await categorizeWithGPT4(text, userCategories)
  res.send(result)
}

export default handler
