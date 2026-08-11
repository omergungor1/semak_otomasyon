import { convertToTry } from "@/lib/fx/convert";
import {
  DEFAULT_PRICING_SETTINGS,
  resolveSalePrice,
} from "@/lib/pricing/calculate";

const IMAGE_EXT_RE = /\.(jpe?g|png|bmp)(\?.*)?$/i;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPriceString(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return null;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function normalizeImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (!IMAGE_EXT_RE.test(trimmed)) return null;
  return trimmed;
}

export function buildShopierDescription(product) {
  const parts = [];

  if (product.smk_code) {
    parts.push(`<p><strong>SMK:</strong> ${escapeHtml(product.smk_code)}</p>`);
  }
  if (product.material_code) {
    parts.push(
      `<p><strong>Malzeme kodu:</strong> ${escapeHtml(product.material_code)}</p>`,
    );
  }
  if (product.brand) {
    parts.push(`<p><strong>Marka:</strong> ${escapeHtml(product.brand)}</p>`);
  }

  const description = product.description?.trim();
  if (description) {
    const looksHtml = /<\/?[a-z][\s\S]*>/i.test(description);
    parts.push(
      looksHtml ? description : `<p>${escapeHtml(description)}</p>`,
    );
  }

  const specs = Array.isArray(product.specifications)
    ? product.specifications
    : [];

  if (specs.length) {
    const rows = specs
      .map((spec) => {
        const label = escapeHtml(spec?.label || spec?.name || spec?.key || "");
        const value = escapeHtml(spec?.value || "");
        if (!label && !value) return "";
        return `<tr><th style="text-align:left;padding:4px 8px;">${label}</th><td style="padding:4px 8px;">${value}</td></tr>`;
      })
      .filter(Boolean)
      .join("");

    if (rows) {
      parts.push(
        `<h3>Teknik özellikler</h3><table>${rows}</table>`,
      );
    }
  }

  return parts.join("\n") || undefined;
}

export function resolveProductSaleAmount(product, { fxRates, settings } = {}) {
  const rates = fxRates?.rates || fxRates;
  const tryCost = convertToTry(product.price, product.currency, rates);
  const sale = resolveSalePrice({
    tryCost,
    manualSalePrice: product.manual_sale_price,
    settings: settings || DEFAULT_PRICING_SETTINGS,
  });
  return sale.amount;
}

export function buildShopierPayload(product, { fxRates, settings, forUpdate = false } = {}) {
  const title = String(product.name || "").trim();
  if (!title) {
    throw new Error("Ürün adı zorunlu");
  }

  const imageUrl = normalizeImageUrl(product.image_url);
  if (!imageUrl) {
    throw new Error(
      "Shopier için geçerli bir ürün görseli gerekli (jpg/png/bmp URL)",
    );
  }

  const saleAmount = resolveProductSaleAmount(product, { fxRates, settings });
  const price = formatPriceString(saleAmount);
  if (!price) {
    throw new Error("Satış fiyatı hesaplanamadı");
  }

  const isActive = product.is_active !== false;
  const shippingPayer =
    process.env.SHOPIER_SHIPPING_PAYER === "sellerPays"
      ? "sellerPays"
      : "buyerPays";

  const payload = {
    title: title.slice(0, 200),
    type: "physical",
    media: [
      {
        type: "image",
        url: imageUrl,
        placement: 1,
      },
    ],
    priceData: forUpdate
      ? { price }
      : {
          currency: "TRY",
          price,
        },
    shippingPayer,
    stockQuantity: isActive ? 100 : 0,
    dispatchDuration: 3,
  };

  const description = buildShopierDescription(product);
  if (description) {
    payload.description = description;
  }

  return payload;
}
