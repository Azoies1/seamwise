import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Assessment } from "./types.js";

/** Keeps assessments in memory and mirrors them to one JSON file. Photos are never stored. */
export class Store {
  private items = new Map<string, Assessment>();

  constructor(private file: string | null) {
    if (!file) return;
    try {
      for (const a of JSON.parse(readFileSync(file, "utf8")) as Assessment[]) this.items.set(a.id, a);
    } catch {
      // first run: no file yet
    }
  }

  save(a: Assessment): void {
    this.items.set(a.id, a);
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify([...this.items.values()], null, 1));
  }

  get(id: string): Assessment | undefined {
    return this.items.get(id);
  }

  all(): Assessment[] {
    return [...this.items.values()];
  }
}
