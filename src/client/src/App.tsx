import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import { MainLayout } from './components/layout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { initAuth } from './services/auth';
import { SupplierIntake, LotQueue, SmartSlotting } from './pages/operator';
import { PendingQC } from './pages/qc';
import { StockDashboard, ProductionSchedule, WorkOrders } from './pages/ppic';
import { Dashboard, TemperatureMonitor, AuditTrail, AlertConfig, TemperatureAlarm } from './pages/manager';

/**
 * App Root Component
 *
 * Sets up routing with:
 * - Public route: /login
 * - Protected routes: /dashboard/* (wrapped in ProtectedRoute + MainLayout)
 * - Role-based access control via ProtectedRoute allowedRoles prop
 *
 * All four roles can access the dashboard layout; individual sub-routes
 * are further restricted by role in their respective ProtectedRoute wrappers.
 */

const ALL_ROLES = ['warehouse_operator', 'qc_staff', 'ppic_team', 'factory_manager'];

function App() {
  // Initialize auth (schedule token refresh) on app mount
  useEffect(() => {
    initAuth();
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />

          {/* Protected dashboard routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={ALL_ROLES}>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* Default dashboard index */}
            <Route
              index
              element={
                <div className="text-center py-12">
                  <h1 className="text-3xl font-bold text-gray-900">
                    IntegraSiE Smart Dashboard
                  </h1>
                  <p className="mt-2 text-gray-600">
                    Integrated Enterprise &amp; Smart Warehousing Platform
                  </p>
                  <p className="mt-4 text-sm text-gray-500">
                    Select a menu item from the sidebar to get started.
                  </p>
                </div>
              }
            />

            {/* Warehouse Operator routes */}
            <Route
              path="intake"
              element={
                <ProtectedRoute allowedRoles={['warehouse_operator', 'factory_manager']}>
                  <SupplierIntake />
                </ProtectedRoute>
              }
            />
            <Route
              path="lots"
              element={
                <ProtectedRoute allowedRoles={['warehouse_operator', 'factory_manager']}>
                  <LotQueue />
                </ProtectedRoute>
              }
            />
            <Route
              path="slotting"
              element={
                <ProtectedRoute allowedRoles={['warehouse_operator', 'factory_manager']}>
                  <SmartSlotting />
                </ProtectedRoute>
              }
            />

            {/* QC Staff routes */}
            <Route
              path="qc/pending"
              element={
                <ProtectedRoute allowedRoles={['qc_staff', 'factory_manager']}>
                  <PendingQC />
                </ProtectedRoute>
              }
            />
            <Route
              path="qc/results"
              element={
                <ProtectedRoute allowedRoles={['qc_staff', 'factory_manager']}>
                  <PlaceholderPage title="QC Results" />
                </ProtectedRoute>
              }
            />

            {/* PPIC Team routes */}
            <Route
              path="ppic/stock"
              element={
                <ProtectedRoute allowedRoles={['ppic_team', 'factory_manager']}>
                  <StockDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="ppic/schedules"
              element={
                <ProtectedRoute allowedRoles={['ppic_team', 'factory_manager']}>
                  <ProductionSchedule />
                </ProtectedRoute>
              }
            />
            <Route
              path="ppic/work-orders"
              element={
                <ProtectedRoute allowedRoles={['ppic_team', 'factory_manager']}>
                  <WorkOrders />
                </ProtectedRoute>
              }
            />

            {/* Factory Manager routes */}
            <Route
              path="manager"
              element={
                <ProtectedRoute allowedRoles={['factory_manager']}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="audit"
              element={
                <ProtectedRoute allowedRoles={['factory_manager']}>
                  <AuditTrail />
                </ProtectedRoute>
              }
            />
            <Route
              path="temperature"
              element={
                <ProtectedRoute allowedRoles={['factory_manager']}>
                  <TemperatureMonitor />
                </ProtectedRoute>
              }
            />
            <Route
              path="temperature/alarm"
              element={
                <ProtectedRoute allowedRoles={['factory_manager']}>
                  <TemperatureAlarm />
                </ProtectedRoute>
              }
            />
            <Route
              path="alerts"
              element={
                <ProtectedRoute allowedRoles={['factory_manager']}>
                  <AlertConfig />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Redirect root to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

/**
 * Placeholder page component for routes that will be implemented in later tasks.
 */
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-gray-500">This page will be implemented in a future task.</p>
    </div>
  );
}

export default App;
