import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Spin } from 'antd';
import { router } from './router';
import { AppProviders } from './providers';

export default function App() {
  return (
    <AppProviders>
      <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}><Spin size="large" /></div>}>
        <RouterProvider router={router} />
      </Suspense>
    </AppProviders>
  );
}
