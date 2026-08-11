"use client";

import Image from "next/image";
import { useEffect } from "react";
import { formatMoney } from "@/lib/fx/convert";

export default function ProductDetailsModal({
  open,
  product,
  onClose,
  tryPrice = null,
  salePrice = null,
  saleSource = null,
}) {
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !product) return null;

  const specs = Array.isArray(product.specifications)
    ? product.specifications
    : [];

  const infoRows = [
    { label: "SMK", value: product.smk_code || "—" },
    { label: "Malzeme", value: product.material_code || "—" },
    { label: "Marka", value: product.brand || "—" },
    {
      label: "Alış fiyatı",
      value: formatMoney(product.price, product.currency),
    },
    {
      label: "TRY karşılığı",
      value: tryPrice === null ? "—" : formatMoney(tryPrice, "TRY"),
    },
    {
      label: "Net satış fiyatı",
      value:
        salePrice === null
          ? "—"
          : `${formatMoney(salePrice, "TRY")}${
              saleSource === "manual" ? " (manuel)" : ""
            }`,
    },
  ];

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
        aria-labelledby="product-details-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(15,23,32,0.2)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-5 sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Ürün detayı
            </p>
            <h2
              id="product-details-title"
              className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]"
            >
              {product.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--track)] hover:text-[var(--ink)]"
          >
            Kapat
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
            <div className="relative mx-auto h-44 w-44 overflow-hidden rounded-2xl bg-[var(--track)] sm:mx-0">
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  className="object-contain p-3"
                  sizes="176px"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
                  Görsel yok
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--line)]">
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-[var(--line)]">
                  {infoRows.map((row) => (
                    <tr key={row.label}>
                      <td className="w-[38%] bg-[var(--track)]/50 px-4 py-2.5 font-medium text-[var(--ink)]">
                        {row.label}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--muted)]">
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <section className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Ürün açıklaması
            </h3>
            {product.description ? (
              <div
                className="prose-product mt-3 text-sm leading-7 text-[var(--ink)] [&_b]:font-semibold [&_p]:mb-3"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Açıklama henüz çekilmedi.
              </p>
            )}
          </section>

          <section className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Teknik özellikler
            </h3>
            {specs.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-[var(--line)]">
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-[var(--line)]">
                    {specs.map((spec) => (
                      <tr key={`${spec.key}-${spec.value}`}>
                        <td className="w-[40%] bg-[var(--track)]/50 px-4 py-2.5 font-medium text-[var(--ink)]">
                          {spec.key}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--muted)]">
                          {spec.value || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Teknik özellik henüz çekilmedi.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
