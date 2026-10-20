import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/getAuthUser"
import { rateLimit, LIMITS } from "@/lib/rateLimit"
import { askGemini, toGeminiContents, MAX_HISTORY } from "@/lib/gemini"
import { z } from "@/lib/validation"

// Gemini can take a while to answer; allow more than Vercel's default function time
export const maxDuration = 60

const ChatSchema = z.object({
  messages: z
    .array(z.object({ role: z.string().max(20), content: z.string().max(20_000) }).passthrough())
    .max(MAX_HISTORY * 5),
})

// The chat page renders every response as an assistant message, errors included
const reply = (content, status = 200) =>
  NextResponse.json({ id: Date.now().toString(), role: "assistant", content }, { status })

export async function POST(req) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) return reply("Please log in to use the AI assistant.", 401)

    const [perMinute, perDay] = await Promise.all([
      rateLimit(`ai-chat:min:${authUser.id}`, LIMITS.aiChatPerMinute),
      rateLimit(`ai-chat:day:${authUser.id}`, LIMITS.aiChatPerDay),
    ])
    if (!perDay.success) return reply("You've reached today's limit for the AI assistant. Please try again tomorrow.", 429)
    if (!perMinute.success) return reply("You're sending questions too quickly. Please wait a moment and try again.", 429)

    let body
    try {
      body = await req.json()
    } catch {
      return reply("Please enter a question.", 400)
    }
    const parsed = ChatSchema.safeParse(body)
    if (!parsed.success) return reply("That conversation is too long. Please start a new chat.", 400)

    if (!process.env.GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY not configured")
      return reply("AI service is currently unavailable. Please try again later.", 503)
    }

    const contents = toGeminiContents(parsed.data.messages)
    if (contents.length === 0) return reply("Please enter a question.", 400)

    try {
      return reply(await askGemini(contents))
    } catch (err) {
      console.error("❌ Gemini request failed:", err.message)
      return reply("I'm having trouble connecting to my knowledge base. Please try again in a moment.", 503)
    }
  } catch (error) {
    console.error("❌ Error in /api/chat:", error)
    return reply("There was an error processing your request. Please try again later.", 500)
  }
}
