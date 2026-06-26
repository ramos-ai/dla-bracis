import { lazy, Suspense, ReactNode, useEffect } from "react";
import "./styles/global.scss";
import Sidebar from "./components/Sidebar/Sidebar";
import Header from "./components/Header/Header";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/Authentication";
import { AlertConfirmProvider } from "./contexts/AlertConfirmContext";
import { LayoutProvider, useLayout } from "./contexts/LayoutContext";
import Footer from "./components/Footer/Footer";

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const InitialPage = lazy(() => import("./pages/InitialPage"));
const Datasets = lazy(() => import("./pages/datasets/Datasets"));
const NewDataset = lazy(() => import("./pages/datasets/New"));
const MediaUploader = lazy(() => import("./pages/datasets/MediaUploader"));
const Gallery = lazy(() => import("./components/Gallery/Gallery"));
const LabellerPage = lazy(() => import("./pages/datasets/LabellerPage"));
const Exercises = lazy(() => import("./pages/exercises/Exercises"));
const ManageExercises = lazy(() => import("./pages/exercises/Manage"));
const Resolution = lazy(() => import("./pages/exercises/Resolution"));
const Dashboard = lazy(() => import("./pages/exercises/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Export = lazy(() => import("./pages/Export"));
const Students = lazy(() => import("./pages/Students"));
const Teachers = lazy(() => import("./pages/Teachers"));

/** Prefetch route chunks so navigation doesn't show fallback. Same imports as lazy() above. */
const prefetchRoutes = () => {
  const chunks = [
    import("./pages/Home"),
    import("./pages/datasets/Datasets"),
    import("./pages/datasets/New"),
    import("./pages/exercises/Exercises"),
    import("./pages/exercises/Manage"),
    import("./pages/exercises/Dashboard"),
    import("./pages/exercises/Resolution"),
    import("./pages/Settings"),
    import("./pages/Notifications"),
    import("./pages/Export"),
    import("./pages/Students"),
    import("./pages/Teachers"),
    import("./components/Gallery/Gallery"),
    import("./pages/datasets/LabellerPage"),
    import("./pages/datasets/MediaUploader"),
  ];
  chunks.forEach((p) => p.catch(() => {}));
};

/** Fallback mínimo: mantém layout, sem loader grande que cause “piscar”. */
const PageFallback = () => <div className="app-loading-fallback" aria-hidden />;

const RouteContentWrapper = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-fade-in">
      {children}
    </div>
  );
};

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageFallback />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/initial" replace />;
  }

  return <>{children}</>;
};

const AppLayout = () => {
  const { sidebarWidth } = useLayout();

  return (
    <>
      <Sidebar />
      <main
        className="app-main app-main--with-sidebar"
        style={{
          marginLeft: sidebarWidth,
          minHeight: "100vh",
          backgroundColor: "#f8f9fa",
          display: "flex",
          flexDirection: "column",
          transition: "margin-left 280ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <Header />
        <div className="app-main__content">
          <div className="app-main__content-inner app-main__content-inner--turma">
            <div className="page-fade">
              <Suspense fallback={<PageFallback />}>
                <RouteContentWrapper>
                <Routes>
                <Route path="/initial" element={<Navigate to="/" replace />} />
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/register" element={<Navigate to="/" replace />} />

                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />

                <Route path="/datasets" element={<ProtectedRoute><Datasets /></ProtectedRoute>} />
                <Route
                  path="/datasets/new"
                  element={<ProtectedRoute><NewDataset /></ProtectedRoute>}
                />
                <Route
                  path="/datasets/:id/media-uploader"
                  element={<ProtectedRoute><MediaUploader /></ProtectedRoute>}
                />
                <Route
                  path="/datasets/:id/gallery"
                  element={<ProtectedRoute><Gallery /></ProtectedRoute>}
                />
                <Route
                  path="/datasets/:id/labelling"
                  element={
                    <ProtectedRoute>
                      <LabellerPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/exercises"
                  element={<ProtectedRoute><Exercises /></ProtectedRoute>}
                />
                <Route
                  path="/exercises/manage"
                  element={<ProtectedRoute><ManageExercises /></ProtectedRoute>}
                />
                <Route
                  path="/exercises/resolution"
                  element={
                    <ProtectedRoute>
                      <Resolution classId={null} />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/exercises/dashboard"
                  element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
                />

                <Route
                  path="/settings"
                  element={<ProtectedRoute><Settings /></ProtectedRoute>}
                />
                <Route
                  path="/notifications"
                  element={<ProtectedRoute><Notifications /></ProtectedRoute>}
                />
                <Route
                  path="/export"
                  element={<ProtectedRoute><Export /></ProtectedRoute>}
                />
                <Route
                  path="/students"
                  element={<ProtectedRoute><Students /></ProtectedRoute>}
                />
                <Route
                  path="/teachers"
                  element={<ProtectedRoute><Teachers /></ProtectedRoute>}
                />
                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </RouteContentWrapper>
              </Suspense>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    </>
  );
};

const App = () => {
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const t = setTimeout(prefetchRoutes, 150);
    return () => clearTimeout(t);
  }, [isAuthenticated, user]);

  const publicRoutes = (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/initial" element={<InitialPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/initial" replace />} />
      </Routes>
    </Suspense>
  );

  return (
    <AlertConfirmProvider>
      <LayoutProvider hasSidebar={!!isAuthenticated}>
        {isAuthenticated ? <AppLayout /> : publicRoutes}
      </LayoutProvider>
    </AlertConfirmProvider>
  );
};

export default App;
