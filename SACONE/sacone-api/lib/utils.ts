import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function getAvailabilityLabel(
  availability: "in-stock" | "low-stock" | "out-of-stock"
): { label: string; color: string } {
  switch (availability) {
    case "in-stock":
      return { label: "In Stock", color: "text-success bg-success/10" };
    case "low-stock":
      return { label: "Low Stock", color: "text-warning bg-warning/10" };
    case "out-of-stock":
      return { label: "Out of Stock", color: "text-danger bg-danger/10" };
  }
}
