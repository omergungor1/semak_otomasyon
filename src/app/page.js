import AdminShell from "@/components/admin-shell";
import ProductList from "@/components/product-list";
import SyncPanel from "@/components/sync-panel";
import { getFxRates } from "@/lib/fx/convert";
import { DEFAULT_PRICING_SETTINGS } from "@/lib/pricing/calculate";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const email = claimsData?.claims?.email || "";

  const { data: products, error, count } = await supabase
    .from("products")
    .select(
      "*, category:shopify_categories(id, name, parent_id, ana_kategori, alt_kategori, shopify_collection_id, path_key)",
      { count: "exact" },
    )
    .order("synced_at", { ascending: false })
    .order("name", { ascending: true });

  const { data: pricingRows } = await supabase
    .from("pricing_settings")
    .select("*")
    .eq("id", DEFAULT_PRICING_SETTINGS.id)
    .limit(1);

  const pricingSettings = pricingRows?.[0] || DEFAULT_PRICING_SETTINGS;

  let fxRates = null;
  let fxError = null;

  try {
    fxRates = await getFxRates();
  } catch (err) {
    fxError = err.message || "Kur servisi hatası";
  }

  const list = products || [];
  const withPrice = list.filter(
    (item) => item.price !== null && item.price !== undefined,
  ).length;
  const lastSync = list[0]?.synced_at
    ? new Date(list[0].synced_at).toLocaleString("tr-TR")
    : "Henüz yok";

  return (
    <AdminShell email={email}>
      <div className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(15,23,32,0.04)] animate-rise">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Toplam ürün
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
              {count ?? list.length}
            </p>
          </article>

          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(15,23,32,0.04)] animate-rise-delay">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Fiyatı olan
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
              {withPrice}
            </p>
          </article>

          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(15,23,32,0.04)] animate-rise-delay-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Son senkron
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-lg font-semibold leading-8 text-[var(--ink)]">
              {lastSync}
            </p>
          </article>
        </section>

        <SyncPanel
          storeUrl={process.env.SHOPIER_STORE_LINK || ""}
          shopifyStoreUrl={
            process.env.SHOPIFY_SHOP
              ? `https://${String(process.env.SHOPIFY_SHOP)
                  .replace(/^https?:\/\//, "")
                  .replace(/\/$/, "")
                  .replace(/\.myshopify\.com$/i, "")}.myshopify.com/admin`
              : ""
          }
        />

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Ürünler yüklenemedi: {error.message}
          </p>
        ) : (
          <ProductList
            products={list}
            fxRates={fxRates}
            fxError={fxError}
            pricingSettings={pricingSettings}
          />
        )}
      </div>
    </AdminShell>
  );
}
