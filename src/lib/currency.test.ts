import { describe, expect, it } from "vitest"
import { convertUsdText, DEFAULT_CURRENCY, formatMoney, normalizeCurrency } from "@/lib/currency"

const TRY = { code: "TRY" as const, rate: 40 }

describe("currency", () => {
  it("keeps dollars exactly as before", () => {
    expect(formatMoney(12.5, DEFAULT_CURRENCY, "tr")).toBe("$12.50")
    expect(convertUsdText("$3.21 · 1.2M tokens", DEFAULT_CURRENCY, "tr")).toBe("$3.21 · 1.2M tokens")
  })

  it("converts dollar amounts at the entered rate, in the language's format", () => {
    expect(formatMoney(2.5, { code: "EUR", rate: 0.9 }, "en")).toBe("€2.25")
    // Intl puts a no-break space between the code and the amount.
    expect(convertUsdText("$1,250.50 spent of $2000", TRY, "en").replace(/ /g, " ")).toBe(
      "TRY 50,020.00 spent of TRY 80,000.00"
    )
    expect(convertUsdText("12 credits left", TRY, "en")).toBe("12 credits left")
  })

  it("falls back to dollars, or a rate of 1, when the stored value is broken", () => {
    expect(normalizeCurrency({ code: "XYZ", rate: 3 })).toEqual(DEFAULT_CURRENCY)
    expect(normalizeCurrency({ code: "USD", rate: 3 })).toEqual(DEFAULT_CURRENCY)
    expect(normalizeCurrency({ code: "TRY", rate: -2 })).toEqual({ code: "TRY", rate: 1 })
    expect(normalizeCurrency({ code: "TRY", rate: 41.5 })).toEqual({ code: "TRY", rate: 41.5 })
    expect(normalizeCurrency(undefined)).toEqual(DEFAULT_CURRENCY)
  })
})
