"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SyncPanel() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshAllPrices, setRefreshAllPrices] = useState(false);

  const progress =
    total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  async function handleProductSync() {
    setRunning(true);
    setPhase("products");
    setError("");
    setMessage("Sayfa sayısı alınıyor...");
    setCurrent(0);
    setTotal(0);
    setSyncedCount(0);

    try {
      const metaResponse = await fetch("/api/sync");
      const meta = await metaResponse.json();

      if (!metaResponse.ok) {
        throw new Error(meta.error || "Meta bilgisi alınamadı");
      }

      const pages = meta.totalPages;
      setTotal(pages);
      setMessage(`${pages} sayfa bulundu. Ürün senkronu başlıyor...`);

      let totalUpserted = 0;

      for (let page = 1; page <= pages; page += 1) {
        setCurrent(page);
        setMessage(`Liste sayfası ${page}/${pages} çekiliyor...`);

        const response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `Sayfa ${page} senkronu başarısız`);
        }

        totalUpserted += result.upserted || 0;
        setSyncedCount(totalUpserted);
      }

      setMessage(
        `Ürün listesi tamamlandı. ${totalUpserted} kayıt işlendi. Fiyat için “Fiyatları çek” kullanın.`,
      );
      router.refresh();
    } catch (err) {
      setError(err.message || "Senkronizasyon hatası");
      setMessage("");
    } finally {
      setRunning(false);
      setPhase("");
    }
  }

  async function handlePriceSync() {
    setRunning(true);
    setPhase("prices");
    setError("");
    setMessage("Fiyat kuyruğu hazırlanıyor...");
    setCurrent(0);
    setTotal(0);
    setSyncedCount(0);

    const mode = refreshAllPrices ? "all" : "pending";

    try {
      const metaResponse = await fetch("/api/sync/prices");
      const meta = await metaResponse.json();

      if (!metaResponse.ok) {
        throw new Error(meta.error || "Fiyat meta bilgisi alınamadı");
      }

      const targetTotal = mode === "all" ? meta.total : meta.pending;
      setTotal(targetTotal);

      if (targetTotal === 0) {
        setMessage(
          mode === "all"
            ? "Fiyat çekilecek ürün yok."
            : "Eksik fiyat kalmadı. Tümünü yenilemek için kutuyu işaretleyin.",
        );
        return;
      }

      setMessage(
        mode === "all"
          ? `${targetTotal} ürünün detay fiyatı yenilenecek...`
          : `${targetTotal} üründe fiyat eksik. Detay sayfalarından çekiliyor...`,
      );

      let processed = 0;
      let updated = 0;
      let offset = 0;
      let done = false;
      const failedSamples = [];

      while (!done) {
        const response = await fetch("/api/sync/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, offset, limit: meta.batchSize || 5 }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Fiyat senkronu başarısız");
        }

        processed += result.processed || 0;
        updated += result.updated || 0;
        offset = result.nextOffset ?? offset + (result.processed || 0);
        done = Boolean(result.done) || (result.processed || 0) === 0;

        setCurrent(Math.min(processed, targetTotal));
        setSyncedCount(updated);
        setMessage(
          `Detay fiyat: ${Math.min(processed, targetTotal)}/${targetTotal} tarandı, ${updated} güncellendi...`,
        );

        if (result.errors?.length) {
          failedSamples.push(...result.errors.slice(0, 3));
        }

        if (mode === "pending" && (result.pending || 0) === 0) {
          done = true;
        }
      }

      const failNote = failedSamples.length
        ? ` Bazı hatalar: ${failedSamples
            .map((item) => `${item.smk_code} (${item.error})`)
            .join("; ")}`
        : "";

      setMessage(
        `Fiyat senkronu tamamlandı. ${updated} ürün güncellendi.${failNote}`,
      );
      router.refresh();
    } catch (err) {
      setError(err.message || "Fiyat senkronizasyon hatası");
      setMessage("");
    } finally {
      setRunning(false);
      setPhase("");
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(15,23,32,0.04)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
            Semak senkronizasyonu
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Önce liste sayfalarından ürünleri çekin. Sonra her ürünün detay
            sayfasındaki JSON-LD <code className="text-[var(--ink)]">offers.price</code>{" "}
            ve <code className="text-[var(--ink)]">priceCurrency</code> alanlarını
            tek tek tarayın.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
          <button
            type="button"
            onClick={handleProductSync}
            disabled={running}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {running && phase === "products"
              ? "Ürünler çekiliyor..."
              : "Ürünleri senkronize et"}
          </button>

          <button
            type="button"
            onClick={handlePriceSync}
            disabled={running}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--ink)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--track)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {running && phase === "prices"
              ? "Fiyatlar çekiliyor..."
              : "Fiyatları çek"}
          </button>

          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={refreshAllPrices}
              disabled={running}
              onChange={(event) => setRefreshAllPrices(event.target.checked)}
              className="rounded border-[var(--line)]"
            />
            Fiyatı olanları da yeniden çek
          </label>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-[var(--muted)]">
          <span>
            {total > 0
              ? `${phase === "prices" ? "Ürün" : "Sayfa"} ${Math.min(current, total)} / ${total}`
              : "Hazır"}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[var(--track)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
            style={{ width: `${running || progress ? progress : 0}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
          {message ? <p>{message}</p> : null}
          {syncedCount > 0 ? <p>Güncellenen: {syncedCount}</p> : null}
        </div>
        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
