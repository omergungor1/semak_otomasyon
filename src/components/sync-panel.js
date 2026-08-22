"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ShopifyCategoriesModal from "@/components/shopify-categories-modal";

async function runDetailBatches({
  mode = "pending",
  setCurrent,
  setTotal,
  setSyncedCount,
  setMessage,
  onLog,
}) {
  const metaResponse = await fetch("/api/sync/details");
  const meta = await metaResponse.json();

  if (!metaResponse.ok) {
    throw new Error(meta.error || "Detay meta bilgisi alınamadı");
  }

  const targetTotal = mode === "all" ? meta.total : meta.pending;
  setTotal(targetTotal);

  if (targetTotal === 0) {
    setMessage(
      mode === "all"
        ? "Detay çekilecek ürün yok."
        : `Detaylar zaten kayıtlı (${meta.total || 0} ürün). Kategori taramasına geçiliyor...`,
    );
    return { updated: 0, processed: 0, deactivated: 0, skipped: true };
  }

  setMessage(`${targetTotal} ürünün açıklama ve teknik özellikleri çekiliyor...`);

  let processed = 0;
  let updated = 0;
  let deactivated = 0;
  let offset = 0;
  let done = false;
  const failedSamples = [];

  while (!done) {
    const response = await fetch("/api/sync/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, offset, limit: meta.batchSize || 5 }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Detay senkronu başarısız");
    }

    processed += result.processed || 0;
    updated += result.updated || 0;
    deactivated += result.deactivated || 0;
    offset = result.nextOffset ?? offset + (result.processed || 0);
    done = Boolean(result.done) || (result.processed || 0) === 0;

    if (result.errors?.length) {
      failedSamples.push(...result.errors.slice(0, 3));
      for (const item of result.errors) {
        onLog?.("error", `${item.smk_code}: ${item.error}`);
      }
    }

    setCurrent(Math.min(processed, targetTotal));
    setSyncedCount(updated);
    setMessage(
      `Detay: ${Math.min(processed, targetTotal)}/${targetTotal} tarandı, ${updated} güncellendi${deactivated ? `, ${deactivated} pasif` : ""}...`,
    );

    if (mode === "pending" && (result.pending || 0) === 0) {
      done = true;
    }
  }

  return { updated, processed, deactivated, errors: failedSamples };
}

async function runCategoryBatches({
  setCurrent,
  setTotal,
  setSyncedCount,
  setMessage,
  onLog,
}) {
  const metaResponse = await fetch("/api/sync/categories");
  const meta = await metaResponse.json();

  if (!metaResponse.ok) {
    throw new Error(meta.error || "Kategori meta bilgisi alınamadı");
  }

  const targetTotal = meta.pending;
  setTotal(targetTotal);

  if (targetTotal === 0) {
    setMessage("Eksik kategori kalmadı.");
    return { updated: 0, processed: 0, deactivated: 0 };
  }

  setMessage(`${targetTotal} ürünün kategori bilgisi çekiliyor...`);

  let processed = 0;
  let updated = 0;
  let deactivated = 0;
  let done = false;
  const failedSamples = [];

  while (!done) {
    const response = await fetch("/api/sync/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: meta.batchSize || 8 }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Kategori senkronu başarısız");
    }

    processed += result.processed || 0;
    updated += result.updated || 0;
    deactivated += result.deactivated || 0;
    done = Boolean(result.done) || (result.processed || 0) === 0;

    if (result.errors?.length) {
      failedSamples.push(...result.errors.slice(0, 3));
      for (const item of result.errors) {
        onLog?.("error", `${item.smk_code}: ${item.error}`);
      }
    }

    setCurrent(Math.min(processed, targetTotal));
    setSyncedCount(updated);
    setMessage(
      `Kategori: ${Math.min(processed, targetTotal)}/${targetTotal} tarandı, ${updated} bağlandı${deactivated ? `, ${deactivated} pasif` : ""}...`,
    );

    if ((result.pending || 0) === 0) {
      done = true;
    }
  }

  return { updated, processed, deactivated, errors: failedSamples };
}

const LOG_LEVEL_CLASS = {
  info: "text-zinc-300",
  ok: "text-emerald-400",
  warn: "text-amber-300",
  error: "text-red-400",
};

function SyncLogTerminal({ logs, logRef }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <p className="font-[family-name:var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          Senkron günlüğü
        </p>
        <p className="text-[11px] text-zinc-500">{logs.length} satır</p>
      </div>
      <div
        ref={logRef}
        className="max-h-64 overflow-y-auto px-3 py-2 font-[family-name:var(--font-mono)] text-[11px] leading-5"
      >
        {logs.length === 0 ? (
          <p className="text-zinc-600">Senkron başlayınca loglar burada akar.</p>
        ) : (
          logs.map((line) => (
            <p key={line.id} className={LOG_LEVEL_CLASS[line.level] || LOG_LEVEL_CLASS.info}>
              <span className="mr-2 text-zinc-500">{line.time}</span>
              {line.text}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

export default function SyncPanel({ storeUrl = "", shopifyStoreUrl = "" }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshAllPrices, setRefreshAllPrices] = useState(false);
  const [refreshAllDetails, setRefreshAllDetails] = useState(true);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);

  const progress =
    total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  function appendLog(level, text) {
    setLogs((current) => {
      const next = [
        ...current,
        {
          id: `${Date.now()}-${current.length}-${Math.random().toString(36).slice(2, 7)}`,
          time: new Date().toLocaleTimeString("tr-TR", { hour12: false }),
          level,
          text,
        },
      ];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }

  function resetSyncState(nextPhase, nextMessage) {
    setRunning(true);
    setPhase(nextPhase);
    setError("");
    setMessage(nextMessage);
    setCurrent(0);
    setTotal(0);
    setSyncedCount(0);
    setLogs([]);
    appendLog("info", nextMessage);
  }

  async function handleProductSync() {
    resetSyncState("products", "Sayfa sayısı alınıyor...");

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
      const seenSmkCodes = [];

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
        for (const product of result.products || []) {
          if (product.smk_code) seenSmkCodes.push(product.smk_code);
        }
      }

      let deactivatedMissing = 0;
      if (seenSmkCodes.length) {
        setMessage("Listede olmayan ürünler pasife alınıyor...");
        const pruneResponse = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deactivateMissing",
            smkCodes: seenSmkCodes,
          }),
        });
        const pruneResult = await pruneResponse.json();
        if (!pruneResponse.ok) {
          throw new Error(pruneResult.error || "Pasife alma başarısız");
        }
        deactivatedMissing = pruneResult.deactivated || 0;
        if (pruneResult.skipped) {
          setMessage(pruneResult.reason || "Pasife alma atlandı.");
        }
      }

      setPhase("details");
      setMessage(
        `Liste tamamlandı (${totalUpserted}). Açıklama ve teknik özellikler çekiliyor...`,
      );

      const detailsResult = await runDetailBatches({
        mode: refreshAllDetails ? "all" : "pending",
        setCurrent,
        setTotal,
        setSyncedCount,
        setMessage,
        onLog: appendLog,
      });

      setPhase("categories");
      setMessage(
        `Detay tamamlandı (${detailsResult.updated}). Kategoriler çekiliyor...`,
      );

      const categoryResult = await runCategoryBatches({
        setCurrent,
        setTotal,
        setSyncedCount,
        setMessage,
        onLog: appendLog,
      });

      const failNote = [...(detailsResult.errors || []), ...(categoryResult.errors || [])]
        .slice(0, 3)
        .map((item) => `${item.smk_code}: ${item.error}`)
        .join("; ");

      const deactivatedTotal =
        deactivatedMissing +
        (detailsResult.deactivated || 0) +
        (categoryResult.deactivated || 0);

      setMessage(
        `Tamamlandı. Liste: ${totalUpserted} ürün · Detay: ${detailsResult.updated} · Kategori: ${categoryResult.updated}${deactivatedTotal ? ` · Pasif: ${deactivatedTotal}` : ""}.${failNote ? ` Hatalar: ${failNote}` : ""}`,
      );
      router.refresh();
    } catch (err) {
      const text = err.message || "Senkronizasyon hatası";
      appendLog("error", text);
      setError(text);
      setMessage("");
    } finally {
      setRunning(false);
      setPhase("");
    }
  }

  async function handleDetailsSync() {
    resetSyncState("details", "Detay kuyruğu hazırlanıyor...");

    try {
      const detailsResult = await runDetailBatches({
        mode: "all",
        setCurrent,
        setTotal,
        setSyncedCount,
        setMessage,
        onLog: appendLog,
      });

      const failNote = (detailsResult.errors || [])
        .slice(0, 3)
        .map((item) => `${item.smk_code}: ${item.error}`)
        .join("; ");

      setMessage(
        `Detay taraması tamamlandı. ${detailsResult.updated} güncellendi${detailsResult.deactivated ? `, ${detailsResult.deactivated} pasif` : ""}.${failNote ? ` Hatalar: ${failNote}` : ""}`,
      );
      router.refresh();
    } catch (err) {
      const text = err.message || "Detay senkronizasyon hatası";
      appendLog("error", text);
      setError(text);
      setMessage("");
    } finally {
      setRunning(false);
      setPhase("");
    }
  }

  async function handleCategorySync() {
    resetSyncState("categories", "Kategori kuyruğu hazırlanıyor...");

    try {
      const categoryResult = await runCategoryBatches({
        setCurrent,
        setTotal,
        setSyncedCount,
        setMessage,
        onLog: appendLog,
      });

      const failNote = (categoryResult.errors || [])
        .slice(0, 3)
        .map((item) => `${item.smk_code}: ${item.error}`)
        .join("; ");

      setMessage(
        `Kategori taraması tamamlandı. ${categoryResult.updated} ürün bağlandı.${failNote ? ` Hatalar: ${failNote}` : ""}`,
      );
      router.refresh();
    } catch (err) {
      const text = err.message || "Kategori senkronizasyon hatası";
      appendLog("error", text);
      setError(text);
      setMessage("");
    } finally {
      setRunning(false);
      setPhase("");
    }
  }

  async function handlePriceSync() {
    resetSyncState("prices", "Fiyat kuyruğu hazırlanıyor...");

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
      let changed = 0;
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
        changed += result.changed || 0;
        offset = result.nextOffset ?? offset + (result.processed || 0);
        done = Boolean(result.done) || (result.processed || 0) === 0;

        setCurrent(Math.min(processed, targetTotal));
        setSyncedCount(changed);
        setMessage(
          `Detay fiyat: ${Math.min(processed, targetTotal)}/${targetTotal} tarandı, ${changed} fiyat değişti...`,
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
        `Fiyat senkronu tamamlandı. ${processed} ürün tarandı, ${changed} fiyat değişti.${failNote}`,
      );
      router.refresh();
    } catch (err) {
      const text = err.message || "Fiyat senkronizasyon hatası";
      appendLog("error", text);
      setError(text);
      setMessage("");
    } finally {
      setRunning(false);
      setPhase("");
    }
  }

  async function handleShopifySync() {
    resetSyncState("shopify", "Shopify kuyruğu hazırlanıyor...");

    try {
      const metaResponse = await fetch("/api/shopify/sync");
      const meta = await metaResponse.json();

      if (!metaResponse.ok) {
        throw new Error(meta.error || "Shopify meta bilgisi alınamadı");
      }

      const targetTotal = meta.total || 0;
      setTotal(targetTotal);

      if (targetTotal === 0) {
        setMessage("Shopify’a aktarılacak ürün yok.");
        appendLog("warn", "Shopify’a aktarılacak ürün yok.");
        return;
      }

      appendLog(
        "info",
        `${targetTotal} ürün Shopify’a aktarılacak (${meta.linked || 0} zaten bağlı).`,
      );
      setMessage(
        `${targetTotal} ürün Shopify’a aktarılacak (mevcutsa güncellenecek, pasifler taslak/stok 0)...`,
      );

      let processed = 0;
      let synced = 0;
      let skipped = 0;
      let failed = 0;
      let offset = 0;
      let done = false;

      while (!done) {
        const response = await fetch("/api/shopify/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit: meta.batchSize || 2 }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Shopify senkronu başarısız");
        }

        processed += result.processed || 0;
        synced += result.synced || 0;
        skipped += result.skipped || 0;
        failed += result.failed || 0;
        offset = result.nextOffset ?? offset + (result.processed || 0);
        done = Boolean(result.done) || (result.processed || 0) === 0;

        for (const item of result.results || []) {
          if (item.action === "failed") {
            appendLog(
              "error",
              `${item.smk_code} hata: ${item.error || "Shopify senkronu başarısız"}`,
            );
          } else if (item.action === "skipped") {
            appendLog("warn", `${item.smk_code} atlandı (pasif, Shopify’da yok)`);
          } else {
            appendLog("ok", `${item.smk_code} ${item.action}`);
          }
        }

        setCurrent(Math.min(processed, targetTotal));
        setSyncedCount(synced);
        setMessage(
          `Shopify: ${Math.min(processed, targetTotal)}/${targetTotal} işlendi, ${synced} senkronize${skipped ? `, ${skipped} atlandı` : ""}${failed ? `, ${failed} hata` : ""}...`,
        );
      }

      const doneText = `Shopify senkronu tamamlandı. ${synced} ürün güncellendi/eklendi${skipped ? `, ${skipped} pasif atlandı` : ""}${failed ? `, ${failed} hata` : ""}.`;
      appendLog(failed ? "warn" : "ok", doneText);
      setMessage(doneText);
      router.refresh();
    } catch (err) {
      const text = err.message || "Shopify senkronizasyon hatası";
      appendLog("error", text);
      setError(text);
      setMessage("");
    } finally {
      setRunning(false);
      setPhase("");
    }
  }

  async function handleShopierSync() {
    resetSyncState("shopier", "Shopier kuyruğu hazırlanıyor...");

    try {
      const metaResponse = await fetch("/api/shopier/sync");
      const meta = await metaResponse.json();

      if (!metaResponse.ok) {
        throw new Error(meta.error || "Shopier meta bilgisi alınamadı");
      }

      const targetTotal = meta.total || 0;
      setTotal(targetTotal);

      if (targetTotal === 0) {
        setMessage("Shopier’e aktarılacak ürün yok.");
        return;
      }

      setMessage(
        `${targetTotal} ürün Shopier’e aktarılacak (mevcutsa güncellenecek)...`,
      );

      let processed = 0;
      let synced = 0;
      let offset = 0;
      let done = false;
      const failedSamples = [];

      while (!done) {
        const response = await fetch("/api/shopier/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit: meta.batchSize || 3 }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Shopier senkronu başarısız");
        }

        processed += result.processed || 0;
        synced += result.synced || 0;
        offset = result.nextOffset ?? offset + (result.processed || 0);
        done = Boolean(result.done) || (result.processed || 0) === 0;

        setCurrent(Math.min(processed, targetTotal));
        setSyncedCount(synced);
        setMessage(
          `Shopier: ${Math.min(processed, targetTotal)}/${targetTotal} işlendi, ${synced} senkronize...`,
        );

        for (const item of result.results || []) {
          if (item.action === "failed") {
            appendLog("error", `${item.smk_code} hata`);
          } else {
            appendLog("ok", `${item.smk_code} ${item.action}`);
          }
        }
        for (const item of result.errors || []) {
          appendLog("error", `${item.smk_code}: ${item.error}`);
        }
      }

      const failNote = failedSamples.length
        ? ` Bazı hatalar: ${failedSamples
          .map((item) => `${item.smk_code} (${item.error})`)
          .join("; ")}`
        : "";

      setMessage(
        `Shopier senkronu tamamlandı. ${synced} ürün güncellendi/eklendi.${failNote}`,
      );
      router.refresh();
    } catch (err) {
      const text = err.message || "Shopier senkronizasyon hatası";
      appendLog("error", text);
      setError(text);
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
          {shopifyStoreUrl ? (
            <a
              href={shopifyStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2.5 rounded-xl border border-[#95BF47]/40 bg-[#95BF47]/12 px-3.5 py-2 text-sm font-semibold text-[#5E8E3E] transition hover:border-[#95BF47]/60 hover:bg-[#95BF47]/18"
              title="Shopify mağazasını aç"
            >
              <span>Shopify mağaza</span>
              <span aria-hidden="true" className="text-xs opacity-70">
                ↗
              </span>
            </a>
          ) : null}
          {storeUrl ? (
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2.5 rounded-xl border border-[#6B21FF]/30 bg-[#6B21FF]/12 px-3.5 py-2 text-sm font-semibold text-[#5B18E0] transition hover:border-[#6B21FF]/55 hover:bg-[#6B21FF]/18"
              title="Shopier mağazasını aç"
            >
              <Image
                src="/shopier_logo.png"
                alt="Shopier"
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-full"
              />
              <span>Shopier mağaza</span>
              <span aria-hidden="true" className="text-xs opacity-70">
                ↗
              </span>
            </a>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
          <button
            type="button"
            onClick={handleProductSync}
            disabled={running}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {running && (phase === "products" || phase === "details" || phase === "categories")
              ? phase === "details"
                ? "Detaylar çekiliyor..."
                : phase === "categories"
                  ? "Kategoriler çekiliyor..."
                  : "Ürünler çekiliyor..."
              : "Ürünleri senkronize et"}
          </button>

          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={refreshAllDetails}
              disabled={running}
              onChange={(event) => setRefreshAllDetails(event.target.checked)}
              className="rounded border-[var(--line)]"
            />
            Detayları da yeniden tara
          </label>

          <button
            type="button"
            onClick={handleDetailsSync}
            disabled={running}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--ink)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--track)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {running && phase === "details"
              ? "Detaylar çekiliyor..."
              : "Detayları tara"}
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

          <button
            type="button"
            onClick={handleShopifySync}
            disabled={running}
            className="inline-flex items-center justify-center rounded-xl border border-[#95BF47] bg-[#95BF47]/15 px-4 py-2.5 text-sm font-semibold text-[#5E8E3E] transition hover:bg-[#95BF47]/25 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {running && phase === "shopify"
              ? "Shopify senkronize ediliyor..."
              : "Ürünleri Shopify senkronize et"}
          </button>

          <button
            type="button"
            onClick={handleShopierSync}
            disabled={running}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-2.5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {running && phase === "shopier"
              ? "Shopier senkronize ediliyor..."
              : "Shopier senkronize et"}
          </button>
          <button
            type="button"
            onClick={handleCategorySync}
            disabled={running}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {running && phase === "categories"
              ? "Kategoriler çekiliyor..."
              : "Kategorileri çek"}
          </button>

          <button
            type="button"
            onClick={() => setCategoriesOpen(true)}
            disabled={running}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Shopify kategorileri
          </button>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-[var(--muted)]">
          <span>
            {total > 0
              ? `${phase === "products" ? "Sayfa" : "Ürün"} ${Math.min(current, total)} / ${total}`
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

        <SyncLogTerminal logs={logs} logRef={logRef} />
      </div>

      <ShopifyCategoriesModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
      />
    </section>
  );
}
