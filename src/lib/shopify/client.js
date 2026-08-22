const API_VERSION = "2025-01";

let tokenCache = {
  token: null,
  expiresAt: 0,
};

let collectionsCache = {
  items: null,
  at: 0,
};

const COLLECTIONS_CACHE_MS = 15_000;

export function getShopifyShopDomain() {
  const raw = (
    process.env.SHOPIFY_SHOP ||
    process.env.SHOPIFY_STORE ||
    ""
  ).trim();

  if (!raw) {
    throw new Error(
      "SHOPIFY_SHOP tanımlı değil. .env.local dosyasına mağaza adını ekleyin (örn. magaza veya magaza.myshopify.com).",
    );
  }

  const host = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (host.endsWith(".myshopify.com")) return host;
  if (host.includes(".")) return host;
  return `${host}.myshopify.com`;
}

function parseOauthCode(html) {
  const title = String(html || "").match(/<title>([^<]+)<\/title>/i)?.[1] || "";
  return title.match(/Oauth error\s+([a-z0-9_]+)/i)?.[1] || "";
}

function shopifyTokenErrorMessage(status, raw, data) {
  const code =
    data?.error ||
    parseOauthCode(raw) ||
    "";
  const description = data?.error_description || "";

  if (code === "app_not_installed") {
    return `Shopify uygulaması ${getShopifyShopDomain()} mağazasına yüklü değil. Dev Dashboard’dan uygulamayı bu mağazaya Install edin; Client ID/Secret tek başına yetmez.`;
  }
  if (code === "shop_not_permitted") {
    return "Client credentials bu mağazada kullanılamaz. Uygulama ve mağaza aynı Shopify organizasyonunda olmalı.";
  }
  if (code === "application_cannot_be_found") {
    return "Shopify Client ID bulunamadı. SHOPIFY_CLIENT_ID değerini Dev Dashboard’dan yeniden kopyalayın.";
  }

  return (
    description ||
    data?.error ||
    (code ? `Shopify OAuth hatası: ${code}` : null) ||
    `Shopify token alınamadı (${status})`
  );
}

async function requestAccessToken() {
  const staticToken = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (staticToken) return { access_token: staticToken, expires_in: 60 * 60 * 24 };

  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("SHOPIFY_CLIENT_ID veya SHOPIFY_CLIENT_SECRET tanımlı değil");
  }

  const shop = getShopifyShopDomain();
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  const raw = await response.text();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = {};
  }

  if (!response.ok || !data.access_token) {
    throw new Error(shopifyTokenErrorMessage(response.status, raw, data));
  }

  return data;
}

export async function getShopifyAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const data = await requestAccessToken();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 86399) * 1000,
  };
  return tokenCache.token;
}

export async function shopifyGraphql(query, variables = {}) {
  const shop = getShopifyShopDomain();
  const token = await getShopifyAccessToken();
  const response = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.errors?.[0]?.message ||
        `Shopify GraphQL hatası (${response.status})`,
    );
  }

  if (payload.errors?.length && payload.data == null) {
    throw new Error(payload.errors.map((item) => item.message).join("; "));
  }

  return payload.data;
}

export function throwIfUserErrors(userErrors, fallback) {
  if (!userErrors?.length) return;
  throw new Error(userErrors.map((item) => item.message).join("; ") || fallback);
}

let shopContextCache = {
  at: 0,
  locationId: null,
  publicationIds: [],
};

export async function getShopifyShopContext() {
  if (shopContextCache.locationId && Date.now() - shopContextCache.at < 10 * 60_000) {
    return shopContextCache;
  }

  const configured = process.env.SHOPIFY_LOCATION_ID?.trim();
  let locationId = configured || null;

  if (!locationId) {
    const locationData = await shopifyGraphql(
      `query ShopifyLocations {
        locations(first: 10) {
          nodes { id }
        }
      }`,
    );
    locationId = locationData?.locations?.nodes?.[0]?.id || null;
  }

  if (!locationId) {
    throw new Error("Shopify konum (location) bulunamadı");
  }

  let publicationIds = [];
  try {
    const publicationData = await shopifyGraphql(
      `query ShopifyPublications {
        publications(first: 20) {
          nodes { id }
        }
      }`,
    );
    publicationIds = (publicationData?.publications?.nodes || [])
      .map((item) => item.id)
      .filter(Boolean);
  } catch {
    publicationIds = [];
  }

  shopContextCache = {
    at: Date.now(),
    locationId,
    publicationIds,
  };

  return shopContextCache;
}

export function invalidateShopifyCollectionsCache() {
  collectionsCache = { items: null, at: 0 };
}

export async function listShopifyCollections({ fresh = false } = {}) {
  if (
    !fresh &&
    collectionsCache.items &&
    Date.now() - collectionsCache.at < COLLECTIONS_CACHE_MS
  ) {
    return collectionsCache.items;
  }

  const collections = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const data = await shopifyGraphql(
      `query Collections($first: Int!, $after: String) {
        collections(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id title handle updatedAt }
        }
      }`,
      { first: 100, after: cursor },
    );

    const page = data?.collections;
    collections.push(...(page?.nodes || []));
    hasNext = Boolean(page?.pageInfo?.hasNextPage);
    cursor = page?.pageInfo?.endCursor || null;
  }

  collectionsCache = { items: collections, at: Date.now() };
  return collections;
}

export async function createShopifyCollection(title) {
  const data = await shopifyGraphql(
    `mutation CollectionCreate($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id title handle updatedAt }
        userErrors { field message }
      }
    }`,
    { input: { title } },
  );

  const payload = data?.collectionCreate;
  const userErrors = payload?.userErrors || [];
  if (userErrors.length) {
    throw new Error(userErrors.map((item) => item.message).join("; "));
  }

  if (!payload?.collection?.id) {
    throw new Error("Shopify koleksiyonu oluşturulamadı");
  }

  invalidateShopifyCollectionsCache();
  return payload.collection;
}
