import { Category } from "@/types";

export interface CategoryInfo {
  id: Category;
  name: string;
  description: string;
  icon: string;
  subcategories: string[];
}

export const categories: CategoryInfo[] = [
  {
    id: "refrigeration-spares",
    name: "Refrigeration Spares",
    description: "Compressors, thermostats, gaskets & more",
    icon: "❄️",
    subcategories: ["Compressors", "Thermostats", "Evaporators", "Capillary Tubes", "Door Gaskets"],
  },
  {
    id: "washing-machine-spares",
    name: "Washing Machine Spares",
    description: "Motors, belts, pumps & control boards",
    icon: "🌀",
    subcategories: ["Motors", "Drain Pumps", "Belts", "Control Boards", "Shock Absorbers"],
  },
  {
    id: "electrical-spares",
    name: "Electrical Spares",
    description: "Relays, contactors, starters & accessories",
    icon: "⚡",
    subcategories: ["Relays", "Contactors", "Starters", "Timers", "Terminal Blocks"],
  },
  {
    id: "led-lighting",
    name: "LED Lighting",
    description: "Panels, bulbs, strips & fixtures",
    icon: "💡",
    subcategories: ["LED Panels", "Bulbs", "Strip Lights", "Downlights", "Street Lights"],
  },
  {
    id: "wires-cables",
    name: "Wires & Cables",
    description: "Copper wires, cables & connectors",
    icon: "🔌",
    subcategories: ["House Wire", "Industrial Cable", "Flexible Wire", "Armoured Cable", "Connectors"],
  },
  {
    id: "mcbs-switchgears",
    name: "MCBs & Switchgears",
    description: "Circuit breakers, switches & distribution boards",
    icon: "🔧",
    subcategories: ["MCBs", "RCCBs", "Distribution Boards", "Switchgear", "Isolators"],
  },
  {
    id: "industrial-equipment",
    name: "Industrial Electrical Equipment",
    description: "Heavy-duty motors, panels & automation",
    icon: "🏭",
    subcategories: ["Motors", "Control Panels", "VFD Drives", "Transformers", "Automation"],
  },
];

export const categoryMap = Object.fromEntries(
  categories.map((c) => [c.id, c])
) as Record<Category, CategoryInfo>;

export const brands = [
  "Havells",
  "Schneider",
  "Siemens",
  "ABB",
  "Legrand",
  "Anchor",
  "Crompton",
  "Philips",
  "Godrej",
  "LG",
  "Samsung",
  "Whirlpool",
];
