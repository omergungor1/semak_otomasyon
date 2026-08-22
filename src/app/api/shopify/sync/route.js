import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopifyShopDomain } from "@/lib/shopify/client";
import { loadShopifySyncContext, syncProductToShopify } from "@/lib/shopify/sync";

const BATCH_SIZE = 2;

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return { supabase: null, unauthorized: true };
  }

  return { supabase, unauthorized: false };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PRODUCT_SELECT =
  "*, category:shopify_categories(id, name, parent_id, ana_kategori, alt_kategori, shopify_collection_id, path_key)";

export async function GET() {
  const { supabase, unauthorized } = await requireUser();
  if (unauthorized) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    getShopifyShopDomain();
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count: total, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count: linked } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .not("shopify_product_id", "is", null);

  const { count: pending } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .is("shopify_product_id", null)
    .eq("is_active", true);

  return NextResponse.json({
    total: total || 0,
    linked: linked || 0,
    pending: pending || 0,
    batchSize: BATCH_SIZE,
  });
}

export async function POST(request) {
  const { supabase, unauthorized } = await requireUser();
  if (unauthorized) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    getShopifyShopDomain();
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(
      Math.max(Number(body?.limit) || BATCH_SIZE, 1),
      5,
    );
    const offset = Math.max(Number(body?.offset) || 0, 0);

    const { data: products, error: listError } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .order("smk_code", { ascending: true })
      .range(offset, offset + limit - 1);

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    if (!products?.length) {
      return NextResponse.json({
        processed: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        done: true,
        nextOffset: offset,
        errors: [],
        results: [],
      });
    }

    const context = await loadShopifySyncContext(supabase);
    const results = [];
    const errors = [];
    let synced = 0;
    let skipped = 0;

    for (const product of products) {
      try {
        const result = await syncProductToShopify(supabase, product, context);
        if (result.action === "skipped") {
          skipped += 1;
        } else {
          synced += 1;
        }
        results.push({
          id: product.id,
          smk_code: product.smk_code,
          action: result.action,
          shopify_product_id: result.shopifyProductId,
          shopify_url: result.shopifyUrl,
        });
      } catch (error) {
        errors.push({
          id: product.id,
          smk_code: product.smk_code,
          error: error.message || "Shopify senkronu başarısız",
        });
        results.push({
          id: product.id,
          smk_code: product.smk_code,
          action: "failed",
          error: error.message || "Shopify senkronu başarısız",
        });
      }

      await sleep(350);
    }

    const nextOffset = offset + products.length;
    const { count: total } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true });

    return NextResponse.json({
      processed: products.length,
      synced,
      skipped,
      failed: errors.length,
      nextOffset,
      done: nextOffset >= (total || 0) || products.length < limit,
      total: total || 0,
      errors,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Shopify senkronu başarısız" },
      { status: 500 },
    );
  }
}
