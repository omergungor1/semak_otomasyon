import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  categoryDisplayLabel,
  normalizeCategoryName,
} from "@/lib/categories/normalize";
import {
  createShopifyCollection,
  listShopifyCollections,
} from "@/lib/shopify/client";

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return { supabase: null, unauthorized: true };
  }

  return { supabase, unauthorized: false };
}

function withStatus(row, shopifyById, shopifyByTitle) {
  const label = categoryDisplayLabel(row);
  const linked = row.shopify_collection_id
    ? shopifyById.get(row.shopify_collection_id) || null
    : null;
  const titleMatch =
    shopifyByTitle.get(normalizeCategoryName(label)) ||
    shopifyByTitle.get(normalizeCategoryName(row.name)) ||
    null;

  return {
    ...row,
    label,
    inShopify: Boolean(linked),
    shopifyCollection: linked || null,
    titleMatch: linked ? null : titleMatch,
    missingInShopify: !linked,
  };
}

function mapsFromShopify(shopify) {
  return {
    shopifyById: new Map(shopify.map((item) => [item.id, item])),
    shopifyByTitle: new Map(
      shopify.map((item) => [normalizeCategoryName(item.title), item]),
    ),
  };
}

export async function GET() {
  const { supabase, unauthorized } = await requireUser();
  if (unauthorized) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { data: localRows, error: localError } = await supabase
    .from("shopify_categories")
    .select(
      "id, name, parent_id, shopify_collection_id, ana_kategori, alt_kategori, path_key, created_at, updated_at",
    )
    .order("ana_kategori", { ascending: true })
    .order("alt_kategori", { ascending: true, nullsFirst: true });

  if (localError) {
    return NextResponse.json({ error: localError.message }, { status: 500 });
  }

  let shopify = [];
  let shopifyError = null;

  try {
    shopify = await listShopifyCollections({ fresh: true });
  } catch (error) {
    shopifyError = error.message || "Shopify koleksiyonları alınamadı";
  }

  const { shopifyById, shopifyByTitle } = mapsFromShopify(shopify);
  const local = (localRows || []).map((row) =>
    withStatus(row, shopifyById, shopifyByTitle),
  );
  const missing = local.filter((row) => row.missingInShopify);

  return NextResponse.json({
    local,
    shopify,
    missingCount: missing.length,
    shopifyError,
  });
}

export async function POST(request) {
  const { supabase, unauthorized } = await requireUser();
  if (unauthorized) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const categoryId = body?.categoryId || body?.id || null;

    if (!categoryId) {
      return NextResponse.json(
        { error: "categoryId gerekli" },
        { status: 400 },
      );
    }

    const { data: row, error: rowError } = await supabase
      .from("shopify_categories")
      .select(
        "id, name, parent_id, shopify_collection_id, ana_kategori, alt_kategori, path_key, created_at, updated_at",
      )
      .eq("id", categoryId)
      .maybeSingle();

    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: "Kategori bulunamadı" }, { status: 404 });
    }

    const title = categoryDisplayLabel(row);
    if (!title) {
      return NextResponse.json(
        { error: "Kategori başlığı boş" },
        { status: 400 },
      );
    }

    const shopify = await listShopifyCollections();
    const { shopifyById, shopifyByTitle } = mapsFromShopify(shopify);

    let collection = row.shopify_collection_id
      ? shopifyById.get(row.shopify_collection_id) || null
      : null;
    let created = false;
    let linked = false;

    if (!collection) {
      collection =
        shopifyByTitle.get(normalizeCategoryName(title)) ||
        shopifyByTitle.get(normalizeCategoryName(row.name)) ||
        null;
      if (collection) {
        linked = true;
      } else {
        collection = await createShopifyCollection(title);
        created = true;
      }
    }

    if (
      row.shopify_collection_id &&
      row.shopify_collection_id === collection.id
    ) {
      return NextResponse.json({
        created: false,
        linked: false,
        already: true,
        collection,
        category: withStatus(row, shopifyById, shopifyByTitle),
      });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("shopify_categories")
      .update({
        shopify_collection_id: collection.id,
        updated_at: now,
      })
      .eq("id", row.id)
      .select(
        "id, name, parent_id, shopify_collection_id, ana_kategori, alt_kategori, path_key, created_at, updated_at",
      )
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const nextShopify = created
      ? [...shopify, collection]
      : shopify;
    const maps = mapsFromShopify(nextShopify);

    return NextResponse.json({
      created,
      linked,
      already: false,
      collection,
      category: withStatus(updated, maps.shopifyById, maps.shopifyByTitle),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Shopify koleksiyonu eklenemedi" },
      { status: 500 },
    );
  }
}
