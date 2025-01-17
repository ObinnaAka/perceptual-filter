import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const storage = new Storage({ area: "local" })
  const studentId = await storage.get("selectedStudentId")
  if (!studentId) {
    res.send({ success: false, error: "No student selected" })
    return
  }

  const { url, title } = req.body

  try {
    const response = await fetch("http://localhost:3000/api/videos/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        videoId: url,
        studentId: studentId,
        title: title,
        image: ""
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    res.send({ success: true, data: result })
  } catch (error) {
    console.error("Error sending video link:", error)
    res.send({ success: false, error: "Failed to send video link" })
  }
}

export default handler
