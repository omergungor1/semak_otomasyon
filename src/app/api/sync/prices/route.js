import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchProductOffer } from "@/lib/semak/scrape";

const BATCH_SIZE = 5;

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

  const { count: total, error: totalError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .not("product_url", "is", null);

  if (totalError) {
    return NextResponse.json({ error: totalError.message }, { status: 500 });
  }

  const { count: pending, error: pendingError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .not("product_url", "is", null)
    .is("price", null)
    .is("price_synced_at", null);

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  const { count: missingPrice, error: missingError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .not("product_url", "is", null)
    .is("price", null);

  if (missingError) {
    return NextResponse.json({ error: missingError.message }, { status: 500 });
  }

  return NextResponse.json({
    total: total || 0,
    pending: pending || 0,
    missingPrice: missingPrice || 0,
    batchSize: BATCH_SIZE,
  });
}

export async function POST(request) {
  const { supabase, unauthorized } = await requireUser();
  if (unauthorized) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === "all" ? "all" : "pending";
    const limit = Math.min(
      Math.max(Number(body?.limit) || BATCH_SIZE, 1),
      10,
    );
    const offset = Math.max(Number(body?.offset) || 0, 0);

    let query = supabase
      .from("products")
      .select("id, smk_code, product_url, name")
      .not("product_url", "is", null)
      .order("smk_code", { ascending: true })
      .limit(limit);

    if (mode === "pending") {
      query = query.is("price", null).is("price_synced_at", null);
    } else {
      query = query.range(offset, offset + limit - 1);
    }

    const { data: products, error: listError } = await query;

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    if (!products?.length) {
      return NextResponse.json({
        mode,
        processed: 0,
        updated: 0,
        failed: 0,
        done: true,
        nextOffset: offset,
        errors: [],
        results: [],
      });
    }

    const results = [];
    const errors = [];
    let updated = 0;

    for (const product of products) {
      try {
        const offer = await fetchProductOffer(product.product_url);

        if (!offer) {
          const { error: markError } = await supabase
            .from("products")
            .update({
              price_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", product.id);

          errors.push({
            smk_code: product.smk_code,
            error: markError?.message || "JSON-LD offers.price bulunamadı",
          });
          results.push({
            id: product.id,
            smk_code: product.smk_code,
            updated: false,
          });
          await sleep(120);
          continue;
        }

        const { error: updateError } = await supabase
          .from("products")
          .update({
            price: offer.price,
            currency: offer.currency || "TRY",
            price_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", product.id);

        if (updateError) {
          errors.push({
            smk_code: product.smk_code,
            error: updateError.message,
          });
          results.push({
            id: product.id,
            smk_code: product.smk_code,
            updated: false,
          });
        } else {
          updated += 1;
          results.push({
            id: product.id,
            smk_code: product.smk_code,
            price: offer.price,
            currency: offer.currency,
            updated: true,
          });
        }
      } catch (error) {
        errors.push({
          smk_code: product.smk_code,
          error: error.message || "Detay sayfası okunamadı",
        });
        results.push({
          id: product.id,
          smk_code: product.smk_code,
          updated: false,
        });
      }

      await sleep(120);
    }

    const { count: pending } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .not("product_url", "is", null)
      .is("price", null)
      .is("price_synced_at", null);

    const nextOffset = offset + products.length;
    const done =
      mode === "pending"
        ? (pending || 0) === 0
        : products.length < limit;

    return NextResponse.json({
      mode,
      processed: products.length,
      updated,
      failed: errors.length,
      pending: pending || 0,
      nextOffset,
      done,
      errors,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Fiyat senkronu başarısız" },
      { status: 500 },
    );
  }
}
