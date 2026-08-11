"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_PRICING_SETTINGS,
  ROUNDING_OPTIONS,
  calculateSalePrice,
} from "@/lib/pricing/calculate";
import { formatMoney } from "@/lib/fx/convert";

export default function PricingSettingsModal({
  open,
  onClose,
  initialSettings,
  onSaved,
  sampleTryCost = 10000,
}) {
  const [form, setForm] = useState(initialSettings || DEFAULT_PRICING_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initialSettings || DEFAULT_PRICING_SETTINGS);
      setError("");
      setMessage("");
    }
  }, [open, initialSettings]);

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const preview = calculateSalePrice(sampleTryCost, form);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      id: form.id || DEFAULT_PRICING_SETTINGS.id,
      discount_rate: Number(form.discount_rate),
      kdv_rate: Number(form.kdv_rate),
      shipping_price: Number(form.shipping_price),
      multiplier: Number(form.multiplier),
      extra_amount: Number(form.extra_amount),
      rounding_mode: form.rounding_mode,
      updated_at: new Date().toISOString(),
    };

    const supabase = createClient();
    const { data, error: saveError } = await supabase
      .from("pricing_settings")
      .upsert(payload)
      .select("*")
      .single();

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setMessage("Ayarlar kaydedildi.");
    onSaved?.(data);
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
        aria-labelledby="pricing-settings-title"
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_rgba(15,23,32,0.2)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Fiyatlandırma
            </p>
            <h2
              id="pricing-settings-title"
              className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]"
            >
              Satış fiyatı ayarları
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Formül: TRY × (1 − iskonto) × çarpan + kargo + ek tutar → KDV →
              yuvarlama
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--track)] hover:text-[var(--ink)]"
          >
            Kapat
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink)]">
            İskonto oranı (%)
            <input
              type="number"
              step="0.01"
              value={form.discount_rate}
              onChange={(event) => updateField("discount_rate", event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink)]">
            KDV oranı (%)
            <input
              type="number"
              step="0.01"
              value={form.kdv_rate}
              onChange={(event) => updateField("kdv_rate", event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink)]">
            Kargo (₺)
            <input
              type="number"
              step="0.01"
              value={form.shipping_price}
              onChange={(event) => updateField("shipping_price", event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink)]">
            Çarpan
            <input
              type="number"
              step="0.01"
              value={form.multiplier}
              onChange={(event) => updateField("multiplier", event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              placeholder="örn. 0.9 veya 1.15"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink)]">
            Ek tutar (₺)
            <input
              type="number"
              step="0.01"
              value={form.extra_amount}
              onChange={(event) => updateField("extra_amount", event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              placeholder="örn. +40 veya -1"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink)]">
            Yuvarlama
            <select
              value={form.rounding_mode}
              onChange={(event) => updateField("rounding_mode", event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            >
              {ROUNDING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--track)]/50 p-4 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Önizleme
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Örnek maliyet {formatMoney(sampleTryCost, "TRY")} → satış{" "}
              <span className="font-semibold text-[var(--ink)]">
                {preview === null ? "—" : formatMoney(preview, "TRY")}
              </span>
            </p>
          </div>

          {error ? (
            <p className="text-sm text-red-600 sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-[var(--accent)] sm:col-span-2">{message}</p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--track)]"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
