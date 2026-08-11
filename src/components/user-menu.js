"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function UserIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
      />
    </svg>
  );
}

export default function UserMenu({ email = "" }) {
  const router = useRouter();
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="relative z-50" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
            open
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          }`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Kullanıcı menüsü"
        >
          <UserIcon className="h-5 w-5" />
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 z-[100] mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_16px_40px_rgba(15,23,32,0.18)]"
          >
            <div className="border-b border-[var(--line)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Hesap
              </p>
              <p className="mt-1 truncate text-sm font-medium text-[var(--ink)]">
                {email || "Oturum açık"}
              </p>
            </div>
            <div className="p-2">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setConfirmOpen(true);
                }}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--track)]"
              >
                Çıkış yap
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(15,23,32,0.45)] backdrop-blur-[2px]"
            aria-label="Kapat"
            onClick={() => !loading && setConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_rgba(15,23,32,0.2)] sm:p-6"
          >
            <h2
              id="logout-confirm-title"
              className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]"
            >
              Çıkış yapmak istiyor musunuz?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Oturumunuz kapanacak ve giriş sayfasına yönlendirileceksiniz.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={loading}
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--track)] disabled:opacity-60"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleLogout}
                className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Çıkış yapılıyor..." : "Evet, çıkış yap"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
