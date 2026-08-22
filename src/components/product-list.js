"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { convertToTry, formatMoney } from "@/lib/fx/convert";
import {
  DEFAULT_PRICING_SETTINGS,
  resolveSalePrice,
} from "@/lib/pricing/calculate";
import { createClient } from "@/lib/supabase/client";
import ManualPriceModal from "@/components/manual-price-modal";
import PricingSettingsModal from "@/components/pricing-settings-modal";
import ProductDetailsModal from "@/components/product-details-modal";

const COLUMNS = [
  { key: "name", label: "Ürün Adı", className: "px-6 py-3" },
  { key: "brand", label: "Marka", className: "px-4 py-3" },
  { key: "category", label: "Kategori", className: "px-4 py-3" },
  { key: "price", label: "Semak Fiyat", className: "px-6 py-3" },
  { key: "previous_price", label: "Eski Fiyat", className: "px-4 py-3" },
  { key: "price_changed_at", label: "Fiyat değişimi", className: "px-4 py-3" },
  { key: "try", label: "TRY", className: "px-6 py-3" },
  { key: "sale", label: "Satış Fiyatı", className: "px-6 py-3" },
  { key: "is_active", label: "Aktif", className: "px-4 py-3" },
];

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "has_sale", label: "Satış fiyatı olanlar" },
  { key: "no_sale", label: "Satış fiyatı olmayanlar" },
  { key: "has_cost", label: "Alış fiyatı olanlar" },
  { key: "no_cost", label: "Alış fiyatı olmayanlar" },
  { key: "manual", label: "Manuel satış" },
  { key: "active", label: "Aktifler" },
  { key: "inactive", label: "Pasifler" },
  { key: "shopify", label: "Shopify’da olanlar" },
  { key: "no_shopify", label: "Shopify’da olmayanlar" },
];

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "tr", {
    sensitivity: "base",
    numeric: true,
  });
}

function compareNumber(a, b) {
  const aEmpty = a === null || a === undefined || Number.isNaN(Number(a));
  const bEmpty = b === null || b === undefined || Number.isNaN(Number(b));

  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  return Number(a) - Number(b);
}

function compareDate(a, b) {
  const aTime = a ? new Date(a).getTime() : NaN;
  const bTime = b ? new Date(b).getTime() : NaN;
  const aEmpty = Number.isNaN(aTime);
  const bEmpty = Number.isNaN(bTime);

  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  return aTime - bTime;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("tr-TR");
}

function categoryLabel(product) {
  const category = product?.category;
  if (!category) return "";
  if (category.alt_kategori) {
    return `${category.ana_kategori} / ${category.alt_kategori}`;
  }
  return category.ana_kategori || category.name || "";
}

function GearIcon({ className = "" }) {
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
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

function PencilIcon({ className = "" }) {
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
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
      />
    </svg>
  );
}

function ExternalLinkIcon({ className = "" }) {
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
        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5M10.5 13.5 21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}

function MoreIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

async function syncProductToShopify(productId) {
  const response = await fetch(`/api/shopify/products/${productId}`, {
    method: "POST",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Shopify güncellemesi başarısız");
  }
  return result;
}

async function syncProductToShopier(productId) {
  const response = await fetch(`/api/shopier/products/${productId}`, {
    method: "POST",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Shopier güncellemesi başarısız");
  }
  return result;
}

export default function ProductList({
  products: initialProducts,
  fxRates = null,
  fxError = null,
  pricingSettings: initialPricingSettings = DEFAULT_PRICING_SETTINGS,
}) {
  const [products, setProducts] = useState(initialProducts);
  const [pricingSettings, setPricingSettings] = useState(
    initialPricingSettings || DEFAULT_PRICING_SETTINGS,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualProduct, setManualProduct] = useState(null);
  const [detailsProduct, setDetailsProduct] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [rowBusyId, setRowBusyId] = useState(null);

  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  useEffect(() => {
    setPricingSettings(initialPricingSettings || DEFAULT_PRICING_SETTINGS);
  }, [initialPricingSettings]);

  function getTryCost(product) {
    return convertToTry(product.price, product.currency, fxRates?.rates);
  }

  function getSaleInfo(product) {
    return resolveSalePrice({
      tryCost: getTryCost(product),
      manualSalePrice: product.manual_sale_price,
      settings: pricingSettings,
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return products.filter((product) => {
      const haystack = [
        product.name,
        product.smk_code,
        product.material_code,
        product.brand,
        categoryLabel(product),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (q && !haystack.includes(q)) return false;

      const sale = getSaleInfo(product);
      const hasCost =
        product.price !== null &&
        product.price !== undefined &&
        product.price !== "";
      const isActive = product.is_active !== false;

      switch (filter) {
        case "has_sale":
          return sale.amount !== null;
        case "no_sale":
          return sale.amount === null;
        case "has_cost":
          return hasCost;
        case "no_cost":
          return !hasCost;
        case "manual":
          return (
            product.manual_sale_price !== null &&
            product.manual_sale_price !== undefined
          );
        case "active":
          return isActive;
        case "inactive":
          return !isActive;
        case "shopify":
          return Boolean(product.shopify_product_id);
        case "no_shopify":
          return !product.shopify_product_id;
        default:
          return true;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, query, filter, pricingSettings, fxRates]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const direction = sortDir === "asc" ? 1 : -1;

    list.sort((a, b) => {
      let result = 0;

      if (sortKey === "name") {
        result = compareText(a.name, b.name);
      } else if (sortKey === "smk_code") {
        result = compareText(a.smk_code, b.smk_code);
      } else if (sortKey === "material_code") {
        result = compareText(a.material_code, b.material_code);
      } else if (sortKey === "brand") {
        result = compareText(a.brand, b.brand);
      } else if (sortKey === "category") {
        result = compareText(categoryLabel(a), categoryLabel(b));
      } else if (sortKey === "price") {
        result = compareNumber(a.price, b.price);
      } else if (sortKey === "previous_price") {
        result = compareNumber(a.previous_price, b.previous_price);
      } else if (sortKey === "price_changed_at") {
        result = compareDate(a.price_changed_at, b.price_changed_at);
      } else if (sortKey === "try") {
        result = compareNumber(getTryCost(a), getTryCost(b));
      } else if (sortKey === "sale") {
        result = compareNumber(getSaleInfo(a).amount, getSaleInfo(b).amount);
      } else if (sortKey === "is_active") {
        result = Number(b.is_active !== false) - Number(a.is_active !== false);
      }

      if (result !== 0) return result * direction;
      return compareText(a.smk_code, b.smk_code);
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, pricingSettings, fxRates]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDir(
      key === "price" ||
        key === "previous_price" ||
        key === "price_changed_at" ||
        key === "try" ||
        key === "sale"
        ? "desc"
        : "asc",
    );
  }

  function sortIndicator(key) {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "▲" : "▼";
  }

  function patchProduct(updated) {
    setProducts((current) =>
      current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
    );
  }

  async function toggleActive(product) {
    const previous = product.is_active !== false;
    const next = !previous;
    setTogglingId(product.id);
    patchProduct({ ...product, is_active: next });

    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .update({
        is_active: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", product.id)
      .select("*")
      .single();

    setTogglingId(null);

    if (error) {
      patchProduct({ ...product, is_active: previous });
      window.alert(error.message);
      return;
    }

    patchProduct({ ...product, ...data });

    if (data.shopify_product_id || product.shopify_product_id) {
      try {
        const result = await syncProductToShopify(product.id);
        if (result.product) {
          patchProduct(result.product);
        }
      } catch (syncError) {
        window.alert(
          `Aktiflik kaydedildi ama Shopify güncellenemedi: ${syncError.message}`,
        );
      }
    }
  }

  async function refreshProductDetails(product) {
    setRowBusyId(product.id);
    setMenuOpenId(null);

    try {
      const response = await fetch("/api/sync/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Detay çekilemedi");
      }

      if (result.product) {
        patchProduct(result.product);
      }
    } catch (error) {
      window.alert(error.message || "Detay çekilemedi");
    } finally {
      setRowBusyId(null);
    }
  }

  async function updateProductOnShopify(product) {
    setRowBusyId(product.id);
    setMenuOpenId(null);

    try {
      const result = await syncProductToShopify(product.id);
      if (result.product) {
        patchProduct(result.product);
      }
    } catch (error) {
      window.alert(error.message || "Shopify güncellemesi başarısız");
    } finally {
      setRowBusyId(null);
    }
  }

  async function updateProductOnShopier(product) {
    setRowBusyId(product.id);
    setMenuOpenId(null);

    try {
      const result = await syncProductToShopier(product.id);
      if (result.product) {
        patchProduct(result.product);
      }
    } catch (error) {
      window.alert(error.message || "Shopier güncellemesi başarısız");
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleManualPriceSaved(updated) {
    patchProduct(updated);

    try {
      const result = await syncProductToShopify(updated.id);
      if (result.product) {
        patchProduct(result.product);
      }
    } catch (error) {
      window.alert(
        `Fiyat kaydedildi ama Shopify güncellenemedi: ${error.message}`,
      );
    }
  }

  function renderProductName(product) {
    return (
      <div className="flex min-w-0 items-start gap-1.5">
        <button
          type="button"
          onClick={() => setDetailsProduct(product)}
          className="line-clamp-2 text-left font-medium text-[var(--ink)] transition hover:text-[var(--accent)]"
        >
          {product.name}
        </button>
        {product.product_url ? (
          <a
            href={product.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--track)] hover:text-[var(--accent)]"
            aria-label="Semak ürün sayfasını aç"
            title="Semak ürün sayfasını aç"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        ) : null}
        {product.shopify_url ? (
          <a
            href={product.shopify_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--track)] hover:text-[#5E8E3E]"
            aria-label="Shopify ürün sayfasını aç"
            title="Shopify ürün sayfasını aç"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    );
  }

  function renderSaleCell(product) {
    const sale = getSaleInfo(product);
    const hasCost =
      product.price !== null &&
      product.price !== undefined &&
      product.price !== "";

    if (sale.amount !== null) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[var(--ink)]">
              {formatMoney(sale.amount, "TRY")}
            </span>
            <button
              type="button"
              onClick={() => setManualProduct(product)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--track)] hover:text-[var(--accent)]"
              aria-label="Satış fiyatını düzenle"
              title="Satış fiyatını düzenle"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          {sale.source === "manual" ? (
            <span className="text-[11px] text-[var(--muted)]">Manuel fiyat</span>
          ) : null}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setManualProduct(product)}
        className="rounded-lg border border-dashed border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        {hasCost ? "Hesaplanamadı · Ayarla" : "Ayarla"}
      </button>
    );
  }

  function ActiveSwitch({ product }) {
    const checked = product.is_active !== false;
    const busy = togglingId === product.id;

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-busy={busy}
        aria-label={busy ? "Güncelleniyor" : checked ? "Aktif" : "Pasif"}
        disabled={busy}
        onClick={() => toggleActive(product)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${busy
          ? "cursor-not-allowed bg-[var(--line)] opacity-50"
          : checked
            ? "bg-[var(--accent)]"
            : "bg-[var(--line)]"
          }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0.5"
            }`}
        />
      </button>
    );
  }

  function ProductRowMenu({ product }) {
    const open = menuOpenId === product.id;
    const busy = rowBusyId === product.id;

    return (
      <div className="relative">
        <button
          type="button"
          aria-label="Ürün işlemleri"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpenId(open ? null : product.id);
          }}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--track)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 ${open
            ? "bg-[var(--track)] text-[var(--ink)] opacity-100"
            : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
            }`}
        >
          <MoreIcon className="h-4 w-4" />
        </button>

        {open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              aria-label="Menüyü kapat"
              onClick={() => setMenuOpenId(null)}
            />
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 min-w-[220px] overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-[0_12px_30px_rgba(15,23,32,0.12)]"
            >
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => refreshProductDetails(product)}
                className="block w-full px-3 py-2 text-left text-sm text-[var(--ink)] transition hover:bg-[var(--track)] disabled:opacity-50"
              >
                Ürün detayını tekrar çek
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => updateProductOnShopify(product)}
                className="block w-full px-3 py-2 text-left text-sm text-[var(--ink)] transition hover:bg-[var(--track)] disabled:opacity-50"
              >
                Ürünü Shopify güncelle
              </button>
              {product.shopify_url ? (
                <a
                  href={product.shopify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  className="block px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--track)] hover:text-[var(--ink)]"
                  onClick={() => setMenuOpenId(null)}
                >
                  Shopify sayfasını aç
                </a>
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => updateProductOnShopier(product)}
                className="block w-full px-3 py-2 text-left text-sm text-[var(--ink)] transition hover:bg-[var(--track)] disabled:opacity-50"
              >
                Ürünü Shopier güncelle
              </button>
              {product.shopier_url ? (
                <a
                  href={product.shopier_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  className="block px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--track)] hover:text-[var(--ink)]"
                  onClick={() => setMenuOpenId(null)}
                >
                  Shopier sayfasını aç
                </a>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(15,23,32,0.04)]">
      <div className="border-b border-[var(--line)] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
              Ürünler
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {sorted.length} / {products.length} ürün gösteriliyor
              {fxRates?.updatedAt
                ? ` · Kur: ${new Date(fxRates.updatedAt).toLocaleString("tr-TR")}`
                : ""}
            </p>
            {fxError ? (
              <p className="mt-1 text-xs text-red-600">
                Kur alınamadı: {fxError}. TRY / satış hesabı etkilenebilir.
              </p>
            ) : null}
          </div>

          <div className="flex w-full items-center gap-2 sm:max-w-md">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ad, SMK veya malzeme kodu ara..."
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              aria-label="Fiyatlandırma ayarları"
              title="Fiyatlandırma ayarları"
            >
              <GearIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active
                  ? "bg-[var(--ink)] text-white"
                  : "bg-[var(--track)] text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="px-5 py-14 text-center sm:px-6">
          <p className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--ink)]">
            Ürün bulunamadı
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {products.length === 0
              ? "Henüz senkron yapılmadı. Yukarıdaki butonla ürünleri çekin."
              : "Filtre veya arama kriterlerinize uygun kayıt yok."}
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[var(--line)] md:hidden">
            {sorted.map((product) => (
              <li key={product.id} className="group flex gap-3 p-4">
                <button
                  type="button"
                  onClick={() => setDetailsProduct(product)}
                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--track)]"
                  aria-label={`${product.name} detayını aç`}
                >
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
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 text-sm font-semibold">
                      {renderProductName(product)}
                    </div>
                    <div className="flex items-center gap-1">
                      <ActiveSwitch product={product} />
                      <ProductRowMenu product={product} />
                    </div>
                  </div>
                  <p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]">
                    SMK {product.smk_code}
                  </p>
                  <p className="mt-0.5 font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]">
                    Malzeme {product.material_code || "—"}
                  </p>
                  {categoryLabel(product) ? (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {categoryLabel(product)}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                    {formatMoney(product.price, product.currency)}
                  </p>
                  {product.previous_price !== null &&
                    product.previous_price !== undefined ? (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      Eski {formatMoney(product.previous_price, product.currency)}
                      {product.price_changed_at
                        ? ` · ${formatDateTime(product.price_changed_at)}`
                        : ""}
                    </p>
                  ) : product.price_changed_at ? (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      Fiyat değişimi {formatDateTime(product.price_changed_at)}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-sm font-semibold text-[var(--accent)]">
                    TRY{" "}
                    {getTryCost(product) === null
                      ? "—"
                      : formatMoney(getTryCost(product), "TRY")}
                  </p>
                  <div className="mt-2">{renderSaleCell(product)}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--track)]/70 text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  {COLUMNS.map((column) => {
                    const active = sortKey === column.key;

                    return (
                      <th key={column.key} className={column.className}>
                        <button
                          type="button"
                          onClick={() => handleSort(column.key)}
                          className={`inline-flex items-center gap-1.5 font-semibold transition hover:text-[var(--ink)] ${active ? "text-[var(--ink)]" : ""
                            }`}
                          aria-sort={
                            active
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <span>{column.label}</span>
                          <span className="text-[10px] opacity-70" aria-hidden="true">
                            {sortIndicator(column.key)}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {sorted.map((product) => (
                  <tr
                    key={product.id}
                    className={`group transition hover:bg-[var(--track)]/40 ${product.is_active === false ? "opacity-60" : ""
                      }`}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setDetailsProduct(product)}
                          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--track)]"
                          aria-label={`${product.name} detayını aç`}
                        >
                          {product.image_url ? (
                            <Image
                              src={product.image_url}
                              alt={product.name}
                              fill
                              className="object-contain p-1"
                              sizes="56px"
                            />
                          ) : null}
                        </button>
                        <div className="min-w-0">{renderProductName(product)}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {product.brand || "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {categoryLabel(product) || "—"}
                    </td>
                    <td className="px-6 py-3 font-medium text-[var(--ink)]">
                      {formatMoney(product.price, product.currency)}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {formatMoney(product.previous_price, product.currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">
                      {formatDateTime(product.price_changed_at)}
                    </td>
                    <td className="px-6 py-3 font-semibold text-[var(--accent)]">
                      {getTryCost(product) === null
                        ? "—"
                        : formatMoney(getTryCost(product), "TRY")}
                    </td>
                    <td className="px-6 py-3">{renderSaleCell(product)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <ActiveSwitch product={product} />
                        <ProductRowMenu product={product} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-[var(--line)] px-5 py-3 text-xs text-[var(--muted)] sm:px-6">
            Satış = TRY × (1 − iskonto) × çarpan + kargo + ek → KDV → yuvarlama ·
            Kur kaynağı:{" "}
            <a
              href="https://www.exchangerate-api.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--ink)]"
            >
              Exchange Rate API
            </a>
          </p>
        </>
      )}

      <PricingSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialSettings={pricingSettings}
        onSaved={(settings) => {
          setPricingSettings(settings);
        }}
      />

      <ManualPriceModal
        open={Boolean(manualProduct)}
        product={manualProduct}
        onClose={() => setManualProduct(null)}
        onSaved={handleManualPriceSaved}
      />

      <ProductDetailsModal
        open={Boolean(detailsProduct)}
        product={detailsProduct}
        onClose={() => setDetailsProduct(null)}
        tryPrice={
          detailsProduct ? getTryCost(detailsProduct) : null
        }
        salePrice={
          detailsProduct ? getSaleInfo(detailsProduct).amount : null
        }
        saleSource={
          detailsProduct ? getSaleInfo(detailsProduct).source : null
        }
      />
    </section>
  );
}
