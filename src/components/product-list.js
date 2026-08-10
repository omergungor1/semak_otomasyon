"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

function formatPrice(price, currency = "TRY") {
  if (price === null || price === undefined || price === "") return "—";

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(price));
}

export default function ProductList({ products }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;

    return products.filter((product) => {
      const haystack = [
        product.name,
        product.smk_code,
        product.material_code,
        product.brand,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [products, query]);

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(15,23,32,0.04)]">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
            Ürünler
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {filtered.length} / {products.length} ürün gösteriliyor
          </p>
        </div>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ad, SMK veya malzeme kodu ara..."
          className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] sm:max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-14 text-center sm:px-6">
          <p className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--ink)]">
            Ürün bulunamadı
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {products.length === 0
              ? "Henüz senkron yapılmadı. Yukarıdaki butonla ürünleri çekin."
              : "Arama kriterlerinize uygun kayıt yok."}
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[var(--line)] md:hidden">
            {filtered.map((product) => (
              <li key={product.id} className="flex gap-3 p-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--track)]">
                  {product.image_url ? (
                    <Image
                      src={product.image_url}
                      alt={product.name}
                      fill
                      className="object-contain p-1"
                      sizes="80px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">
                      Yok
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">
                    {product.name}
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]">
                    SMK {product.smk_code}
                  </p>
                  <p className="mt-0.5 font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]">
                    Malzeme {product.material_code || "—"}
                  </p>
                  <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                    {formatPrice(product.price, product.currency)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--track)]/70 text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-6 py-3 font-semibold">Ürün</th>
                  <th className="px-4 py-3 font-semibold">SMK</th>
                  <th className="px-4 py-3 font-semibold">Malzeme</th>
                  <th className="px-4 py-3 font-semibold">Marka</th>
                  <th className="px-6 py-3 font-semibold">Fiyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {filtered.map((product) => (
                  <tr key={product.id} className="transition hover:bg-[var(--track)]/40">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--track)]">
                          {product.image_url ? (
                            <Image
                              src={product.image_url}
                              alt={product.name}
                              fill
                              className="object-contain p-1"
                              sizes="56px"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          {product.product_url ? (
                            <a
                              href={product.product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="line-clamp-2 font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                            >
                              {product.name}
                            </a>
                          ) : (
                            <p className="line-clamp-2 font-medium text-[var(--ink)]">
                              {product.name}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-[var(--ink)]">
                      {product.smk_code}
                    </td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-[var(--muted)]">
                      {product.material_code || "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {product.brand || "—"}
                    </td>
                    <td className="px-6 py-3 font-medium text-[var(--ink)]">
                      {formatPrice(product.price, product.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
