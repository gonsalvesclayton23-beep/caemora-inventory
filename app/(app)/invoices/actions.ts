'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';

export interface InvoiceFileInput {
  path: string; name: string; type: string; size: number;
  company: string; vendorId: number; invoiceNo: string | null; invoiceDate: string | null;
}

/** INV-02/03: link an uploaded file to its invoice. */
export async function recordInvoiceFile(f: InvoiceFileInput): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('invoice_files').insert({
    company_code: f.company, vendor_id: f.vendorId, invoice_no: f.invoiceNo, invoice_date: f.invoiceDate,
    storage_path: f.path, file_name: f.name, content_type: f.type, size_bytes: f.size,
  });
  if (error) {
    await supabase.storage.from('invoices').remove([f.path]);
    return { error: friendlyError(error) };
  }
  revalidatePath('/invoices');
  return { ok: true };
}
