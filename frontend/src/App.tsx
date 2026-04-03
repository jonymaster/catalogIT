import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Shell } from "./components/Shell";
import { Login } from "./pages/Login";
import { AuthCallback } from "./pages/AuthCallback";
import { ResetPassword } from "./pages/ResetPassword";
import { Dashboard } from "./pages/Dashboard";
import { Calendar } from "./pages/Calendar";
import { Services } from "./pages/Services";
import { ServiceDetail } from "./pages/ServiceDetail";
import { ServiceOverview } from "./pages/ServiceOverview";
import { ServiceCosts } from "./pages/ServiceCosts";
import { CostRecordCreate } from "./pages/CostRecordCreate";
import { CostRecordEdit } from "./pages/CostRecordEdit";
import { Hardware } from "./pages/Hardware";
import { LaptopDetail } from "./pages/LaptopDetail";
import { ServiceCreate } from "./pages/ServiceCreate";
import { ServiceEdit } from "./pages/ServiceEdit";
import { LaptopCreate } from "./pages/LaptopCreate";
import { LaptopEdit } from "./pages/LaptopEdit";
import { PersonalSettings } from "./pages/PersonalSettings";
import { Users } from "./pages/Users";
import { Settings } from "./pages/Settings";
import { SettingsOidc } from "./pages/settings/SettingsOidc";
import { SettingsIntegrations } from "./pages/settings/SettingsIntegrations";
import { SettingsScim } from "./pages/settings/SettingsScim";
import { SettingsUsers } from "./pages/settings/SettingsUsers";
import { SettingsTokens } from "./pages/settings/SettingsTokens";
import { SettingsApi } from "./pages/settings/SettingsApi";
import { SettingsBranding } from "./pages/settings/SettingsBranding";
import { SettingsReferenceData } from "./pages/settings/SettingsReferenceData";
import { SettingsReferenceDataHome } from "./pages/settings/SettingsReferenceDataHome";
import { SettingsReferenceDataResource } from "./pages/settings/SettingsReferenceDataResource";
import { SettingsNotifications } from "./pages/settings/SettingsNotifications";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/sso/callback" element={<AuthCallback />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Shell />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/services" element={<Services />} />
                <Route path="/services/new" element={<ServiceCreate />} />
                <Route path="/services/:id" element={<ServiceDetail />}>
                  <Route index element={<ServiceOverview />} />
                  <Route path="costs" element={<ServiceCosts />} />
                </Route>
                <Route path="/services/:id/costs/new" element={<CostRecordCreate />} />
                <Route path="/services/:id/costs/:costId/edit" element={<CostRecordEdit />} />
                <Route path="/services/:id/edit" element={<ServiceEdit />} />
                <Route path="/hardware" element={<Hardware />} />
                <Route path="/hardware/new" element={<LaptopCreate />} />
                <Route path="/hardware/:id" element={<LaptopDetail />} />
                <Route path="/hardware/:id/edit" element={<LaptopEdit />} />
                <Route path="/me/settings" element={<PersonalSettings />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute requiredRole="admin" />}>
              <Route element={<Shell />}>
                <Route path="/users" element={<Users />} />
                <Route path="/settings" element={<Settings />}>
                  <Route index element={<Navigate to="oidc" replace />} />
                  <Route path="oidc" element={<SettingsOidc />} />
                  <Route path="notifications" element={<SettingsNotifications />} />
                  <Route path="integrations" element={<SettingsIntegrations />} />
                  <Route path="scim" element={<SettingsScim />} />
                  <Route path="users" element={<SettingsUsers />} />
                  <Route path="branding" element={<SettingsBranding />} />
                  <Route path="reference-data" element={<SettingsReferenceData />}>
                    <Route index element={<SettingsReferenceDataHome />} />
                    <Route
                      path=":resourceKey"
                      element={<SettingsReferenceDataResource />}
                    />
                  </Route>
                  <Route path="tokens" element={<SettingsTokens />} />
                  <Route path="api" element={<SettingsApi />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
