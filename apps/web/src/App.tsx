import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { createQueryClient } from './lib/query-client';
import { routeConfig } from './routes';

export default function App() {
  const [queryClient] = useState(() => createQueryClient());
  const [router] = useState(() => createBrowserRouter(routeConfig));

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
