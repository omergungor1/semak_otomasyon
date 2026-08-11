const SHOPIER_API_BASE = "https://api.shopier.com/v1";

export class ShopierApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "ShopierApiError";
    this.status = status;
    this.body = body;
  }
}

export function getShopierApiKey() {
  const key = process.env.SHOPIER_API_KEY?.trim();
  if (!key) {
    throw new Error("SHOPIER_API_KEY tanımlı değil");
  }
  return key;
}

export async function shopierRequest(path, { method = "GET", body } = {}) {
  const key = getShopierApiKey();
  const response = await fetch(`${SHOPIER_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Shopier API hatası (${response.status})`;
    throw new ShopierApiError(message, { status: response.status, body: data });
  }

  return data;
}

export function createShopierProduct(payload) {
  return shopierRequest("/products", { method: "POST", body: payload });
}

export function updateShopierProduct(shopierProductId, payload) {
  return shopierRequest(`/products/${shopierProductId}`, {
    method: "PUT",
    body: payload,
  });
}
