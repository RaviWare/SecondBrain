import mongoose from 'mongoose'

// Reuse the connection across hot-reloads in dev and across serverless
// invocations in prod by stashing it on the Node global.
type MongooseCache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
const globalForMongoose = globalThis as unknown as { mongoose?: MongooseCache }

const cached: MongooseCache =
  globalForMongoose.mongoose ?? (globalForMongoose.mongoose = { conn: null, promise: null })

/**
 * Defensively clean the raw `MONGODB_URI` env value before handing it to mongoose.
 *
 * A very common production misconfig (esp. via dashboards like Coolify/Vercel) is
 * pasting the connection string WITH surrounding quotes or stray whitespace/newline,
 * e.g. `"mongodb+srv://…"` or ` mongodb+srv://…\n`. Mongoose then throws
 * `MongoParseError: Invalid scheme, expected connection string to start with
 * "mongodb://" or "mongodb+srv://"` on EVERY DB call. We strip:
 *   • leading/trailing whitespace (spaces, tabs, CR/LF), and
 *   • a single pair of matching wrapping quotes (" or '),
 * then re-trim. This turns the most frequent paste-mistake into a working config.
 *
 * If, after cleaning, the value is non-empty but still doesn't start with a valid
 * mongodb scheme, we throw a CLEAR, actionable error (naming the offending prefix,
 * never the secret) instead of mongoose's cryptic parse error — so the fix is
 * obvious in the logs. Returns `undefined` for a missing/blank value so the caller
 * keeps its existing "MONGODB_URI is not defined" message.
 */
export function normalizeMongoUri(raw: string | undefined): string | undefined {
  if (raw == null) return undefined
  let uri = raw.trim()
  // Strip one pair of matching wrapping quotes, then re-trim inner whitespace.
  if (uri.length >= 2) {
    const first = uri[0]
    const last = uri[uri.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      uri = uri.slice(1, -1).trim()
    }
  }
  if (uri.length === 0) return undefined
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    const prefix = uri.slice(0, 12).replace(/[^\x20-\x7E]/g, '?')
    throw new Error(
      `MONGODB_URI has an invalid scheme (starts with "${prefix}…"). It must start ` +
        `with "mongodb://" or "mongodb+srv://" — check for stray quotes or spaces ` +
        `in the value set in your host's environment variables.`,
    )
  }
  return uri
}

export async function connectDB() {
  if (cached.conn) return cached.conn

  // Read + validate the URI lazily, at first use — NOT at module load.
  // Throwing at import time breaks `next build`, which imports every API route
  // to collect page data before any env vars are guaranteed to be present.
  const MONGODB_URI = normalizeMongoUri(process.env.MONGODB_URI)
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
