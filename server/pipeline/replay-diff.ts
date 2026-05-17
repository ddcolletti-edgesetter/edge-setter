interface ReplayHashFields {
  integrity_hash?: string;
  timeline_hash?: string;
}

export interface ReplayDiffResult {
  identical: boolean;
  integrity_match: boolean;
  timeline_match: boolean;
  differences: ReplayDifference[];
}

export interface ReplayDifference {
  path: string;
  left: unknown;
  right: unknown;
}

export function diffReplayResponses(
  left: unknown,
  right: unknown,
): ReplayDiffResult {
  const differences: ReplayDifference[] = [];

  compareValues(left, right, "", differences);

  return {
    identical: differences.length === 0,
    integrity_match:
  (left as ReplayHashFields).integrity_hash ===
  (right as ReplayHashFields).integrity_hash,
timeline_match:
  (left as ReplayHashFields).timeline_hash ===
  (right as ReplayHashFields).timeline_hash,
    differences,
  };
}

function compareValues(
  left: unknown,
  right: unknown,
  path: string,
  differences: ReplayDifference[],
): void {
  if (typeof left !== typeof right) {
    differences.push({
      path,
      left,
      right,
    });

    return;
  }

  if (
    left === null ||
    right === null ||
    typeof left !== "object"
  ) {
    if (left !== right) {
      differences.push({
        path,
        left,
        right,
      });
    }

    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      differences.push({
        path: `${path}.length`,
        left: left.length,
        right: right.length,
      });
    }

    const max = Math.max(left.length, right.length);

    for (let i = 0; i < max; i++) {
      compareValues(
        left[i],
        right[i],
        `${path}[${i}]`,
        differences,
      );
    }

    return;
  }

  const leftObj = left as Record<string, unknown>;
  const rightObj = right as Record<string, unknown>;

  const keys = new Set([
    ...Object.keys(leftObj),
    ...Object.keys(rightObj),
  ]);

  for (const key of Array.from(keys).sort()) {
    if (key === "generated_at") {
      continue;
    }

    compareValues(
      leftObj[key],
      rightObj[key],
      path ? `${path}.${key}` : key,
      differences,
    );
  }
}