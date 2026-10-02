import { Suspense } from 'react';
import { MorpheusPage } from '@/tools/morpheus/MorpheusPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MorpheusPage />
    </Suspense>
  );
}
