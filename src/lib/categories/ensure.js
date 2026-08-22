import { buildPathKey } from "@/lib/categories/normalize";
import { formatSupabaseError, syncLog } from "@/lib/sync-log";

async function findCategoryByPathKey(supabase, pathKey) {
  const { data, error } = await supabase
    .from("shopify_categories")
    .select("*")
    .eq("path_key", pathKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Kategori okunamadı: ${formatSupabaseError(error)}`);
  }
  return data || null;
}

async function insertCategory(supabase, row) {
  const { data, error } = await supabase
    .from("shopify_categories")
    .insert(row)
    .select("*")
    .single();

  if (!error) {
    syncLog("category", "kategori eklendi", {
      path_key: row.path_key,
      id: data?.id,
    });
    return data;
  }

  if (error.code === "23505") {
    const existing = await findCategoryByPathKey(supabase, row.path_key);
    if (existing) return existing;
  }

  throw new Error(`Kategori eklenemedi: ${formatSupabaseError(error)}`);
}

async function findOrCreateCategory(supabase, payload) {
  const pathKey = buildPathKey(payload.ana_kategori, payload.alt_kategori);
  if (!pathKey) return null;

  const existing = await findCategoryByPathKey(supabase, pathKey);
  if (existing) return existing;

  return insertCategory(supabase, {
    name: payload.name,
    parent_id: payload.parent_id,
    ana_kategori: payload.ana_kategori,
    alt_kategori: payload.alt_kategori,
    path_key: pathKey,
    updated_at: new Date().toISOString(),
  });
}

export async function ensureProductCategory(supabase, category) {
  if (!category?.ana_kategori) {
    syncLog("category", "breadcrumb yetersiz, kategori yok", category);
    return null;
  }

  const parent = await findOrCreateCategory(supabase, {
    name: category.ana_kategori,
    parent_id: null,
    ana_kategori: category.ana_kategori,
    alt_kategori: null,
  });

  if (!parent) return null;
  if (!category.alt_kategori) return parent;

  return findOrCreateCategory(supabase, {
    name: category.alt_kategori,
    parent_id: parent.id,
    ana_kategori: category.ana_kategori,
    alt_kategori: category.alt_kategori,
  });
}
