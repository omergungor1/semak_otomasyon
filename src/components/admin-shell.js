import Image from "next/image";
import UserMenu from "@/components/user-menu";

export default function AdminShell({ email, children }) {
  return (
    <div className="relative min-h-full flex-1">
      <div className="dashboard-glow" aria-hidden="true" />
      <div className="dashboard-grid" aria-hidden="true" />

      <header className="relative z-50 border-b border-[var(--line)] bg-[var(--surface)]/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Image
              src="/logo.jpg"
              alt="Semak"
              width={160}
              height={56}
              priority
              className="h-10 w-auto object-contain sm:h-12"
            />
            <div className="min-w-0 border-l border-[var(--line)] pl-3 sm:pl-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                Semak Otomasyon
              </p>
              <h1 className="truncate font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--ink)] sm:text-xl">
                Admin paneli
              </h1>
            </div>
          </div>

          <UserMenu email={email} />
        </div>
      </header>

      <main className="relative z-0 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
