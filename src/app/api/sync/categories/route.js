import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProductCategory } from "@/lib/categories/ensure";
import { fetchProductCategory, isSemakPageError, isSemakProductGoneError } from "@/lib/semak/scrape";
import { goneProductFields } from "@/lib/semak/gone-product";
import { formatSupabaseError, syncLog } from "@/lib/sync-log";

const BATCH_SIZE = 8;

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

function pendingQuery(supabase) {
  return supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .not("product_url", "is", null)
    .is("category_synced_at", null);
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

  const { count: pending, error: pendingError } = await pendingQuery(supabase);

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  syncLog("categories", "meta", {
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
    const limit = Math.min(
      Math.max(Number(body?.limit) || BATCH_SIZE, 1),
      15,
    );

    const { data: products, error: listError } = await supabase
      .from("products")
      .select("id, smk_code, product_url, name")
      .not("product_url", "is", null)
      .is("category_synced_at", null)
      .order("smk_code", { ascending: true })
      .limit(limit);

    if (listError) {
      syncLog("categories", "liste hatası", listError.message);
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    if (!products?.length) {
      const { count: pending } = await pendingQuery(supabase);
      syncLog("categories", "kuyruk boş", { pending: pending || 0 });
      return NextResponse.json({
        processed: 0,
        updated: 0,
        failed: 0,
        done: true,
        pending: pending || 0,
        errors: [],
        results: [],
      });
    }

    syncLog("categories", "batch başladı", {
      count: products.length,
      first: products[0]?.smk_code,
    });

    const results = [];
    const errors = [];
    let updated = 0;
    let deactivated = 0;

    for (const product of products) {
      try {
        const categoryInfo = await fetchProductCategory(product.product_url);
        syncLog("categories", "breadcrumb", {
          smk_code: product.smk_code,
          crumbs: categoryInfo?.crumbs || [],
          ana: categoryInfo?.ana_kategori || null,
          alt: categoryInfo?.alt_kategori || null,
        });

        const category = await ensureProductCategory(supabase, categoryInfo);
        const now = new Date().toISOString();
        const payload = {
          category_synced_at: now,
          updated_at: now,
        };

        if (category?.id) payload.category_id = category.id;

        const { error: updateError } = await supabase
          .from("products")
          .update(payload)
          .eq("id", product.id);

        if (updateError) {
          const message = formatSupabaseError(updateError);
          syncLog("categories", "update hatası", {
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
          if (category?.id) updated += 1;
          results.push({
            id: product.id,
            smk_code: product.smk_code,
            updated: Boolean(category?.id),
            category_id: category?.id || null,
            path_key: category?.path_key || null,
          });
        }
      } catch (error) {
        syncLog("categories", "ürün hatası", {
          smk_code: product.smk_code,
          url: product.product_url,
          error: error.message,
        });

        if (isSemakProductGoneError(error)) {
          const now = new Date().toISOString();
          await supabase
            .from("products")
            .update(goneProductFields(now))
            .eq("id", product.id);
          deactivated += 1;
          syncLog("categories", "ürün sitede yok, pasife alındı", {
            smk_code: product.smk_code,
            url: product.product_url,
          });
        } else if (isSemakPageError(error)) {
          const now = new Date().toISOString();
          await supabase
            .from("products")
            .update({
              category_synced_at: now,
              updated_at: now,
            })
            .eq("id", product.id);
          syncLog("categories", "semak site hatası, ürün atlandı", {
            smk_code: product.smk_code,
          });
        }

        errors.push({
          smk_code: product.smk_code,
          error: error.message || "Kategori okunamadı",
        });
        results.push({
          id: product.id,
          smk_code: product.smk_code,
          updated: false,
        });
      }

      await sleep(80);
    }

    const { count: pending } = await pendingQuery(supabase);

    syncLog("categories", "batch bitti", {
      processed: products.length,
      updated,
      deactivated,
      failed: errors.length,
      pending: pending || 0,
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
          error: errors[0]?.error || "Kategori senkronu başarısız",
          processed: products.length,
          updated: 0,
          failed: errors.length,
          pending: pending || 0,
          done: false,
          errors,
          results,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      processed: products.length,
      updated,
      deactivated,
      failed: errors.length,
      pending: pending || 0,
      done: (pending || 0) === 0,
      errors,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Kategori senkronu başarısız" },
      { status: 500 },
    );
  }
}
