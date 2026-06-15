import { BatchworkError } from "../errors";

const SIMPLE_PROVIDER_ID = /^[A-Za-z0-9_-]+$/u;

export const assertSimpleProviderId = (label: string, id: string): string => {
  if (!SIMPLE_PROVIDER_ID.test(id)) {
    throw new BatchworkError(`batchwork: invalid ${label}.`);
  }
  return id;
};
