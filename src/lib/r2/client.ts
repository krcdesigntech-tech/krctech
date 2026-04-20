import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME!

export function getR2Key(userId: string, documentId: string, filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `users/${userId}/documents/${documentId}/${sanitized}`
}

export async function generateUploadPresignedUrl(
  r2Key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: r2Key,
    ContentType: contentType,
  })
  return getSignedUrl(r2Client, command, { expiresIn: 900 }) // 15 minutes
}

export async function deleteR2Object(r2Key: string): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: r2Key }))
}

export async function getR2ObjectBuffer(r2Key: string): Promise<Buffer> {
  const response = await r2Client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: r2Key })
  )
  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
