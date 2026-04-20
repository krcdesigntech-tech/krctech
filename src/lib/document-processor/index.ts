import { parsePdf } from './pdf-parser'
import { parseDocx } from './docx-parser'
import { parseExcel } from './excel-parser'
import { parseHwpx } from './hwpx-parser'

export type SupportedFileType = 'pdf' | 'docx' | 'doc' | 'xlsx' | 'xls' | 'hwpx'

export const SUPPORTED_MIME_TYPES: Record<string, SupportedFileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/x-hwpml': 'hwpx',
  'application/haansofthwpx': 'hwpx',
}

export const FILE_SIZE_LIMIT = 100 * 1024 * 1024 // 100MB
export const FILE_SIZE_WARNING = 50 * 1024 * 1024 // 50MB

export interface ParseResult {
  text: string
  pageCount?: number
  fileType: SupportedFileType
}

export async function parseDocument(
  buffer: Buffer,
  fileType: SupportedFileType
): Promise<ParseResult> {
  switch (fileType) {
    case 'pdf': {
      const result = await parsePdf(buffer)
      if (!result.text.trim()) {
        throw new Error(
          '이 PDF는 스캔 문서이거나 이미지 기반이어서 텍스트를 추출할 수 없습니다. ' +
          'OCR 변환 후 재업로드해 주세요.'
        )
      }
      return { ...result, fileType }
    }
    case 'docx':
    case 'doc': {
      const result = await parseDocx(buffer)
      return { ...result, fileType }
    }
    case 'xlsx':
    case 'xls': {
      const result = parseExcel(buffer)
      return { ...result, fileType }
    }
    case 'hwpx': {
      const result = await parseHwpx(buffer)
      return { ...result, fileType }
    }
    default:
      throw new Error(`지원하지 않는 파일 형식입니다: ${fileType}`)
  }
}

export function getFileTypeFromMime(mimeType: string): SupportedFileType | null {
  return SUPPORTED_MIME_TYPES[mimeType] || null
}

export function getFileTypeFromExtension(filename: string): SupportedFileType | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  const extMap: Record<string, SupportedFileType> = {
    pdf: 'pdf',
    docx: 'docx',
    doc: 'doc',
    xlsx: 'xlsx',
    xls: 'xls',
    hwpx: 'hwpx',
  }
  return ext ? extMap[ext] || null : null
}
