import { Navigate } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import {
  HomeRedirect,
  RedirectIfAuthenticated,
  RequireAuth,
  RootLayout,
} from './components/route-guards';
import { AccountPage } from './pages/app/account-page';
import { AssetCategoriesPage } from './pages/app/asset-categories-page';
import { AssetDetailPage } from './pages/app/asset-detail-page';
import { AssetFormPage } from './pages/app/asset-form-page';
import { AssetsPage } from './pages/app/assets-page';
import { LocationsPage } from './pages/app/locations-page';
import { MembersPage } from './pages/app/members-page';
import { OrganisationPage } from './pages/app/organisation-page';
import { OverviewPage } from './pages/app/overview-page';
import { ForgotPasswordPage } from './pages/auth/forgot-password-page';
import { LoginPage } from './pages/auth/login-page';
import { RegisterPage } from './pages/auth/register-page';
import { ResetPasswordPage } from './pages/auth/reset-password-page';
import { VerifyEmailPage } from './pages/auth/verify-email-page';
import { InvitationPage } from './pages/invitations/invitation-page';
import { NotFoundPage } from './pages/not-found-page';

export const routeConfig = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomeRedirect /> },
      {
        path: 'login',
        element: (
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        ),
      },
      {
        path: 'register',
        element: (
          <RedirectIfAuthenticated>
            <RegisterPage />
          </RedirectIfAuthenticated>
        ),
      },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'invitations/:token', element: <InvitationPage /> },
      {
        path: 'app',
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <OverviewPage /> },
              { path: 'organisation', element: <OrganisationPage /> },
              { path: 'members', element: <MembersPage /> },
              { path: 'assets', element: <AssetsPage /> },
              { path: 'assets/new', element: <AssetFormPage /> },
              { path: 'assets/categories', element: <AssetCategoriesPage /> },
              { path: 'assets/locations', element: <LocationsPage /> },
              { path: 'assets/:assetId', element: <AssetDetailPage /> },
              { path: 'assets/:assetId/edit', element: <AssetFormPage /> },
              { path: 'account', element: <AccountPage /> },
            ],
          },
        ],
      },
      { path: 'dashboard', element: <Navigate to="/app" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
