import mongoose from "mongoose"

// Cache the connection across hot reloads and serverless invocations
let cached = global._mongoose
if (!cached) cached = global._mongoose = { promise: null }

export const connectToDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured")
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, {
        dbName: "legaladvisor",
        // Serverless: keep the pool small per instance and fail fast if Atlas is unreachable
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10_000,
      })
      .then((m) => {
        console.log("✅ MongoDB connected")
        return m.connection
      })
      .catch((err) => {
        // Allow the next request to retry instead of caching the failure
        cached.promise = null
        console.error("❌ MongoDB connection error:", err)
        throw err
      })
  }

  return cached.promise
}
