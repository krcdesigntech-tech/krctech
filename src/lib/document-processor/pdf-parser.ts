// PDF text extraction using pdf-parse
// Note: pdf-parse cannot extract text from image-only (scanned) PDFs

export async function parsePdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  // Dynamic import to avoid issues with Next.js bundling
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)

  return {
    text: data.text,
    pageCount: data.numpages,
  }
}
