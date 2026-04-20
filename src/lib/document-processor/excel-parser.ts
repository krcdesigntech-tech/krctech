import * as XLSX from 'xlsx'

export function parseExcel(buffer: Buffer): { text: string } {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const textParts: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    if (csv.trim()) {
      textParts.push(`[시트: ${sheetName}]\n${csv}`)
    }
  }

  return { text: textParts.join('\n\n') }
}
