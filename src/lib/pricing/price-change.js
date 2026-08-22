export function toPriceNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function pricesEqual(a, b) {
  const left = toPriceNumber(a);
  const right = toPriceNumber(b);
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  return Math.round(left * 100) === Math.round(right * 100);
}

export function buildPriceUpdateFields(product, offer, now) {
  const nextPrice = toPriceNumber(offer?.price);
  const fields = {
    currency: offer?.currency || "TRY",
    price_synced_at: now,
  };

  if (nextPrice === null) return fields;

  fields.price = nextPrice;

  if (!pricesEqual(product?.price, nextPrice)) {
    fields.previous_price = toPriceNumber(product?.price);
    fields.price_changed_at = now;
  }

  return fields;
}

export function didPriceChange(product, offer) {
  const nextPrice = toPriceNumber(offer?.price);
  if (nextPrice === null) return false;
  return !pricesEqual(product?.price, nextPrice);
}
