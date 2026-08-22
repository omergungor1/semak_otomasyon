"use client";

import { useCallback, useEffect, useState } from "react";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("tr-TR");
}

export default function ShopifyCategoriesModal({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shopifyError, setShopifyError] = useState("");
  const [local, setLocal] = useState([]);
  const [shopify, setShopify] = useState([]);
  const [missingCount, setMissingCount] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setShopifyError("");

    try {
      const response = await fetch("/api/shopify/collections");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Kategoriler alınamadı");
      }

      setLocal(result.local || []);
      setShopify(result.shopify || []);
      setMissingCount(result.missingCount || 0);
      setShopifyError(result.shopifyError || "");
    } catch (err) {
      setError(err.message || "Kategoriler alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    load();
    return undefined;
  }, [open, load]);

  async function insertCategory(categoryId) {
    const response = await fetch("/api/shopify/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Kategori Shopify’a eklenemedi");
    }
    return result;
  }

  async function handleInsert(row) {
    setBusyId(row.id);
    setError("");
    try {
      const result = await insertCategory(row.id);
      setLocal((current) =>
        current.map((item) =>
          item.id === row.id ? result.category : item,
        ),
      );
      if (result.created && result.collection) {
        setShopify((current) => {
          if (current.some((item) => item.id === result.collection.id)) {
            return current;
          }
          return [...current, result.collection];
        });
      }
      setMissingCount((count) => Math.max(0, count - 1));
    } catch (err) {
      setError(err.message || "Kategori Shopify’a eklenemedi");
    } finally {
      setBusyId("");
    }
  }

  async function handleInsertMissing() {
    const missing = local.filter((row) => row.missingInShopify);
    if (!missing.length) return;

    setBulkRunning(true);
    setError("");
    setBulkMessage(`0 / ${missing.length} kategori işleniyor...`);

    let done = 0;
    let failed = 0;

    for (const row of missing) {
      setBusyId(row.id);
      try {
        const result = await insertCategory(row.id);
        done += 1;
        setLocal((current) =>
          current.map((item) =>
            item.id === row.id ? result.category : item,
          ),
        );
        if (result.created && result.collection) {
          setShopify((current) => {
            if (current.some((item) => item.id === result.collection.id)) {
              return current;
            }
            return [...current, result.collection];
          });
        }
        setMissingCount((count) => Math.max(0, count - 1));
      } catch (err) {
        failed += 1;
        setError(err.message || "Kategori Shopify’a eklenemedi");
        break;
      }
      setBulkMessage(
        `${done} / ${missing.length} kategori işlendi${failed ? `, ${failed} hata` : ""}...`,
      );
    }

    setBusyId("");
    setBulkRunning(false);
    setBulkMessage(
      failed
        ? `${done} kategori eklendi, sonra durdu.`
        : `${done} kategori Shopify’a işlendi.`,
    );
  }

  if (!open) return null;

  const inserting = Boolean(busyId) || bulkRunning;
  const canInsert = !shopifyError && !loading && !inserting;

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
        aria-labelledby="shopify-categories-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(15,23,32,0.2)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-5 sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Shopify
            </p>
            <h2
              id="shopify-categories-title"
              className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]"
            >
              Kategoriler
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Shopify koleksiyonları ve Semak’tan çekilen kategoriler.
              {missingCount
                ? ` ${missingCount} kategori henüz Shopify’da yok.`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {missingCount && canInsert ? (
              <button
                type="button"
                onClick={handleInsertMissing}
                className="rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
              >
                Eksikleri ekle
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--track)] hover:text-[var(--ink)]"
            >
              Kapat
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6">
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Kategoriler yükleniyor...</p>
          ) : null}

          {error ? (
            <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {shopifyError ? (
            <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Shopify listesi alınamadı: {shopifyError}
            </p>
          ) : null}

          {bulkMessage ? (
            <p className="mb-4 text-sm text-[var(--muted)]">{bulkMessage}</p>
          ) : null}

          {!loading ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Shopify koleksiyonları ({shopify.length})
                </h3>
                {shopify.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    Shopify’dan koleksiyon gelmedi.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
                    {shopify.map((item) => (
                      <li key={item.id} className="px-4 py-3">
                        <p className="font-medium text-[var(--ink)]">{item.title}</p>
                        <p className="mt-0.5 font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]">
                          {item.handle || item.id}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Semak kategorileri ({local.length})
                </h3>
                {local.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    Henüz yerel kategori yok. Önce ürünleri senkronize edin.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
                    {local.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-start justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--ink)]">
                            {row.label}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {row.inShopify
                              ? "Shopify’da var"
                              : row.titleMatch
                                ? "İsim benzeri koleksiyon var, ID bağlı değil"
                                : "Shopify’da yok"}
                            {row.shopify_collection_id
                              ? ` · ${row.shopify_collection_id}`
                              : ""}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                            Eklenme: {formatDate(row.created_at)}
                          </p>
                        </div>
                        {row.missingInShopify ? (
                          <button
                            type="button"
                            disabled={!canInsert || busyId === row.id}
                            onClick={() => handleInsert(row)}
                            className="shrink-0 rounded-lg border border-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/10 disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)]"
                          >
                            {busyId === row.id
                              ? "Ekleniyor..."
                              : row.titleMatch
                                ? "Shopify’a bağla"
                                : "Shopify’a ekle"}
                          </button>
                        ) : (
                          <span className="shrink-0 rounded-full bg-[var(--track)] px-2 py-1 text-[11px] font-medium text-[var(--ink)]">
                            Bağlı
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
