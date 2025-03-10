import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

const { GoogleGenerativeAI } = require("@google/generative-ai");

const storage = new Storage()

export type PostCategory =
	| "INFORMATIONAL"
	| "BRAGGING"
	| "PROMOTIONAL"
	| "MEME"
	| "POLITICS"
	| "ELON MUSK"
	| "AI"
	| "OTHER"
	| string // Allow any user-defined category

export interface UserCategories {
	include: string[]
	exclude: string[]
}

export interface CategorizationRequest {
	text: string
	userCategories: UserCategories
	authorName?: string
}

export interface CategorizationResponse {
	categories: PostCategory[]
	confidence: "low" | "medium" | "high"
	tldr: string
}

const categoryResponseTemplate: CategorizationResponse = {
	categories: ["INFORMATIONAL", "AI"] as PostCategory[],
	confidence: "medium",
	tldr: "A summary of the post content"
}



const categorizeWithGPT4 = async (
	text: string,
	userCategories: UserCategories,
	authorName?: string
): Promise<CategorizationResponse> => {
	try {
		// const apiKey = await storage.get("openai-api-key")
		const apiKey = process.env.PLASMO_PUBLIC_OPENAI_API_KEY
		console.log("API key:", apiKey)

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

		// const genAI = new GoogleGenerativeAI(apiKey);
		// const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

		// Combine all categories for the model to consider
		const allCategories = [...new Set([
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
		])]

		// Create a more structured prompt with examples
		const prompt = `You are an expert content categorizer for a social media filtering system. Your task is to analyze social media posts and assign the most appropriate categories.

## IMPORTANT GUIDELINES:
1. Political content MUST be categorized as "POLITICS" including:
   - Content from government accounts or officials (White House, POTUS, government agencies)
   - Posts about laws, policies, executive orders, or government actions
   - Posts mentioning politicians, political parties, or political issues
   - Posts containing political terms or discussions about governance
   - Posts about elections, voting, campaigns, or political debates

2. Be especially alert for government and official policy content:
   - Executive orders or official government actions
   - Policy announcements from official accounts
   - Content discussing laws, regulations, or government decisions
   - Content about national issues even if not explicitly political in tone
   - Content from The White House or other official government sources

3. For content related to Elon Musk, categorize as "ELON MUSK" including:
   - Direct mentions of Elon Musk
   - Content about his companies (Tesla, SpaceX, Twitter/X, etc.)
   - Content discussing his business decisions or public statements

4. For artificial intelligence content, categorize as "AI" including:
   - Discussions about AI technology or applications
   - Content about specific AI systems or models
   - Content about AI ethics, regulations, or impacts

## CATEGORIES:
${allCategories.map(cat => `- ${cat.toUpperCase()}`).join("\n")}

## AUTHOR INFORMATION:
${authorName ? `The author of this post is: "${authorName}"

IMPORTANT: Pay close attention to the author's identity. If the author is:
- A politician (e.g., senators, representatives, presidents, etc.)
- A government official or agency (e.g., White House, Department of X, etc.)
- A political commentator or known political figure
- A news organization known for political content

Then the post should AUTOMATICALLY be categorized as "POLITICS" regardless of the specific content.` : "No author information available"}

## INSTRUCTIONS:
1. Analyze the following social media post
2. Consider the author's identity when relevant (politicians, government officials, celebrities, etc.)
3. Assign ALL relevant categories from the list above
4. Provide a 1-2 sentence TL;DR of the post content

Please give your response in the following json format:
${JSON.stringify(categoryResponseTemplate)}

## POST TO CATEGORIZE:
"""
${text}
"""

Analyze both explicit and implicit content. If this appears to be from an official government source (like The White House) or a known political figure, it should automatically be categorized as POLITICS regardless of content.`

		// const result = await model.generateContent(prompt);
		// console.log(result.response.text());

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
			throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
		}

		const data = await response.json()

		// Extract and validate the response
		try {
			const result = data.choices[0].message.content
			const parsedResult = JSON.parse(result)

			// Ensure categories are strings and uppercase
			const categories = Array.isArray(parsedResult.categories)
				? parsedResult.categories.map(cat => String(cat).toUpperCase())
				: []

			// Validate confidence is a string
			const confidence = typeof parsedResult.confidence === "string"
				? parsedResult.confidence
				: "low"

			// Ensure tldr is a string
			const tldr = typeof parsedResult.tldr === "string"
				? parsedResult.tldr
				: "No summary available"

			console.log("Categorization result:", { categories, confidence, tldr })

			return {
				categories,
				confidence,
				tldr
			}
		} catch (error) {
			console.error("Error parsing OpenAI result:", error, data)
			throw new Error("Failed to parse categorization result")
		}
	} catch (error) {
		console.error("Error categorizing post:", error)
		return {
			categories: ["ERROR"],
			confidence: "low",
			tldr: "Error processing content"
		}
	}
}

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
	const { text, userCategories, authorName } = req.body

	console.log("Categorizing post:", text?.substring(0, 100) + (text?.length > 100 ? "..." : ""))
	console.log("Author:", authorName || "Unknown")
	console.log("User categories received:", userCategories)

	if (!text) {
		return res.send({
			categories: ["OTHER"],
			confidence: 0,
			tldr: "No text provided"
		})
	}

	const result = await categorizeWithGPT4(text, userCategories, authorName)
	res.send(result)
}

export default handler
