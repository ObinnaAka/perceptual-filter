import React, { useState } from "react"

/**
 * A simple demo component for the popup to demonstrate the new messaging system
 */
export function CategorizeDemo() {
  const [text, setText] = useState("")
  const [author, setAuthor] = useState("")
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Function to send a message to the background script
  const handleCategorize = async () => {
    if (!text) {
      setError("Please enter some text to categorize")
      return
    }

    setLoading(true)
    setError("")
    setResult(null)

    try {
      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        type: "categorize-post",
        data: {
          text,
          authorName: author,
          userCategories: {
            include: [],
            exclude: ["POLITICS", "SPORTS", "PROMOTIONAL"]
          }
        }
      })

      // Check if we got a valid response
      if (!response || !response.categories) {
        throw new Error("Invalid response from background script")
      }

      // Set the result
      setResult(response)

      // Also relay the result to content scripts
      await chrome.runtime.sendMessage({
        type: "relay-to-content",
        action: "categorization-result",
        data: {
          postHash: `demo-${Date.now()}`,
          ...response
        }
      })
    } catch (error) {
      console.error("Error categorizing post:", error)
      setError(`Error: ${error.message || "Unknown error"}`)
    } finally {
      setLoading(false)
    }
  }

  // Function to trigger a category update
  const handleTriggerUpdate = async () => {
    try {
      // Send message to background script to relay to content scripts
      await chrome.runtime.sendMessage({
        type: "relay-to-content",
        action: "category-update",
        data: {
          timestamp: Date.now()
        }
      })

      alert("Category update triggered successfully!")
    } catch (error) {
      console.error("Error triggering category update:", error)
      setError(`Error: ${error.message || "Unknown error"}`)
    }
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-4">Categorize Demo</h1>

      <div className="mb-4">
        <label className="block mb-2">Post Text:</label>
        <textarea
          className="w-full p-2 border rounded"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter post text to categorize..."
        />
      </div>

      <div className="mb-4">
        <label className="block mb-2">Author (optional):</label>
        <input
          type="text"
          className="w-full p-2 border rounded"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Enter author name..."
        />
      </div>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      <div className="flex space-x-2 mb-4">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-blue-300"
          onClick={handleCategorize}
          disabled={loading || !text}>
          {loading ? "Categorizing..." : "Categorize"}
        </button>

        <button
          className="px-4 py-2 bg-green-500 text-white rounded"
          onClick={handleTriggerUpdate}>
          Trigger Category Update
        </button>
      </div>

      {result && (
        <div className="mt-4 p-4 border rounded bg-gray-50">
          <h2 className="font-bold mb-2">Result:</h2>
          <div className="mb-2">
            <strong>Categories:</strong>{" "}
            {result.categories.map((cat: string) => (
              <span
                key={cat}
                className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded mr-1 mb-1">
                {cat}
              </span>
            ))}
          </div>
          <div className="mb-2">
            <strong>Confidence:</strong> {result.confidence.toFixed(2)}
          </div>
          <div>
            <strong>TL;DR:</strong> {result.tldr}
          </div>
        </div>
      )}
    </div>
  )
}
