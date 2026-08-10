import LogoutButton from "@/components/logout-button";

export default function AdminShell({ email, children }) {
  return (
    <div className="relative min-h-full flex-1">
      <div className="dashboard-glow" aria-hidden="true" />
      <div className="dashboard-grid" aria-hidden="true" />

      <header className="relative border-b border-[var(--line)] bg-[var(--surface)]/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              Semak Otomasyon
            </p>
            <h1 className="truncate font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--ink)] sm:text-2xl">
              Admin paneli
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {email ? (
              <span className="hidden max-w-[180px] truncate text-sm text-[var(--muted)] sm:inline">
                {email}
              </span>
            ) : null}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
