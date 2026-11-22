'use client';
import { createClient } from '@/lib/supabase/client';

export const INVOICE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
export const INVOICE_MAX_BYTES = 10 * 1024 * 1024;

export interface UploadedFile { path: string; name: string; type: string; size: number }

/** Uploads an invoice PDF or photo to the private "invoices" bucket, straight from the browser. */
export async function uploadInvoiceFile(file: File, company: string, invoiceDate: string): Promise<UploadedFile> {
  if (!INVOICE_TYPES.includes(file.type)) throw new Error('Upload a PDF or a photo (JPG, PNG, WEBP, HEIC).');
  if (file.size > INVOICE_MAX_BYTES) throw new Error('The file is larger than 10 MB.');
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const path = `${company}/${invoiceDate.slice(0, 7)}/${crypto.randomUUID()}-${safe}`;
  const { error } = await createClient().storage.from('invoices').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path, name: file.name, type: file.type, size: file.size };
}
