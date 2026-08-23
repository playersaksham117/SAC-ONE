export type Category =
  | "refrigeration-spares"
  | "washing-machine-spares"
  | "electrical-spares"
  | "led-lighting"
  | "wires-cables"
  | "mcbs-switchgears"
  | "industrial-equipment";

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: Category;
  price: number;
  mrp?: number;
  sku: string;
  availability: "in-stock" | "low-stock" | "out-of-stock";
  stockCount: number;
  image: string;
  images: string[];
  description: string;
  specifications: Record<string, string>;
  rating: number;
  reviewCount: number;
  featured?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface QuoteItem {
  product: Product;
  quantity: number;
}

export interface Order {
  id: string;
  date: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  total: number;
  items: number;
}

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

export interface FilterState {
  categories: Category[];
  brands: string[];
  availability: string[];
  priceRange: [number, number];
  sortBy: "featured" | "price-asc" | "price-desc" | "name" | "rating";
}

export interface ContactForm {
  name: string;
  email: string;
  phone: string;
  company: string;
  subject: string;
  message: string;
}
