import crypto from "crypto";

function stableSerialize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(
          (value as Record<string, unknown>)[key],
        );

        return acc;
      }, {});
  }

  return value;
}

export function sha256(input: string): string {
  return crypto
    .createHash("sha256")
    .update(input, "utf8")
    .digest("hex");
}

export function computeCanonicalHash(
  value: unknown,
): string {
  return sha256(stableSerialize(value));
}
