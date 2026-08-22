import { getFxRates } from "@/lib/fx/convert";
import { DEFAULT_PRICING_SETTINGS } from "@/lib/pricing/calculate";
import { getShopifyShopContext } from "@/lib/shopify/client";
import { buildShopifyProductInput } from "@/lib/shopify/payload";
import {
  addProductToCollection,
  createShopifyProduct,
  findShopifyProductBySku,
  getShopifyProduct,
  publishShopifyProduct,
  removeProductFromCollection,
  setShopifyInventoryQuantity,
  summarizeShopifyProduct,
  updateShopifyProduct,
  updateShopifyVariant,
} from "@/lib/shopify/products";
import { formatSupabaseError, syncLog } from "@/lib/sync-log";

async function loadPricingSettings(supabase) {
  const { data } = await supabase
    .from("pricing_settings")
    .select("*")
    .eq("id", DEFAULT_PRICING_SETTINGS.id)
    .limit(1)
    .maybeSingle();

  return data || DEFAULT_PRICING_SETTINGS;
}

async function loadCategoryMap(supabase) {
  const { data, error } = await supabase
    .from("shopify_categories")
    .select("id, parent_id, shopify_collection_id");

  if (error) {
    throw new Error(`Kategoriler okunamadı: ${formatSupabaseError(error)}`);
  }

  return new Map((data || []).map((row) => [row.id, row]));
}

function targetCollectionIds(product, categoryMap) {
  const ids = [];
  const seen = new Set();

  function push(id) {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  }

  const category =
    product.category ||
    (product.category_id ? categoryMap.get(product.category_id) : null);
  if (!category) return ids;

  push(category.shopify_collection_id);

  const parent =
    category.parent ||
    (category.parent_id ? categoryMap.get(category.parent_id) : null);
  if (parent?.shopify_collection_id) {
    push(parent.shopify_collection_id);
  }

  return ids;
}

function managedCollectionIds(categoryMap) {
  return new Set(
    [...categoryMap.values()]
      .map((row) => row.shopify_collection_id)
      .filter(Boolean),
  );
}

async function syncCollections({ productId, currentIds, targetIds, managedIds }) {
  const current = new Set(currentIds || []);

  for (const collectionId of targetIds) {
    if (!current.has(collectionId)) {
      await addProductToCollection(collectionId, productId);
    }
  }

  for (const collectionId of current) {
    if (managedIds.has(collectionId) && !targetIds.includes(collectionId)) {
      await removeProductFromCollection(collectionId, productId);
    }
  }
}

async function persistShopifyFields(supabase, product, summary) {
  const now = new Date().toISOString();
  const payload = {
    shopify_product_id: summary.productId,
    shopify_variant_id: summary.variantId,
    shopify_inventory_item_id: summary.inventoryItemId,
    shopify_url: summary.url,
    shopify_synced_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", product.id)
    .select(
      "*, category:shopify_categories(id, name, parent_id, ana_kategori, alt_kategori, shopify_collection_id, path_key)",
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function syncProductToShopify(supabase, product, options = {}) {
  if (!product?.id) {
    throw new Error("Ürün bulunamadı");
  }

  const fxRates = options.fxRates || (await getFxRates());
  const settings = options.settings || (await loadPricingSettings(supabase));
  const categoryMap = options.categoryMap || (await loadCategoryMap(supabase));
  const { locationId } = await getShopifyShopContext();
  const built = buildShopifyProductInput(product, {
    fxRates,
    settings,
    locationId,
  });
  const isActive = product.is_active !== false;
  const sku = built.sku;

  let existing = null;
  if (product.shopify_product_id) {
    existing = await getShopifyProduct(product.shopify_product_id);
  }
  if (!existing) {
    existing = await findShopifyProductBySku(sku);
  }

  if (!isActive && !existing) {
    syncLog("shopify", "pasif ürün atlandı", { smk_code: sku });
    return {
      action: "skipped",
      product,
      shopifyProductId: null,
      shopifyUrl: null,
    };
  }

  let shopifyProduct = existing;
  let action = "updated";

  if (!shopifyProduct) {
    try {
      shopifyProduct = await createShopifyProduct(built.input);
    } catch (error) {
      if (!built.input.files?.length) throw error;
      const { files: _files, ...inputWithoutFiles } = built.input;
      syncLog("shopify", "görselsiz yeniden denendi", {
        smk_code: sku,
        error: error.message,
      });
      shopifyProduct = await createShopifyProduct(inputWithoutFiles);
    }
    action = "created";
    try {
      await publishShopifyProduct(shopifyProduct.id);
    } catch (error) {
      syncLog("shopify", "yayın atlandı", {
        smk_code: sku,
        error: error.message,
      });
    }
  } else {
    shopifyProduct = await updateShopifyProduct(shopifyProduct.id, {
      title: built.input.title,
      descriptionHtml: built.input.descriptionHtml,
      vendor: built.input.vendor,
      status: built.status,
      productType: built.input.productType,
      tags: built.input.tags,
      handle: built.handle,
    });

    const variantSummary = summarizeShopifyProduct(shopifyProduct);
    if (variantSummary.variantId) {
      await updateShopifyVariant(shopifyProduct.id, {
        id: variantSummary.variantId,
        price: built.price,
        sku,
        barcode: product.material_code || null,
      });
    }
    if (isActive) {
      try {
        await publishShopifyProduct(shopifyProduct.id);
      } catch (error) {
        syncLog("shopify", "yayın atlandı", {
          smk_code: sku,
          error: error.message,
        });
      }
    }
  }

  const latest = await getShopifyProduct(shopifyProduct.id);
  const summary = summarizeShopifyProduct(latest || shopifyProduct);
  if (summary.inventoryItemId) {
    await setShopifyInventoryQuantity(summary.inventoryItemId, built.quantity);
  }
  const targetIds = targetCollectionIds(product, categoryMap);
  const managedIds = managedCollectionIds(categoryMap);

  if (summary.productId) {
    await syncCollections({
      productId: summary.productId,
      currentIds: summary.collectionIds,
      targetIds,
      managedIds,
    });
  }

  const updated = await persistShopifyFields(supabase, product, summary);
  syncLog("shopify", action, {
    smk_code: sku,
    shopify_product_id: summary.productId,
    collections: targetIds.length,
  });

  return {
    action,
    product: updated,
    shopifyProductId: summary.productId,
    shopifyUrl: summary.url,
  };
}

export async function loadShopifySyncContext(supabase) {
  const [fxRates, settings, categoryMap] = await Promise.all([
    getFxRates(),
    loadPricingSettings(supabase),
    loadCategoryMap(supabase),
  ]);

  return { fxRates, settings, categoryMap };
}
