import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainLayout from './layouts/MainLayout';
import { ProtectedRoute } from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import WorkshopListPage from './pages/WorkshopListPage';
import WorkshopDetailPage from './pages/WorkshopDetailPage';
import RegistrationPage from './pages/RegistrationPage';
import PaymentPage from './pages/PaymentPage';
import AdminWorkshopManagementPage from './pages/AdminWorkshopManagementPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

import './App.css';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Login - public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          isAuthenticated ? <Navigate to="/workshops" replace /> : <Navigate to="/login" replace />
        }
      />

      <Route
        path="/workshops"
        element={
          <MainLayout>
            <ProtectedRoute>
              <WorkshopListPage />
            </ProtectedRoute>
          </MainLayout>
        }
      />

      <Route
        path="/workshops/:id"
        element={
          <MainLayout>
            <ProtectedRoute>
              <WorkshopDetailPage />
            </ProtectedRoute>
          </MainLayout>
        }
      />

      <Route
        path="/register/:workshopId"
        element={
          <MainLayout>
            <ProtectedRoute>
              <RegistrationPage />
            </ProtectedRoute>
          </MainLayout>
        }
      />

      <Route
        path="/registration/:registrationId/payment"
        element={
          <MainLayout>
            <ProtectedRoute>
              <PaymentPage />
            </ProtectedRoute>
          </MainLayout>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <MainLayout>
            <ProtectedRoute requireAdmin>
              <AdminDashboardPage />
            </ProtectedRoute>
          </MainLayout>
        }
      />

      <Route
        path="/admin/workshops/new"
        element={
          <MainLayout>
            <ProtectedRoute requireAdmin>
              <AdminWorkshopManagementPage />
            </ProtectedRoute>
          </MainLayout>
        }
      />

      <Route
        path="/admin/workshops/:id/edit"
        element={
          <MainLayout>
            <ProtectedRoute requireAdmin>
              <AdminWorkshopManagementPage />
            </ProtectedRoute>
          </MainLayout>
        }
      />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/workshops" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App
