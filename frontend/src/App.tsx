import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppShell from "@/components/Layout/AppShell";
import CharacterListPage    from "@/pages/CharacterListPage";
import CharacterSheetPage   from "@/pages/CharacterSheetPage";
import CharacterCreationPage from "@/pages/CharacterCreationPage";
import ReferencePage        from "@/pages/ReferencePage";
import PlayPage             from "@/pages/PlayPage";
import DungeonsPage         from "@/pages/DungeonsPage";
import MonstersPage         from "@/pages/MonstersPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/characters" replace />} />
            <Route path="/characters"        element={<CharacterListPage />} />
            <Route path="/characters/new"    element={<CharacterCreationPage />} />
            <Route path="/characters/:id"    element={<CharacterSheetPage />} />
            <Route path="/play"              element={<PlayPage />} />
            <Route path="/dungeons"          element={<DungeonsPage />} />
            <Route path="/monsters"          element={<MonstersPage />} />
            <Route path="/reference"         element={<ReferencePage />} />
            <Route path="/reference/:section" element={<ReferencePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
