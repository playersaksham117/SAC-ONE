/** Brand ids used when an external webstore authenticates with the ERP API key. */
export type StoreBrandId = "sacone" | "sacvolt";

export const STORE_BRANDS: Record<
  StoreBrandId,
  {
    id: StoreBrandId;
    name: string;
    shortName: string;
    defaultPort: number;
    defaultUrl: string;
    tagline: string;
    accent: string;
  }
> = {
  sacone: {
    id: "sacone",
    name: "External webstore",
    shortName: "SACONE",
    defaultPort: 0,
    defaultUrl: "",
    tagline: "Catalog via ERP inventory API",
    accent: "orange",
  },
  sacvolt: {
    id: "sacvolt",
    name: "External webstore",
    shortName: "TRY SAC VOLT",
    defaultPort: 0,
    defaultUrl: "",
    tagline: "Catalog via ERP inventory API",
    accent: "violet",
  },
};

export function parseStoreBrand(value: string | null | undefined): StoreBrandId {
  const v = (value || "").trim().toLowerCase();
  if (v === "sacone") return "sacone";
  return "sacvolt";
}
