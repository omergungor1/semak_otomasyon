import { getFxRates } from "@/lib/fx/convert";
import { DEFAULT_PRICING_SETTINGS } from "@/lib/pricing/calculate";
import {
  ShopierApiError,
  createShopierProduct,
  shopierRequest,
  updateShopierProduct,
} from "@/lib/shopier/client";
import { buildShopierPayload } from "@/lib/shopier/payload";

async function loadPricingSettings(supabase) {
  const { data } = await supabase
    .from("pricing_settings")
    .select("*")
    .eq("id", DEFAULT_PRICING_SETTINGS.id)
    .limit(1)
    .maybeSingle();

  return data || DEFAULT_PRICING_SETTINGS;
}

async function deleteShopierProduct(shopierProductId) {
  try {
    await shopierRequest(`/products/${shopierProductId}`, {
      method: "DELETE",
    });
    return true;
  } catch (error) {
    if (error instanceof ShopierApiError && (error.status === 404 || error.status === 403)) {
      return false;
    }
    throw error;
  }
}

export async function syncProductToShopier(supabase, product, options = {}) {
  if (!product?.id) {
    throw new Error("Ürün bulunamadı");
  }

  const fxRates = options.fxRates || (await getFxRates());
  const settings = options.settings || (await loadPricingSettings(supabase));
  const createPayload = buildShopierPayload(product, { fxRates, settings });
  const updatePayload = buildShopierPayload(product, {
    fxRates,
    settings,
    forUpdate: true,
  });

  let shopierProduct = null;
  let action = "created";

  if (product.shopier_product_id) {
    try {
      shopierProduct = await updateShopierProduct(
        product.shopier_product_id,
        updatePayload,
      );
      action = "updated";
    } catch (error) {
      const canRecreate =
        error instanceof ShopierApiError &&
        (error.status === 404 || error.status === 403);

      if (!canRecreate) {
        throw error;
      }

      await deleteShopierProduct(product.shopier_product_id);
      shopierProduct = await createShopierProduct(createPayload);
      action = "recreated";
    }
  } else {
    shopierProduct = await createShopierProduct(createPayload);
    action = "created";
  }

  const now = new Date().toISOString();
  const shopierProductId = String(
    shopierProduct?.id || product.shopier_product_id || "",
  );
  const shopierUrl = shopierProduct?.url || product.shopier_url || null;

  if (!shopierProductId) {
    throw new Error("Shopier ürün ID dönmedi");
  }

  const { data: updated, error } = await supabase
    .from("products")
    .update({
      shopier_product_id: shopierProductId,
      shopier_url: shopierUrl,
      shopier_synced_at: now,
      updated_at: now,
    })
    .eq("id", product.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    action,
    product: updated,
    shopierProductId,
    shopierUrl,
  };
}
