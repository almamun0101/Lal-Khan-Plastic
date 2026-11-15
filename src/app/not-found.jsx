import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-steel-50 p-6 dark:bg-steel-950">
      <div className="text-center">
        <p className="font-mono text-5xl font-bold text-steel-300">404</p>
        <p className="mt-2 text-sm text-steel-500">That page doesn't exist.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-instrument-600 px-4 py-2 text-sm font-medium text-white hover:bg-instrument-500">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
