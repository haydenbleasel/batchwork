import type { BatchStore, TrackedBatch } from "./types";

/** An in-memory `BatchStore`. Suitable for development and single-process use. */
export const createMemoryStore = (): BatchStore => {
  const records = new Map<string, TrackedBatch>();

  return {
    delete: (id) => {
      records.delete(id);
      return Promise.resolve();
    },
    get: (id) => Promise.resolve(records.get(id) ?? null),
    list: (filter) => {
      const all = [...records.values()];
      if (filter?.delivered === undefined) {
        return Promise.resolve(all);
      }
      const { delivered } = filter;
      return Promise.resolve(
        all.filter((record) => (record.deliveredAt !== undefined) === delivered)
      );
    },
    set: (record) => {
      records.set(record.id, record);
      return Promise.resolve();
    },
  };
};
