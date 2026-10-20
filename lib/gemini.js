// Google Gemini client for the property-law assistant
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

export const MAX_HISTORY = 20
export const MAX_MESSAGE_LENGTH = 4000

export const SYSTEM_PROMPT = `
You are a helpful and expert AI legal assistant specializing only in property-related issues in Pakistan.

Only answer questions related to:
- property ownership disputes,
- tenant/landlord laws,
- forced occupancy,
- legal possession,
- property documents,
- legal costs,
- and punishments under relevant Pakistani laws (mention section numbers from Pakistan Penal Code or other relevant laws).

You must include possible punishments, legal outcomes, and applicable sections when appropriate.
You can reply to greetings
Do NOT answer unrelated questions (e.g., about other countries or non-property issues). Instead, reply: "I only assist with property-related legal issues in Pakistan."
`

// Gemini expects a conversation that starts with the user and alternates roles,
// so drop any leading assistant greeting and merge consecutive same-role turns.
export function toGeminiContents(messages) {
  const contents = []
  for (const msg of messages.slice(-MAX_HISTORY)) {
    if (typeof msg?.content !== "string" || !msg.content.trim()) continue
    const role = msg.role === "user" ? "user" : "model"
    if (contents.length === 0 && role === "model") continue
    const text = msg.content.slice(0, MAX_MESSAGE_LENGTH)
    const last = contents[contents.length - 1]
    if (last && last.role === role) {
      last.parts[0].text += "\n\n" + text
    } else {
      contents.push({ role, parts: [{ text }] })
    }
  }
  return contents
}

export class GeminiError extends Error {}

export async function askGemini(contents, { timeoutMs = 30_000 } = {}) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    throw new GeminiError(`Gemini API error ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't find an answer."
}
