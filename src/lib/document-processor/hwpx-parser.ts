// HWPX parser — HWPX is an OWPML-based ZIP + XML format
// Extracts text from Contents/section*.xml files
// Note: .hwp (binary) is NOT supported. Users must convert to .hwpx

import JSZip from 'jszip'

export async function parseHwpx(buffer: Buffer): Promise<{ text: string }> {
  let JSZipLib: typeof JSZip
  try {
    JSZipLib = (await import('jszip')).default
  } catch {
    throw new Error('JSZip 라이브러리가 필요합니다.')
  }

  const zip = await JSZipLib.loadAsync(buffer)
  const textParts: string[] = []

  // HWPX section files: Contents/section0.xml, section1.xml, ...
  const sectionFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith('Contents/section') && name.endsWith('.xml')
  )

  sectionFiles.sort()

  for (const filename of sectionFiles) {
    const xmlContent = await zip.files[filename].async('string')
    // Extract text from <hp:t> tags (HWPX text elements)
    const textMatches = xmlContent.match(/<hp:t[^>]*>([^<]+)<\/hp:t>/g) || []
    const texts = textMatches.map((m) => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean)
    if (texts.length) {
      textParts.push(texts.join('\n'))
    }
  }

  return { text: textParts.join('\n\n') }
}
