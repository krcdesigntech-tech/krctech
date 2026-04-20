import mammoth from 'mammoth'

export async function parseDocx(buffer: Buffer): Promise<{ text: string }> {
  const result = await mammoth.extractRawText({ buffer })
  return { text: result.value }
}
