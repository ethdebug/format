import { Pointer } from "@ethdebug/format";
import type { Cursor } from "#cursor";
import { Data } from "#data";
import { evaluate, Value, type EvaluateOptions } from "#evaluate";

/**
 * Evaluate all Pointer.Expression-value properties on a given region
 *
 * Due to the availability of `~this` as a builtin allowable by the schema,
 * this function evaluates each property as part of a queue. If a property's
 * expression fails to evaluate due to a missing reference, the property is
 * added to the end of the queue.
 *
 * Circular dependencies are detected naïvely by counting evaluation attempts
 * for each property, since the maximum length of a chain of ~this references
 * within a single region is one less than the number of properties that
 * require evaluation). Exceeding this many attempts indicates circularity.
 */
export async function evaluateRegion<R extends Pointer.Region>(
  region: R,
  options: EvaluateOptions,
): Promise<Cursor.Region<R>> {
  const evaluatedProperties: {
    [K in keyof R]?: Data;
  } = {};
  const propertyAttempts: {
    [K in keyof R]?: number;
  } = {};

  const partialRegion: Cursor.Region<R> = new Proxy(
    { ...region } as Cursor.Region<R>,
    {
      get(_target, property) {
        if (property in evaluatedProperties) {
          return evaluatedProperties[property as keyof R];
        }
        throw new Error(
          `Property not evaluated yet: ~this.${property.toString()}`,
        );
      },
    },
  );

  const propertiesRequiringEvaluation = ["slot", "offset", "length"] as const;

  const expressionQueue: [keyof R, Pointer.Expression][] =
    propertiesRequiringEvaluation
      .filter((property) => property in region)
      .map((property) => [property, region[property as keyof R]]) as [
      keyof R,
      Pointer.Expression,
    ][];

  while (expressionQueue.length > 0) {
    const [property, expression] = expressionQueue.shift()!;

    try {
      const value = await evaluate(expression, {
        ...options,
        regions: {
          ...options.regions,
          "~this": partialRegion as Cursor.Region,
        },
      });

      evaluatedProperties[property as keyof R] = Value.toData(value);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Property not evaluated yet: ~this.")
      ) {
        const attempts = propertyAttempts[property] || 0;
        // fields may reference each other, but the chain of references
        // should not exceed the number of fields minus 1
        if (attempts > propertiesRequiringEvaluation.length - 1) {
          throw new Error(
            `Circular reference detected: ~this.${property.toString()}`,
          );
        }

        propertyAttempts[property] = attempts + 1;
        expressionQueue.push([property, expression]);
      } else {
        throw error;
      }
    }
  }

  if (Pointer.Region.isVirtual(region)) {
    const fragment = await evaluateFragment(
      region,
      evaluatedProperties,
      options,
    );
    return fragment as Cursor.Region<R>;
  }

  return {
    ...region,
    ...evaluatedProperties,
  } as Cursor.Region<R>;
}

/**
 * Evaluate a virtual region's `expression` to the bytes it addresses into,
 * and fill in the default `offset` and `length` so that later regions may
 * look them up
 */
async function evaluateFragment(
  region: Pointer.Region.Virtual,
  { offset, length }: { offset?: Data; length?: Data },
  options: EvaluateOptions,
): Promise<Cursor.Region<Pointer.Region.Virtual>> {
  const value = await evaluate(region.expression, options);
  if (Value.isInteger(value)) {
    throw new Error(
      [
        `Expression of virtual region (${JSON.stringify(region.expression)}) `,
        `evaluates to the integer ${value.value}, which has no byte `,
        `width; give it a width with ~wordsized or ~sizedN`,
      ].join(""),
    );
  }

  const width = BigInt(value.data.length);
  const start = offset?.asUint() ?? 0n;
  const end = length ? start + length.asUint() : width;
  if (start > width || end > width) {
    const fields = length ? `${start}, length ${length.asUint()}` : start;
    throw new Error(
      `Fragment of virtual region (offset ${fields}) extends outside ` +
        `the ${width} bytes of its expression's value`,
    );
  }

  return {
    ...region,
    expression: value.data,
    offset: Data.fromUint(start),
    length: Data.fromUint(end - start),
  };
}

/**
 * Detect a stack region and modify its `slot` expression to include the
 * appropriate sum or difference based on the machine stack length change
 * since the Cursor was originally created
 */
export function adjustStackLength<R extends Pointer.Region>(
  region: R,
  stackLengthChange: bigint,
): R {
  if (Pointer.Region.isStack(region)) {
    const slot: Pointer.Expression =
      stackLengthChange === 0n
        ? region.slot
        : stackLengthChange > 0n
          ? { "~sum": [region.slot, `0x${stackLengthChange.toString(16)}`] }
          : {
              "~difference": [
                region.slot,
                `0x${-stackLengthChange.toString(16)}`,
              ],
            };

    return {
      ...region,
      slot,
    };
  }

  return region;
}
