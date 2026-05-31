import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Sources from "./pages/Sources";
import SourceDetail from "./pages/SourceDetail";
import Upload from "./pages/Upload";
import ApiKeys from "./pages/ApiKeys";
import Users from "./pages/Users";
import { isAuthenticated } from "./lib/auth";

function Protected({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/sources" replace />} />
        <Route path="sources" element={<Sources />} />
        <Route path="sources/:id" element={<SourceDetail />} />
        <Route path="upload" element={<Upload />} />
        <Route path="api-keys" element={<ApiKeys />} />
        <Route path="users" element={<Users />} />
      </Route>
    </Routes>
  );
}
