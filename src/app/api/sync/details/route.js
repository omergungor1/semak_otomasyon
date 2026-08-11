import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchProductDetails } from "@/lib/semak/scrape";

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
    .is("details_synced_at", null);

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  return NextResponse.json({
    total: total || 0,
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
    const body = await request.json().catch(() => ({}));
    const productId = body?.productId || body?.id || null;

    if (productId) {
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, smk_code, product_url, name")
        .eq("id", productId)
        .maybeSingle();

      if (productError) {
        return NextResponse.json(
          { error: productError.message },
          { status: 500 },
        );
      }

      if (!product?.product_url) {
        return NextResponse.json(
          { error: "Ürün veya ürün URL’si bulunamadı" },
          { status: 404 },
        );
      }

      try {
        const details = await fetchProductDetails(product.product_url);
        const now = new Date().toISOString();
        const payload = {
          description: details.description_html || details.description_text,
          specifications: details.specifications,
          details_synced_at: now,
          updated_at: now,
        };

        if (details.offer) {
          payload.price = details.offer.price;
          payload.currency = details.offer.currency || "TRY";
          payload.price_synced_at = now;
        }

        const { data: updated, error: updateError } = await supabase
          .from("products")
          .update(payload)
          .eq("id", product.id)
          .select("*")
          .single();

        if (updateError) {
          return NextResponse.json(
            { error: updateError.message },
            { status: 500 },
          );
        }

        return NextResponse.json({
          mode: "single",
          processed: 1,
          updated: 1,
          failed: 0,
          done: true,
          product: updated,
          results: [
            {
              id: product.id,
              smk_code: product.smk_code,
              updated: true,
              specsCount: details.specifications?.length || 0,
              hasDescription: Boolean(details.description_text),
            },
          ],
        });
      } catch (error) {
        return NextResponse.json(
          { error: error.message || "Detay sayfası okunamadı" },
          { status: 500 },
        );
      }
    }

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
      query = query.is("details_synced_at", null);
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
        pending: 0,
        errors: [],
        results: [],
      });
    }

    const results = [];
    const errors = [];
    let updated = 0;

    for (const product of products) {
      try {
        const details = await fetchProductDetails(product.product_url);
        const now = new Date().toISOString();

        const payload = {
          description: details.description_html || details.description_text,
          specifications: details.specifications,
          details_synced_at: now,
          updated_at: now,
        };

        if (details.offer) {
          payload.price = details.offer.price;
          payload.currency = details.offer.currency || "TRY";
          payload.price_synced_at = now;
        }

        const { error: updateError } = await supabase
          .from("products")
          .update(payload)
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
            updated: true,
            specsCount: details.specifications?.length || 0,
            hasDescription: Boolean(details.description_text),
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
      .is("details_synced_at", null);

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
      { error: error.message || "Detay senkronu başarısız" },
      { status: 500 },
    );
  }
}
