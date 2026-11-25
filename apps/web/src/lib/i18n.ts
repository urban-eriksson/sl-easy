/** All copy. Swedish only. */
export const t = {
  brand: "SL Eazy",
  nav: {
    back: "Tillbaka",
    pickStation: "Byt hållplats",
    locate: "Hållplatser nära dig",
    close: "Stäng",
  },
  welcome: {
    title: "Var åker du ifrån?",
    body: "Se nästa avgång från hållplatsen där du står.",
    pick: "Välj hållplats",
  },
  picker: {
    placeholder: "Sök hållplats",
    nearby: "Nära dig",
    recent: "Senaste",
    locating: "Hittar din position …",
    noHits: "Ingen hållplats med det namnet",
    loading: "Läser in hållplatser …",
    failed: "Kunde inte läsa in hållplatserna.",
  },
  location: {
    denied: "Platsåtkomst nekad. Tillåt plats för sidan i webbläsarens inställningar.",
    failed: "Kunde inte hitta din position.",
    unsupported: "Webbläsaren kan inte ge någon position.",
  },
  list: {
    loading: "Hämtar avgångar …",
    empty: "Inga avgångar de närmaste 20 timmarna",
    failed: "Kunde inte hämta avgångarna.",
    busy: "SL:s tjänst svarar inte just nu. Försök igen om en stund.",
    retry: "Försök igen",
    stale: "Visar senast hämtade avgångar",
    now: "Nu",
    cancelled: "Inställd",
    platform: (p: string) => `Läge ${p}`,
    loadingLater: "Hämtar avgångar …",
    noMoreLater: "Inga fler avgångar hittades",
    noDirect: (name: string) => `Inga direkta avgångar till ${name}`,
    /** The departures API gives three per line and direction; say so. */
    scope:
      "Listan visar de tre närmaste avgångarna per linje och riktning. Tryck på en avgång och välj en hållplats för att se alla avgångar dit.",
  },
  towards: {
    label: (name: string) => `Till ${name}`,
    clear: "Visa alla avgångar",
    go: (name: string) => `Avgångar från ${name}`,
  },
  alerts: {
    summary: (n: number) => (n === 1 ? "1 trafikmeddelande" : `${n} trafikmeddelanden`),
  },
  sheet: {
    towards: (destination: string) => `mot ${destination}`,
    departs: (time: string) => `Avgår ${time}`,
    stops: "Hållplatser",
    loading: "Hämtar hållplatser …",
    notFound: "Hållplatserna för den här avgången gick inte att hitta.",
    failed: "Kunde inte hämta hållplatserna.",
    approximate: "Tiderna är ungefärliga.",
    hint: "Tryck på en hållplats för att se alla sätt att åka dit härifrån. Pilen byter till den hållplatsen.",
    filterTo: (name: string) => `Visa avgångar härifrån till ${name}`,
    openStation: (name: string) => `Byt till ${name} och visa avgångar därifrån`,
    here: "Här",
  },
  footer: {
    data: "Data från",
    licence: "licens",
  },
};
