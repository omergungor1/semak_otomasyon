export const DEFAULT_PRICING_SETTINGS = {
  id: "00000000-0000-0000-0000-000000000001",
  discount_rate: 30,
  kdv_rate: 0,
  shipping_price: 0,
  multiplier: 1,
  extra_amount: 0,
  rounding_mode: "nearest_50",
};

export const ROUNDING_OPTIONS = [
  { value: "none", label: "Yuvarlama yok (2 ondalık)" },
  { value: "integer", label: "Tam sayıya yuvarla" },
  { value: "up", label: "Yukarı yuvarla (tam sayı)" },
  { value: "down", label: "Aşağı yuvarla (tam sayı)" },
  { value: "nearest_50", label: "50 ₺’ye yuvarla" },
  { value: "nearest_100", label: "100 ₺’ye yuvarla" },
  { value: "up_50", label: "50 ₺ yukarı" },
  { value: "down_50", label: "50 ₺ aşağı" },
  { value: "up_100", label: "100 ₺ yukarı" },
  { value: "down_100", label: "100 ₺ aşağı" },
];

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function applyRounding(amount, mode = "nearest_50") {
  const value = toNumber(amount, 0);

  switch (mode) {
    case "none":
      return Math.round(value * 100) / 100;
    case "integer":
      return Math.round(value);
    case "up":
      return Math.ceil(value);
    case "down":
      return Math.floor(value);
    case "nearest_50":
      return Math.round(value / 50) * 50;
    case "nearest_100":
      return Math.round(value / 100) * 100;
    case "up_50":
      return Math.ceil(value / 50) * 50;
    case "down_50":
      return Math.floor(value / 50) * 50;
    case "up_100":
      return Math.ceil(value / 100) * 100;
    case "down_100":
      return Math.floor(value / 100) * 100;
    default:
      return Math.round(value * 100) / 100;
  }
}

/**
 * Formül:
 * 1) TRY maliyeti
 * 2) İskonto: maliyet * (1 - iskonto/100)
 * 3) Çarpan: * multiplier
 * 4) + kargo + ek tutar
 * 5) KDV: * (1 + kdv/100)
 * 6) Yuvarlama
 */
export function calculateSalePrice(tryCost, settings = DEFAULT_PRICING_SETTINGS) {
  if (tryCost === null || tryCost === undefined || tryCost === "") return null;

  const cost = Number(tryCost);
  if (!Number.isFinite(cost)) return null;

  const discountRate = toNumber(settings.discount_rate, 30);
  const multiplier = toNumber(settings.multiplier, 1);
  const shipping = toNumber(settings.shipping_price, 0);
  const extra = toNumber(settings.extra_amount, 0);
  const kdvRate = toNumber(settings.kdv_rate, 0);

  const afterDiscount = cost * (1 - discountRate / 100);
  const afterMultiplier = afterDiscount * multiplier;
  const afterExtras = afterMultiplier + shipping + extra;
  const afterKdv = afterExtras * (1 + kdvRate / 100);

  return applyRounding(afterKdv, settings.rounding_mode || "nearest_50");
}

export function resolveSalePrice({
  tryCost,
  manualSalePrice,
  settings,
}) {
  if (
    manualSalePrice !== null &&
    manualSalePrice !== undefined &&
    manualSalePrice !== ""
  ) {
    const manual = Number(manualSalePrice);
    if (Number.isFinite(manual)) {
      return {
        amount: manual,
        source: "manual",
      };
    }
  }

  const calculated = calculateSalePrice(tryCost, settings);
  if (calculated === null) {
    return {
      amount: null,
      source: "none",
    };
  }

  return {
    amount: calculated,
    source: "calculated",
  };
}
