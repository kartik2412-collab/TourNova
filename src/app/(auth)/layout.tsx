import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accounts",
  description: "Sign in or create your TourNova account.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:px-6">{children}</div>
  );
}
