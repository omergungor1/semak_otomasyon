import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopierApiKey } from "@/lib/shopier/client";
import { syncProductToShopier } from "@/lib/shopier/sync";
import { getFxRates } from "@/lib/fx/convert";
import { DEFAULT_PRICING_SETTINGS } from "@/lib/pricing/calculate";

const BATCH_SIZE = 3;

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

export async function GET() {
  const { supabase, unauthorized } = await requireUser();
  if (unauthorized) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    getShopierApiKey();
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
    .not("shopier_product_id", "is", null);

  return NextResponse.json({
    total: total || 0,
    linked: linked || 0,
    batchSize: BATCH_SIZE,
  });
}

export async function POST(request) {
  const { supabase, unauthorized } = await requireUser();
  if (unauthorized) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    getShopierApiKey();
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(
      Math.max(Number(body?.limit) || BATCH_SIZE, 1),
      10,
    );
    const offset = Math.max(Number(body?.offset) || 0, 0);

    const { data: products, error: listError } = await supabase
      .from("products")
      .select("*")
      .order("smk_code", { ascending: true })
      .range(offset, offset + limit - 1);

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    if (!products?.length) {
      return NextResponse.json({
        processed: 0,
        synced: 0,
        failed: 0,
        done: true,
        nextOffset: offset,
        errors: [],
        results: [],
      });
    }

    const fxRates = await getFxRates();
    const { data: pricingRow } = await supabase
      .from("pricing_settings")
      .select("*")
      .eq("id", DEFAULT_PRICING_SETTINGS.id)
      .limit(1)
      .maybeSingle();
    const settings = pricingRow || DEFAULT_PRICING_SETTINGS;

    const results = [];
    const errors = [];
    let synced = 0;

    for (const product of products) {
      try {
        const result = await syncProductToShopier(supabase, product, {
          fxRates,
          settings,
        });
        synced += 1;
        results.push({
          id: product.id,
          smk_code: product.smk_code,
          action: result.action,
          shopier_product_id: result.shopierProductId,
          shopier_url: result.shopierUrl,
        });
      } catch (error) {
        errors.push({
          id: product.id,
          smk_code: product.smk_code,
          error: error.message || "Shopier senkronu başarısız",
        });
        results.push({
          id: product.id,
          smk_code: product.smk_code,
          action: "failed",
        });
      }

      await sleep(250);
    }

    const nextOffset = offset + products.length;
    const { count: total } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true });

    return NextResponse.json({
      processed: products.length,
      synced,
      failed: errors.length,
      nextOffset,
      done: nextOffset >= (total || 0) || products.length < limit,
      total: total || 0,
      errors,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Shopier senkronu başarısız" },
      { status: 500 },
    );
  }
}
