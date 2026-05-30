import mongoose from 'mongoose'

// Reuse the connection across hot-reloads in dev and across serverless
// invocations in prod by stashing it on the Node global.
type MongooseCache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
const globalForMongoose = globalThis as unknown as { mongoose?: MongooseCache }

const cached: MongooseCache =
  globalForMongoose.mongoose ?? (globalForMongoose.mongoose = { conn: null, promise: null })

export async function connectDB() {
  if (cached.conn) return cached.conn

  // Read + validate the URI lazily, at first use — NOT at module load.
  // Throwing at import time breaks `next build`, which imports every API route
  // to collect page data before any env vars are guaranteed to be present.
  const MONGODB_URI = process.env.MONGODB_URI
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined')

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
        // Fail fast instead of hanging the request when Atlas rejects the IP
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 15000,
      })
      .catch((err) => {
        // Reset the cached promise so a subsequent request can retry after
        // the user fixes their Atlas IP allowlist (otherwise mongoose caches
        // the rejection forever and every request looks broken).
        cached.promise = null
        throw err
      })
  }
  cached.conn = await cached.promise
  return cached.conn
}
