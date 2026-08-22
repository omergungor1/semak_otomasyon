import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProductCategory } from "@/lib/categories/ensure";
import { buildPriceUpdateFields } from "@/lib/pricing/price-change";
import { fetchProductDetails, isSemakPageError, isSemakProductGoneError } from "@/lib/semak/scrape";
import { goneProductFields } from "@/lib/semak/gone-product";
import { formatSupabaseError, syncLog } from "@/lib/sync-log";

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

  syncLog("details", "meta", {
    total: total || 0,
    pending: pending || 0,
  });

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
        .select("id, smk_code, product_url, name, price")
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
          Object.assign(
            payload,
            buildPriceUpdateFields(product, details.offer, now),
          );
        }

        try {
          const savedCategory = await ensureProductCategory(
            supabase,
            details.category,
          );
          payload.category_synced_at = now;
          if (savedCategory?.id) payload.category_id = savedCategory.id;
        } catch (categoryError) {
          syncLog("details", "kategori kaydı atlandı", {
            smk_code: product.smk_code,
            error: categoryError.message,
          });
        }

        const { data: updated, error: updateError } = await supabase
          .from("products")
          .update(payload)
          .eq("id", product.id)
          .select(
            "*, category:shopify_categories(id, name, parent_id, ana_kategori, alt_kategori, shopify_collection_id, path_key)",
          )
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
      .select("id, smk_code, product_url, name, price")
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
      syncLog("details", "liste hatası", listError.message);
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    if (!products?.length) {
      const { count: pending } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .not("product_url", "is", null)
        .is("details_synced_at", null);

      syncLog("details", "kuyruk boş", { pending: pending || 0, mode });
      return NextResponse.json({
        mode,
        processed: 0,
        updated: 0,
        failed: 0,
        done: true,
        nextOffset: offset,
        pending: pending || 0,
        errors: [],
        results: [],
      });
    }

    syncLog("details", "batch başladı", {
      mode,
      count: products.length,
      first: products[0]?.smk_code,
    });

    const results = [];
    const errors = [];
    let updated = 0;
    let deactivated = 0;

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
          Object.assign(
            payload,
            buildPriceUpdateFields(product, details.offer, now),
          );
        }

        const category = details.category || null;
        try {
          const savedCategory = await ensureProductCategory(supabase, category);
          payload.category_synced_at = now;
          if (savedCategory?.id) payload.category_id = savedCategory.id;
        } catch (categoryError) {
          syncLog("details", "kategori kaydı atlandı", {
            smk_code: product.smk_code,
            error: categoryError.message,
            category,
          });
        }

        const { error: updateError } = await supabase
          .from("products")
          .update(payload)
          .eq("id", product.id);

        if (updateError) {
          const message = formatSupabaseError(updateError);
          syncLog("details", "update hatası", {
            smk_code: product.smk_code,
            error: message,
          });
          errors.push({
            smk_code: product.smk_code,
            error: message,
          });
          results.push({
            id: product.id,
            smk_code: product.smk_code,
            updated: false,
          });
        } else {
          updated += 1;
          syncLog("details", "güncellendi", {
            smk_code: product.smk_code,
            hasOffer: Boolean(details.offer),
            hasCategory: Boolean(payload.category_id),
            crumbs: details.category?.crumbs || [],
          });
          results.push({
            id: product.id,
            smk_code: product.smk_code,
            updated: true,
            specsCount: details.specifications?.length || 0,
            hasDescription: Boolean(details.description_text),
          });
        }
      } catch (error) {
        syncLog("details", "ürün hatası", {
          smk_code: product.smk_code,
          url: product.product_url,
          error: error.message,
        });

        if (isSemakProductGoneError(error)) {
          const now = new Date().toISOString();
          const { error: skipError } = await supabase
            .from("products")
            .update(goneProductFields(now))
            .eq("id", product.id);

          if (skipError) {
            errors.push({
              smk_code: product.smk_code,
              error: formatSupabaseError(skipError),
            });
          } else {
            deactivated += 1;
            syncLog("details", "ürün sitede yok, pasife alındı", {
              smk_code: product.smk_code,
              url: product.product_url,
            });
          }
        } else if (isSemakPageError(error)) {
          const now = new Date().toISOString();
          const { error: skipError } = await supabase
            .from("products")
            .update({
              details_synced_at: now,
              category_synced_at: now,
              updated_at: now,
            })
            .eq("id", product.id);

          if (skipError) {
            errors.push({
              smk_code: product.smk_code,
              error: formatSupabaseError(skipError),
            });
          } else {
            syncLog("details", "semak site hatası, ürün atlandı", {
              smk_code: product.smk_code,
            });
          }
        }

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

    syncLog("details", "batch bitti", {
      processed: products.length,
      updated,
      deactivated,
      failed: errors.length,
      pending: pending || 0,
      done,
    });

    if (
      updated === 0 &&
      errors.length === products.length &&
      errors.every((item) =>
        /schema cache|permission|RLS|column|eklenemedi/i.test(item.error || ""),
      )
    ) {
      return NextResponse.json(
        {
          error: errors[0]?.error || "Detay senkronu başarısız",
          mode,
          processed: products.length,
          updated: 0,
          failed: errors.length,
          pending: pending || 0,
          nextOffset,
          done: false,
          errors,
          results,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      mode,
      processed: products.length,
      updated,
      deactivated,
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
