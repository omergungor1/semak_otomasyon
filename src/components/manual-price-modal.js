"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ManualPriceModal({
  open,
  product,
  onClose,
  onSaved,
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && product) {
      setValue(
        product.manual_sale_price === null || product.manual_sale_price === undefined
          ? ""
          : String(product.manual_sale_price),
      );
      setError("");
    }
  }, [open, product]);

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !product) return null;

  async function save(manualSalePrice) {
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { data, error: saveError } = await supabase
      .from("products")
      .update({
        manual_sale_price: manualSalePrice,
        updated_at: new Date().toISOString(),
      })
      .eq("id", product.id)
      .select("*")
      .single();

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    onSaved?.(data);
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      setError("Geçerli bir satış fiyatı girin.");
      return;
    }

    await save(amount);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(15,23,32,0.45)] backdrop-blur-[2px]"
        aria-label="Kapat"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-price-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_rgba(15,23,32,0.2)] sm:p-6"
      >
        <h2
          id="manual-price-title"
          className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]"
        >
          Manuel satış fiyatı
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {product.name}
          <span className="mt-1 block font-[family-name:var(--font-mono)] text-xs">
            SMK {product.smk_code}
          </span>
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink)]">
            Satış fiyatı (₺)
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </label>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {product.manual_sale_price !== null &&
            product.manual_sale_price !== undefined ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => save(null)}
                className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--track)] disabled:opacity-60"
              >
                Manuel fiyatı kaldır
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--track)]"
              >
                İptal
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
