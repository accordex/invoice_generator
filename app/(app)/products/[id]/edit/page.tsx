'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { productSchema } from '@/lib/validation/schemas';
import { apiFetch } from '@/lib/api/client';
import { ProductForm } from '@/components/products/ProductForm';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PrivilegeButton } from '@/components/privilege/PrivilegeButton';
import { useToast } from '@/components/ui/use-toast';
import { Guarded } from '@/components/privilege/Guarded';

type ProductFormValues = z.infer<typeof productSchema>;

export default function EditProductPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ['products', params.id],
    queryFn: () => apiFetch<ProductFormValues & { id: string }>(`/api/products/${params.id}`),
  });

  const handleSubmit = async (data: ProductFormValues) => {
    setLoading(true);
    try {
      await apiFetch(`/api/products/${params.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      toast({ title: 'Product updated' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Update failed', description: err instanceof Error ? err.message : 'Error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/products/${params.id}`, { method: 'DELETE' });
      toast({ title: 'Product deleted' });
      router.push('/products');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Delete failed', description: err instanceof Error ? err.message : 'Error' });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <Guarded action="PRODUCT.EDIT">
      <PageHeader
        title="Edit Product"
        actions={
          <PrivilegeButton code="BTN_PRODUCT_DELETE" variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete
          </PrivilegeButton>
        }
      />
      {product && (
        <ProductForm
          defaultValues={{ ...product, sellingPrice: Number(product.sellingPrice) }}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/products')}
          loading={loading}
        />
      )}
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete product?" variant="destructive" confirmLabel="Delete" loading={loading} onConfirm={handleDelete} />
    </Guarded>
  );
}
