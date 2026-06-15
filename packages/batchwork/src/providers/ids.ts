import { BatchworkError } from "../errors";

const SIMPLE_PROVIDER_ID = /^[A-Za-z0-9_-]+$/u;

export const assertSimpleProviderId = (label: string, id: string): string => {
  if (!SIMPLE_PROVIDER_ID.test(id)) {
    throw new BatchworkError(`batchwork: invalid ${label}.`);
  }
  return id;
};

export const assertPrefixedProviderId = (
  label: string,
  id: string,
  prefix: string
): string => {
  const [actualPrefix, value, ...rest] = id.split("/");
  if (
    rest.length > 0 ||
    actualPrefix !== prefix ||
    !value ||
    !SIMPLE_PROVIDER_ID.test(value)
  ) {
    throw new BatchworkError(`batchwork: invalid ${label}.`);
  }
  return id;
};
