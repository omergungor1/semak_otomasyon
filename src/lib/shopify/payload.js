import {
  buildShopierDescription,
  resolveProductSaleAmount,
} from "@/lib/shopier/payload";

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp)(\?.*)?$/i;

export const SHOPIFY_ACTIVE_STOCK = 100;
export const SHOPIFY_INACTIVE_STOCK = 0;

export function formatShopifyPrice(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return null;
  return value.toFixed(2);
}

export function normalizeShopifyImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (!IMAGE_EXT_RE.test(trimmed)) return null;
  return trimmed;
}

export function shopifyProductHandle(smkCode) {
  const code = String(smkCode || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return code ? `smk-${code}` : null;
}

export function buildShopifyDescription(product) {
  return buildShopierDescription(product) || "";
}

export function resolveShopifyStock(product) {
  return product?.is_active === false
    ? SHOPIFY_INACTIVE_STOCK
    : SHOPIFY_ACTIVE_STOCK;
}

export function resolveShopifyStatus(product) {
  return product?.is_active === false ? "DRAFT" : "ACTIVE";
}

export function buildShopifyProductInput(product, { fxRates, settings, locationId }) {
  const title = String(product.name || "").trim();
  if (!title) {
    throw new Error("Ürün adı zorunlu");
  }

  const saleAmount = resolveProductSaleAmount(product, { fxRates, settings });
  const price = formatShopifyPrice(saleAmount);
  if (!price) {
    throw new Error("Satış fiyatı hesaplanamadı");
  }

  const sku = String(product.smk_code || "").trim();
  if (!sku) {
    throw new Error("SMK kodu zorunlu");
  }

  const imageUrl = normalizeShopifyImageUrl(product.image_url);
  const status = resolveShopifyStatus(product);
  const quantity = resolveShopifyStock(product);
  const handle = shopifyProductHandle(sku);
  const descriptionHtml = buildShopifyDescription(product);
  const tags = [product.brand, sku ? `SMK:${sku}` : null].filter(Boolean);
  const variant = {
    optionValues: [{ optionName: "Title", name: "Default Title" }],
    price,
    sku,
    inventoryItem: {
      sku,
      tracked: true,
    },
    inventoryQuantities: locationId
      ? [{ locationId, name: "available", quantity }]
      : [],
  };

  if (product.material_code) {
    variant.barcode = String(product.material_code).slice(0, 255);
  }

  const input = {
    title: title.slice(0, 255),
    handle,
    status,
    vendor: product.brand || "Semak",
    descriptionHtml,
    tags,
    productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
    variants: [variant],
  };

  if (product.category?.ana_kategori) {
    input.productType = product.category.ana_kategori;
  }

  if (imageUrl) {
    input.files = [
      {
        originalSource: imageUrl,
        alt: title,
        contentType: "IMAGE",
      },
    ];
  }

  return { input, price, sku, handle, status, quantity, imageUrl };
}
