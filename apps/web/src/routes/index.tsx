import { createBrowserRouter, Navigate } from 'react-router';
import { CrabShell } from '../layouts/CrabShell';
import { NotFoundView } from '../views/NotFoundView';
import { navRoutes } from './navigation';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <CrabShell />,
    children: [
      { index: true, element: <Navigate to={navRoutes[0]!.path} replace /> },
      ...navRoutes.map(({ path, element }) => ({ path, element })),
      { path: '*', element: <NotFoundView /> },
    ],
  },
]);
