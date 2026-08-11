import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopierApiKey } from "@/lib/shopier/client";
import { syncProductToShopier } from "@/lib/shopier/sync";

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return { supabase: null, unauthorized: true };
  }

  return { supabase, unauthorized: false };
}

export async function POST(_request, { params }) {
  const { supabase, unauthorized } = await requireUser();
  if (unauthorized) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    getShopierApiKey();
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Ürün ID gerekli" }, { status: 400 });
  }

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
  }

  try {
    const result = await syncProductToShopier(supabase, product);
    return NextResponse.json({
      ok: true,
      action: result.action,
      product: result.product,
      shopier_product_id: result.shopierProductId,
      shopier_url: result.shopierUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Shopier güncellemesi başarısız" },
      { status: 500 },
    );
  }
}
