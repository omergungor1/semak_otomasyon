const FX_URL = "https://open.er-api.com/v6/latest/USD";

export async function getFxRates() {
  const response = await fetch(FX_URL, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Kur servisi yanıt vermedi (${response.status})`);
  }

  const data = await response.json();

  if (data.result !== "success" || !data.rates?.TRY) {
    throw new Error("Kur verisi okunamadı");
  }

  return {
    base: data.base_code || "USD",
    rates: data.rates,
    updatedAt: data.time_last_update_utc || null,
    provider: "https://www.exchangerate-api.com",
  };
}

export function convertToTry(amount, currency, rates) {
  if (amount === null || amount === undefined || amount === "") return null;

  const value = Number(amount);
  if (!Number.isFinite(value)) return null;

  const code = String(currency || "TRY").trim().toUpperCase();
  if (!code || code === "TRY") return value;

  if (!rates || !rates.TRY) return null;

  if (code === "USD") {
    return value * rates.TRY;
  }

  const fromRate = rates[code];
  if (!fromRate || !Number.isFinite(Number(fromRate))) return null;

  // USD bazlı çapraz kur: 1 CODE = (rates.TRY / rates.CODE) TRY
  return value * (rates.TRY / Number(fromRate));
}

export function formatMoney(amount, currency = "TRY") {
  if (amount === null || amount === undefined || amount === "") return "—";

  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";

  const code = String(currency || "TRY").trim().toUpperCase() || "TRY";

  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${code}`;
  }
}
