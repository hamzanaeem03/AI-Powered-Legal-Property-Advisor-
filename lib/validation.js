// Shared zod schemas for API input
import { z } from "zod"

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id")

export const email = z.string().trim().toLowerCase().email("Invalid email address").max(254)

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")

export const personName = z.string().trim().min(1, "Required").max(50)

/** Optional free text: trims, caps length, turns "" into undefined-safe empty string. */
export const text = (max) => z.string().trim().max(max)

/** Query-string integer with a default and an upper bound. */
export const limitParam = (fallback, max) =>
  z.coerce.number().int().min(1).max(max).catch(fallback).default(fallback)

export const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url("Invalid URL")
  .refine((value) => value.startsWith("https://"), "URL must use https")

export { z }
