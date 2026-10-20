import { afterEach, describe, expect, it, vi } from "vitest"
import { rateLimit, enforceRateLimit, clientIp } from "@/lib/rateLimit"
import { toGeminiContents, MAX_HISTORY } from "@/lib/gemini"
import { EmailService, escapeHtml, wantsEmail } from "@/lib/email"

describe("rateLimit (in-memory)", () => {
  it("allows up to the limit, then blocks with a retry time", async () => {
    const opts = { limit: 3, windowMs: 60_000 }
    for (let i = 0; i < 3; i++) expect((await rateLimit("t:a", opts)).success).toBe(true)
    const blocked = await rateLimit("t:a", opts)
    expect(blocked.success).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect((await rateLimit("t:other", opts)).success).toBe(true)
  })

  it("throws a 429 ApiError with Retry-After", async () => {
    const opts = { limit: 1, windowMs: 60_000 }
    await enforceRateLimit("t:b", opts)
    await expect(enforceRateLimit("t:b", opts)).rejects.toMatchObject({
      status: 429,
      headers: { "Retry-After": expect.any(String) },
    })
  })
})

describe("rateLimit (Upstash)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  it("uses the Redis pipeline when configured", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example/"
    process.env.UPSTASH_REDIS_REST_TOKEN = "tkn"
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ result: 5 }, { result: 1 }, { result: 30_000 }]))
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await rateLimit("t:redis", { limit: 4, windowMs: 60_000 })
    expect(result).toEqual({ success: false, remaining: 0, retryAfterSeconds: 30 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://redis.example/pipeline")
    expect(init.headers.Authorization).toBe("Bearer tkn")
    expect(JSON.parse(init.body)[0]).toEqual(["INCR", "rl:t:redis"])
  })

  it("fails open when Redis is down", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example"
    process.env.UPSTASH_REDIS_REST_TOKEN = "tkn"
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")))
    vi.spyOn(console, "error").mockImplementation(() => {})

    expect((await rateLimit("t:down", { limit: 1, windowMs: 60_000 })).success).toBe(true)
  })
})

describe("clientIp", () => {
  it("takes the first forwarded address", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } })
    expect(clientIp(req)).toBe("1.2.3.4")
  })
})

describe("toGeminiContents", () => {
  it("drops a leading assistant greeting and keeps both sides of the conversation", () => {
    const contents = toGeminiContents([
      { role: "assistant", content: "Hello! How can I help?" },
      { role: "user", content: "Can my landlord evict me?" },
      { role: "assistant", content: "It depends on the lease." },
      { role: "user", content: "It's a 2-year lease." },
    ])
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"])
    expect(contents[1].parts[0].text).toBe("It depends on the lease.")
  })

  it("merges consecutive turns from the same role and skips empty ones", () => {
    const contents = toGeminiContents([
      { role: "user", content: "First" },
      { role: "user", content: "   " },
      { role: "user", content: "Second" },
    ])
    expect(contents).toEqual([{ role: "user", parts: [{ text: "First\n\nSecond" }] }])
  })

  it("keeps only the most recent history", () => {
    const messages = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }))
    expect(toGeminiContents(messages).length).toBeLessThanOrEqual(MAX_HISTORY)
  })
})

describe("email", () => {
  it("escapes HTML", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
  })

  it("respects notification preferences", () => {
    expect(wantsEmail({ settings: { notifications: { email: false } } }, "booking")).toBe(false)
    expect(wantsEmail({ settings: { notifications: { email: true, reviews: false } } }, "reviews")).toBe(false)
    expect(wantsEmail({ settings: { notifications: { email: false } } }, null)).toBe(true)
  })

  it("does not send without SMTP config, and escapes names in templates", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const service = new EmailService()
    const sendMail = vi.fn().mockResolvedValue({ messageId: "1" })
    service.getTransporter = () => ({ sendMail })

    expect(await service.sendWelcomeEmail({ email: "a@b.test", firstName: "X" })).toEqual({ success: false, skipped: true })
    expect(sendMail).not.toHaveBeenCalled()

    process.env.SMTP_HOST = "smtp.test"
    process.env.SMTP_USER = "u"
    process.env.SMTP_PASS = "p"
    try {
      await service.sendWelcomeEmail({ email: "a@b.test", firstName: "<script>alert(1)</script>" })
      const { html, to } = sendMail.mock.calls[0][0]
      expect(to).toBe("a@b.test")
      expect(html).toContain("&lt;script&gt;")
      expect(html).not.toContain("<script>")
    } finally {
      delete process.env.SMTP_HOST
      delete process.env.SMTP_USER
      delete process.env.SMTP_PASS
    }
  })
})
