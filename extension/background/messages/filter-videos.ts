import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  console.log("Filtering videos")
  console.log(req.body)
  const { videos } = req.body
  console.log(videos)

  const storage = new Storage({ area: "local" })
  const studentId = await storage.get("selectedStudentId")

  if (!studentId) {
    console.error("No student ID found")
    res.send({ error: "No student ID found" })
    return
  }

  try {
    const response = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: `Filter these YouTube videos based on the filters: ${JSON.stringify(videos)}`,
        studentId: studentId
      })
    })
    console.log(response)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log(result)
    res.send(result)
  } catch (error) {
    console.error("Error filtering videos:", error)
    res.send({ error: "Failed to filter videos" })
  }
}

export default handler
