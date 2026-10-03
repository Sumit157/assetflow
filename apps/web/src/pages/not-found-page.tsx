import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-fg">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1 text-sm text-muted-fg">That page does not exist.</p>
        <Link to="/app" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to AssetFlow
        </Link>
      </div>
    </div>
  );
}
