import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { AccountsPage } from './pages/AccountsPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { CalendarPage } from './pages/CalendarPage';
import { ComposerPage } from './pages/ComposerPage';
import { MediaPage } from './pages/MediaPage';
import { PostsPage } from './pages/PostsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 15_000 } },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <Spinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <Spinner />;
  if (status === 'authenticated') return <Navigate to="/calendar" replace />;
  return children;
}

// Yeni ve düzenleme ekranları arasında geçişte formun sıfırlanması için anahtar
function EditComposer() {
  const { id } = useParams();
  return <ComposerPage key={id} />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/posts" element={<PostsPage />} />
        <Route path="/posts/:id/edit" element={<EditComposer />} />
        <Route path="/compose" element={<ComposerPage key="new" />} />
        <Route path="/media" element={<MediaPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/calendar" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
