'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { z } from 'zod';
import { productSchema } from '@/lib/validation/schemas';
import { apiFetch } from '@/lib/api/client';
import { ProductForm } from '@/components/products/ProductForm';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

type ProductFormValues = z.infer<typeof productSchema>;

export default function NewProductPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: ProductFormValues) => {
    setLoading(true);
    try {
      const product = await apiFetch<{ id: string }>('/api/products', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      toast({ title: 'Product created' });
      router.push(`/products/${product.id}/edit`);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed', description: err instanceof Error ? err.message : 'Error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Guarded action="PRODUCT.CREATE">
      <PageHeader title="New Product" />
      <ProductForm onSubmit={handleSubmit} onCancel={() => router.back()} loading={loading} />
    </Guarded>
  );
}
