import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accounts",
  description: "Sign in or create your TourNova account.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-xl font-extrabold text-white shadow-lg shadow-primary/20">
          T
        </div>
        <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-accent">TourNova</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">
          Discover India with information you can trust
        </p>
      </div>
      {children}
    </div>
  );
}
