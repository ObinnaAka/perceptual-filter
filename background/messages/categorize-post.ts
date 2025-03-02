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
}

const categorizeWithGPT4 = async (
	text: string,
	userCategories: UserCategories
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
			include: Array.isArray(userCategories?.include) ? userCategories.include : [],
			exclude: Array.isArray(userCategories?.exclude) ? userCategories.exclude : []
		}

		// Log the categories we're using
		console.log("Using categories for categorization:", safeUserCategories)

		// Combine all categories for the model to consider
		const allCategories = [...new Set([
			...safeUserCategories.include,
			...safeUserCategories.exclude
		])].map(cat => cat.toUpperCase())

		// If there are user categories, use a more explicit prompt
		const userPrompt = `Here is the text I'd like you to categorize: ${text}

${allCategories.length > 0 ? `I'm specifically interested in whether this post falls into ANY of these categories: ${allCategories.join(", ")}

It's EXTREMELY IMPORTANT that you correctly identify if the post belongs to ANY of these categories: ${allCategories.join(", ")}. Please be thorough in your analysis and include ANY matching categories in your response.

You can also use standard categories like INFORMATIONAL, PROMOTIONAL, BRAGGING, MEME, etc. if they apply, but the categories I listed are the most important.` :
				`Categorize this post using standard categories like INFORMATIONAL, PROMOTIONAL, BRAGGING, MEME, etc.`}

Give me your response in the following JSON format:
{
  "categories": ["INFORMATIONAL", "PROMOTIONAL", "OTHER"],
  "confidence": 0.9,
  "tldr": "This post is about a new product launch and is promoting a product."
}

Thank you for your help!`

		console.log("Sending prompt to OpenAI")

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
						content: `You are an expert social media post analyzer. Your job is to categorize posts to help users filter content.

IMPORTANT: You must analyze the post for ALL the specific categories the user mentions. These are the most important categories to identify.

The user may be looking for categories like:
- POLITICS (political content, opinions, news)
- SPORTS (sports-related content)
- AI (artificial intelligence discussions)
- TECH (technology discussions)
- BUSINESS (business topics, entrepreneurship)
- MARKETING (marketing tactics, strategies)
- NEWS (current events)
- PERSONAL (personal stories, life events)

As well as standard categories like:
- INFORMATIONAL (useful knowledge sharing)
- BRAGGING (self-promotion or humble bragging)
- PROMOTIONAL (advertising products/services)
- MEME (funny or meme content)

For the specific categories the user provides, be very thorough and inclusive. If the post has ANY connection to the topics they mention, include those categories.

Respond with JSON only! Make sure to include ALL categories that apply.`
					},
					{
						role: "user",
						content: userPrompt
					}
				],
				response_format: { type: "json_object" },
				temperature: 0.1,
				stream: false
			})
		})

		if (!response.ok) {
			const errorData = await response.json().catch(() => null)
			console.error("API Error Response:", {
				status: response.status,
				statusText: response.statusText,
				errorData
			})
			throw new Error(`API request failed: ${response.status} ${response.statusText}${errorData ? ` - ${JSON.stringify(errorData)}` : ''}`)
		}

		const data = await response.json()
		console.log("OpenAI response:", data)

		// Parse the JSON string from the content field
		const contentResponse = JSON.parse(data.choices[0].message.content) as CategoryResponse

		// Explicitly check if any of the user's exclude categories were detected
		const detectedUserCategories = contentResponse.categories.filter(category =>
			safeUserCategories.exclude.some(userCat =>
				userCat.toUpperCase() === category.toUpperCase()
			)
		);

		// If user categories were detected, highlight this in logs
		if (detectedUserCategories.length > 0) {
			console.log("IMPORTANT: User's excluded categories detected:", detectedUserCategories);
		}

		return contentResponse
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

	console.log("Categorizing post:", text?.substring(0, 100) + (text?.length > 100 ? "..." : ""))
	console.log("User categories received:", userCategories)

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
