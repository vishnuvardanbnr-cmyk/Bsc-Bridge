import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BridgePage from './pages/BridgePage';
import AdminPage from './pages/AdminPage';

const queryClient = new QueryClient();

function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return hash;
}

function App() {
  const route = useRoute();

  if (route === '#admin') return <AdminPage />;

  return (
    <QueryClientProvider client={queryClient}>
      <BridgePage />
    </QueryClientProvider>
  );
}

export default App;
