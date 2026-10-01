import { v4 as uuidv4 } from 'uuid';

export function generateId() {
  return uuidv4();
}

export function nowIso() {
  return new Date().toISOString();
}

export function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function toJson(value) {
  return JSON.stringify(value ?? null);
}
