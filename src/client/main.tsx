import { lazy, StrictMode, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles/app.css';
import { initTheme } from './lib/theme';
import { useAuth } from './lib/hooks';
import { ApiError } from './lib/api';
import { Shell, Toasts } from './components/Shell';
import { HomePage } from './pages/Home';
import { EditorPage } from './pages/Editor';
import { LibraryPage } from './pages/Library';
// Seltener genutzte Bereiche werden erst bei Bedarf geladen
const BatchPage = lazy(() => import('./pages/Batch').then((m) => ({ default: m.BatchPage })));
const TemplatesPage = lazy(() => import('./pages/Templates').then((m) => ({ default: m.TemplatesPage })));
const ScannerPage = lazy(() => import('./pages/Scanner').then((m) => ({ default: m.ScannerPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const later = (el: React.ReactNode) => <Suspense fallback={<div className="page"><p className="faint">Wird geladen …</p></div>}>{el}</Suspense>;
import { LoginPage, SetupPage } from './pages/Auth';

initTheme();

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2, refetchOnWindowFocus: false },
  },
});

window.addEventListener('tessera:unauthorized', () => {
  qc.setQueryData(['auth'], (old: unknown) => (old ? { ...(old as object), user: null } : old));
});

function RequireAuth() {
  const auth = useAuth();
  const loc = useLocation();
  if (auth.isLoading) return null;
  if (auth.data?.setupRequired) return <Navigate to="/einrichten" replace />;
  if (!auth.data?.user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

function Bare() {
  useEffect(() => { document.title = 'Tessera'; }, []);
  return <><Outlet /><Toasts /></>;
}

const router = createBrowserRouter([
  {
    element: <Bare />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/einrichten', element: <SetupPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [{
      element: <Shell />,
      children: [
        { path: '/', element: <HomePage /> },
        { path: '/neu', element: <EditorPage /> },
        { path: '/codes/:id', element: <EditorPage /> },
        { path: '/bibliothek', element: <LibraryPage /> },
        { path: '/serien', element: later(<BatchPage />) },
        { path: '/vorlagen', element: later(<TemplatesPage />) },
        { path: '/scanner', element: later(<ScannerPage />) },
        { path: '/einstellungen', element: later(<SettingsPage />) },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    }],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
