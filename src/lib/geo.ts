/** Shared between server and client: country flags and names. Hetzner gives the country code directly. */

/** "DE" → 🇩🇪 */
export function flagEmoji(country: string): string {
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export function countryName(country: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(country.toUpperCase()) ?? country
  } catch {
    return country
  }
}
