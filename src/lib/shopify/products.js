import {
  getShopifyShopContext,
  getShopifyShopDomain,
  shopifyGraphql,
  throwIfUserErrors,
} from "@/lib/shopify/client";

const PRODUCT_FIELDS = `
  id
  handle
  status
  onlineStoreUrl
  variants(first: 5) {
    nodes {
      id
      sku
      price
      inventoryItem { id tracked }
    }
  }
  collections(first: 50) {
    nodes { id }
  }
`;

function firstVariant(product) {
  return product?.variants?.nodes?.[0] || null;
}

export function shopifyStorefrontUrl(handle) {
  if (!handle) return null;
  return `https://${getShopifyShopDomain()}/products/${handle}`;
}

export function shopifyProductUrl(product) {
  return product?.onlineStoreUrl || shopifyStorefrontUrl(product?.handle);
}

export async function getShopifyProduct(id) {
  const data = await shopifyGraphql(
    `query ShopifyProduct($id: ID!) {
      product(id: $id) { ${PRODUCT_FIELDS} }
    }`,
    { id },
  );
  return data?.product || null;
}

export async function findShopifyProductBySku(sku) {
  const query = `sku:${JSON.stringify(String(sku))}`;
  const data = await shopifyGraphql(
    `query ShopifyProductBySku($query: String!) {
      products(first: 5, query: $query) {
        nodes { ${PRODUCT_FIELDS} }
      }
    }`,
    { query },
  );

  const nodes = data?.products?.nodes || [];
  return (
    nodes.find((product) =>
      (product.variants?.nodes || []).some((variant) => variant.sku === sku),
    ) ||
    nodes[0] ||
    null
  );
}

export async function createShopifyProduct(input) {
  const data = await shopifyGraphql(
    `mutation ShopifyProductSet($input: ProductSetInput!, $synchronous: Boolean!) {
      productSet(synchronous: $synchronous, input: $input) {
        product { ${PRODUCT_FIELDS} }
        userErrors { field message }
      }
    }`,
    { input, synchronous: true },
  );

  throwIfUserErrors(data?.productSet?.userErrors, "Shopify ürünü oluşturulamadı");
  const product = data?.productSet?.product;
  if (!product?.id) {
    throw new Error("Shopify ürün ID dönmedi");
  }
  return product;
}

export async function updateShopifyProduct(id, { title, descriptionHtml, vendor, status, productType, tags, handle }) {
  const data = await shopifyGraphql(
    `mutation ShopifyProductUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { ${PRODUCT_FIELDS} }
        userErrors { field message }
      }
    }`,
    {
      input: {
        id,
        title,
        descriptionHtml,
        vendor,
        status,
        productType,
        tags,
        handle,
      },
    },
  );

  throwIfUserErrors(data?.productUpdate?.userErrors, "Shopify ürünü güncellenemedi");
  return data?.productUpdate?.product;
}

export async function updateShopifyVariant(productId, variant) {
  const data = await shopifyGraphql(
    `mutation ShopifyVariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id sku price inventoryItem { id tracked } }
        userErrors { field message }
      }
    }`,
    {
      productId,
      variants: [
        {
          id: variant.id,
          price: variant.price,
          barcode: variant.barcode || undefined,
          inventoryItem: {
            sku: variant.sku,
            tracked: true,
          },
        },
      ],
    },
  );

  throwIfUserErrors(
    data?.productVariantsBulkUpdate?.userErrors,
    "Shopify varyantı güncellenemedi",
  );
  return data?.productVariantsBulkUpdate?.productVariants?.[0] || null;
}

export async function setShopifyInventoryQuantity(inventoryItemId, quantity) {
  const { locationId } = await getShopifyShopContext();
  const input = {
    name: "available",
    reason: "correction",
    ignoreCompareQuantity: true,
    quantities: [
      {
        inventoryItemId,
        locationId,
        quantity,
      },
    ],
  };

  try {
    const data = await shopifyGraphql(
      `mutation ShopifyInventorySet($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors { field message }
        }
      }`,
      { input },
    );
    throwIfUserErrors(
      data?.inventorySetQuantities?.userErrors,
      "Shopify stok güncellenemedi",
    );
  } catch (error) {
    if (!String(error.message || "").includes("ignoreCompareQuantity")) {
      throw error;
    }

    const { ignoreCompareQuantity: _ignored, ...legacyInput } = input;
    const data = await shopifyGraphql(
      `mutation ShopifyInventorySet($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors { field message }
        }
      }`,
      { input: legacyInput },
    );
    throwIfUserErrors(
      data?.inventorySetQuantities?.userErrors,
      "Shopify stok güncellenemedi",
    );
  }
}

export async function publishShopifyProduct(productId) {
  const { publicationIds } = await getShopifyShopContext();
  if (!publicationIds.length) return;

  const data = await shopifyGraphql(
    `mutation ShopifyPublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    {
      id: productId,
      input: publicationIds.map((publicationId) => ({ publicationId })),
    },
  );

  throwIfUserErrors(
    data?.publishablePublish?.userErrors,
    "Shopify yayını başarısız",
  );
}

export async function addProductToCollection(collectionId, productId) {
  const data = await shopifyGraphql(
    `mutation ShopifyCollectionAdd($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        userErrors { field message }
      }
    }`,
    { id: collectionId, productIds: [productId] },
  );

  throwIfUserErrors(
    data?.collectionAddProducts?.userErrors,
    "Shopify koleksiyonuna eklenemedi",
  );
}

export async function removeProductFromCollection(collectionId, productId) {
  const data = await shopifyGraphql(
    `mutation ShopifyCollectionRemove($id: ID!, $productIds: [ID!]!) {
      collectionRemoveProducts(id: $id, productIds: $productIds) {
        userErrors { field message }
      }
    }`,
    { id: collectionId, productIds: [productId] },
  );

  throwIfUserErrors(
    data?.collectionRemoveProducts?.userErrors,
    "Shopify koleksiyonundan çıkarılamadı",
  );
}

export function summarizeShopifyProduct(product) {
  const variant = firstVariant(product);
  return {
    product,
    productId: product?.id || null,
    variantId: variant?.id || null,
    inventoryItemId: variant?.inventoryItem?.id || null,
    handle: product?.handle || null,
    url: shopifyProductUrl(product),
    collectionIds: (product?.collections?.nodes || []).map((item) => item.id),
  };
}
