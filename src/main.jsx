import React, {
  useState,
  useEffect,
  useLayoutEffect,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/outfit/300.css";
import "@fontsource/outfit/800.css";
const PublicSite = lazy(() =>
  import("./public").then((module) => ({ default: module.PublicSite })),
);
import {
  Login,
  OfficeShell,
  Overview,
  RecordList,
  RecordEditor,
  Related,
  Marketing,
  Activity,
  Admin,
} from "./office";
import { api } from "./api";
import "./style.css";
function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    navigate = useNavigate(),
    location = useLocation();
  useLayoutEffect(() => {
    document.body.classList.toggle(
      "office-ui",
      location.pathname.startsWith("/office") || location.pathname === "/login",
    );
  }, [location.pathname]);
  useEffect(() => {
    api("/session")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    document.title = `${location.pathname.startsWith("/office") ? "Office workspace" : "Conc Care Group"} | Conc Care Group`;
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const onLogin = (u) => {
    setUser(u);
    navigate("/office");
  };
  if (
    (location.pathname.startsWith("/office") ||
      location.pathname === "/login") &&
    loading
  )
    return (
      <main className="section" role="status">
        Loading session…
      </main>
    );
  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/office" /> : <Login onLogin={onLogin} />}
      />
      <Route
        path="/office/*"
        element={
          user ? (
            <OfficeShell
              user={user}
              onLogout={() => {
                setUser(null);
                navigate("/login");
              }}
            >
              <Routes>
                <Route index element={<Overview />} />
                <Route path="pipeline" element={<Overview pipelineOnly />} />
                {["leads", "contacts", "sites", "quotes", "invoices"].map(
                  (type) => (
                    <Route
                      key={type}
                      path={type}
                      element={<RecordList key={type} type={type} />}
                    />
                  ),
                )}
                <Route
                  path="followups"
                  element={<RecordList type="leads" followups />}
                />
                <Route path="marketing" element={<Marketing />} />
                <Route path="activity" element={<Activity />} />
                <Route path="admin" element={<Admin user={user} />} />
                <Route
                  path="contacts/:id/related/:type"
                  element={<Related />}
                />
                <Route
                  path=":type/:id"
                  element={<RecordEditor user={user} />}
                />
                <Route path="*" element={<h1>Page not found</h1>} />
              </Routes>
            </OfficeShell>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
      <Route
        path="*"
        element={
          <Suspense fallback={<p role="status">Loading website…</p>}>
            <PublicSite />
          </Suspense>
        }
      />
    </Routes>
  );
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
