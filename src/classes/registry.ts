// ============================================================ class registry
import type { ClassDef } from '../types';

/** Registered classes by id. See `ClassDef` in types.ts for the hook contract. */
export const CLASSES: Record<string, ClassDef> = {};
/** Class ids in menu order (registration order, set by classes/index.ts). */
export const CLASS_ORDER: string[] = [];

export function registerClass(def: ClassDef): ClassDef {
  CLASSES[def.id] = def;
  CLASS_ORDER.push(def.id);
  return def;
}
