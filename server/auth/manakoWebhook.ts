import { createHmac, timingSafeEqual } from 'crypto'

export function verifyManakoSignature(
  signature: string | null,
  secret: string | undefined,
  body: string,
): boolean {
  if (!signature || !secret) return false
  try {
    const expected = `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(signature, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
