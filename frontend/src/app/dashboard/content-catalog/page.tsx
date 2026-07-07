'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function ContentCatalogPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-3xl border border-stroke-soft-200 bg-bg-white-0 p-8 shadow-none">
        <p className="mb-3 text-sm font-medium text-text-sub-600">Content Catalog</p>
        <h1 className="mb-3 text-2xl font-semibold text-text-strong-950">Route placeholder</h1>
        <p className="mb-6 text-sm text-text-sub-600">
          Halaman ini sempat saya buat karena salah paham. Catalog layout yang benar sekarang ada di backend
          `slide-layout-catalog.ts`.
        </p>
        <Link href="/dashboard/catalog">
          <Button variant="outline" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to catalog
          </Button>
        </Link>
      </div>
    </div>
  );
}
