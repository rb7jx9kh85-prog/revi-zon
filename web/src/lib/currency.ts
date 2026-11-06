import { headers } from "next/headers";
import type { Currency } from "./pricing";

// Devise selon le pays du visiteur (fourni par Vercel) : CHF en Suisse et au Liechtenstein, EUR ailleurs.
export async function visitorCurrency(): Promise<Currency> {
  const country = (await headers()).get("x-vercel-ip-country")?.toUpperCase();
  return country === "CH" || country === "LI" ? "chf" : "eur";
}
