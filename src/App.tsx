import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import { ToastProvider } from './components/common/Toast';
import { AppLayout } from './components/layout/AppLayout';
import { LoadingState } from './components/common/LoadingState';

import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { CustomersPage } from './pages/CustomersPage';
import { DebtManagementPage } from './pages/DebtManagementPage';
import { CustomerPortalPage } from './pages/portal/CustomerPortalPage';
import { TransferConfirmPage } from './pages/portal/TransferConfirmPage';

const loadForgotPasswordPage = () => import('./pages/auth/ForgotPasswordPage');
const loadResetPasswordPage = () => import('./pages/auth/ResetPasswordPage');
const loadCustomerDetailPage = () => import('./pages/CustomerDetailPage');
const loadInventoryPage = () => import('./pages/InventoryPage');
const loadProductsPage = () => import('./pages/ProductsPage');
const loadStockPurchasesPage = () => import('./pages/StockPurchasesPage');
const loadSuppliersPage = () => import('./pages/SuppliersPage');
const loadExpensesPage = () => import('./pages/ExpensesPage');
const loadReportsPage = () => import('./pages/ReportsPage');
const loadSettingsPage = () => import('./pages/SettingsPage');

const ForgotPasswordPage = lazy(() =>
  loadForgotPasswordPage().then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = lazy(() =>
  loadResetPasswordPage().then((m) => ({ default: m.ResetPasswordPage }))
);
const CustomerDetailPage = lazy(() =>
  loadCustomerDetailPage().then((m) => ({ default: m.CustomerDetailPage }))
);
const InventoryPage = lazy(() =>
  loadInventoryPage().then((m) => ({ default: m.InventoryPage }))
);
const ProductsPage = lazy(() =>
  loadProductsPage().then((m) => ({ default: m.ProductsPage }))
);
const StockPurchasesPage = lazy(() =>
  loadStockPurchasesPage().then((m) => ({ default: m.StockPurchasesPage }))
);
const SuppliersPage = lazy(() =>
  loadSuppliersPage().then((m) => ({ default: m.SuppliersPage }))
);
const ExpensesPage = lazy(() =>
  loadExpensesPage().then((m) => ({ default: m.ExpensesPage }))
);
const ReportsPage = lazy(() =>
  loadReportsPage().then((m) => ({ default: m.ReportsPage }))
);
const SettingsPage = lazy(() =>
  loadSettingsPage().then((m) => ({ default: m.SettingsPage }))
);

function ProtectedOwnerRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Checking store owner session..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export function App() {
  // Preload lazy route chunks in idle time while online so SW caches every screen offline
  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const timer = window.setTimeout(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void Promise.allSettled([
        loadCustomerDetailPage(),
        loadInventoryPage(),
        loadProductsPage(),
        loadStockPurchasesPage(),
        loadSuppliersPage(),
        loadExpensesPage(),
        loadReportsPage(),
        loadSettingsPage(),
      ]);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <BrowserRouter>
      <ToastProvider>
        <OfflineProvider>
          <AuthProvider>
            <Suspense fallback={<LoadingState label="Loading screen..." />}>
              <Routes>
            {/* Public Customer Self-Service Portals & Transfer Confirmation */}
            <Route path="/portal/:token" element={<CustomerPortalPage />} />
            <Route path="/transfer-confirm/:confirmationToken" element={<TransferConfirmPage />} />

            {/* Owner Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Protected Owner Routes (All 11 Nav Sections) */}
            <Route
              path="/"
              element={
                <ProtectedOwnerRoute>
                  <DashboardPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/pos"
              element={
                <ProtectedOwnerRoute>
                  <PosPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedOwnerRoute>
                  <CustomersPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/customers/:id"
              element={
                <ProtectedOwnerRoute>
                  <CustomerDetailPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/debt"
              element={
                <ProtectedOwnerRoute>
                  <DebtManagementPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <ProtectedOwnerRoute>
                  <InventoryPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedOwnerRoute>
                  <ProductsPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/stock-purchases"
              element={
                <ProtectedOwnerRoute>
                  <StockPurchasesPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/suppliers"
              element={
                <ProtectedOwnerRoute>
                  <SuppliersPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedOwnerRoute>
                  <ExpensesPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedOwnerRoute>
                  <ReportsPage />
                </ProtectedOwnerRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedOwnerRoute>
                  <SettingsPage />
                </ProtectedOwnerRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </OfflineProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;

