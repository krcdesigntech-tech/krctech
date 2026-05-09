import { timingSafeEqual } from 'crypto'

export function verifyWorkerSecret(request: Request): boolean {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const token = auth.slice(7)
  const secret = process.env.WORKER_SECRET
  if (!secret) return false
  const a = Buffer.from(token)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}
