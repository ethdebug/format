import type { $ } from "./hkts.js";

/**
 * Represents an EVM stack as an ordered list of semantic stack brands.
 * The stack grows from left to right, with the leftmost item being the top.
 */
export type Stack = readonly Stack.Brand[];

export namespace Stack {
  export type Brand = string;

  /**
   * Converts a stack type specification into concrete stack items.
   * Maps each Stack.Brand in the stack to a concrete item of type I.
   */
  export type Items<I, S extends Stack> = S extends unknown
    ? S extends readonly []
      ? readonly []
      : S extends readonly [
            infer B extends Stack.Brand,
            ...infer Rest extends Stack,
          ]
        ? readonly [$<I, [B]>, ...Stack.Items<I, Rest>]
        : never
    : never;
}

/**
 * Type-level function to extract the top N items from a stack without modifying it.
 * Supports up to 17 items (maximum EVM instruction operand count).
 */
export type TopN<S extends Stack, N extends number> = S extends unknown
  ? N extends 0
    ? readonly []
    : N extends 1
      ? S extends readonly [infer E1 extends Stack.Brand, ...Stack]
        ? readonly [E1]
        : never
      : N extends 2
        ? S extends readonly [
            infer E1 extends Stack.Brand,
            infer E2 extends Stack.Brand,
            ...Stack,
          ]
          ? readonly [E1, E2]
          : never
        : N extends 3
          ? S extends readonly [
              infer E1 extends Stack.Brand,
              infer E2 extends Stack.Brand,
              infer E3 extends Stack.Brand,
              ...Stack,
            ]
            ? readonly [E1, E2, E3]
            : never
          : N extends 4
            ? S extends readonly [
                infer E1 extends Stack.Brand,
                infer E2 extends Stack.Brand,
                infer E3 extends Stack.Brand,
                infer E4 extends Stack.Brand,
                ...Stack,
              ]
              ? readonly [E1, E2, E3, E4]
              : never
            : N extends 5
              ? S extends readonly [
                  infer E1 extends Stack.Brand,
                  infer E2 extends Stack.Brand,
                  infer E3 extends Stack.Brand,
                  infer E4 extends Stack.Brand,
                  infer E5 extends Stack.Brand,
                  ...Stack,
                ]
                ? readonly [E1, E2, E3, E4, E5]
                : never
              : N extends 6
                ? S extends readonly [
                    infer E1 extends Stack.Brand,
                    infer E2 extends Stack.Brand,
                    infer E3 extends Stack.Brand,
                    infer E4 extends Stack.Brand,
                    infer E5 extends Stack.Brand,
                    infer E6 extends Stack.Brand,
                    ...Stack,
                  ]
                  ? readonly [E1, E2, E3, E4, E5, E6]
                  : never
                : N extends 7
                  ? S extends readonly [
                      infer E1 extends Stack.Brand,
                      infer E2 extends Stack.Brand,
                      infer E3 extends Stack.Brand,
                      infer E4 extends Stack.Brand,
                      infer E5 extends Stack.Brand,
                      infer E6 extends Stack.Brand,
                      infer E7 extends Stack.Brand,
                      ...Stack,
                    ]
                    ? readonly [E1, E2, E3, E4, E5, E6, E7]
                    : never
                  : N extends 8
                    ? S extends readonly [
                        infer E1 extends Stack.Brand,
                        infer E2 extends Stack.Brand,
                        infer E3 extends Stack.Brand,
                        infer E4 extends Stack.Brand,
                        infer E5 extends Stack.Brand,
                        infer E6 extends Stack.Brand,
                        infer E7 extends Stack.Brand,
                        infer E8 extends Stack.Brand,
                        ...Stack,
                      ]
                      ? readonly [E1, E2, E3, E4, E5, E6, E7, E8]
                      : never
                    : N extends 9
                      ? S extends readonly [
                          infer E1 extends Stack.Brand,
                          infer E2 extends Stack.Brand,
                          infer E3 extends Stack.Brand,
                          infer E4 extends Stack.Brand,
                          infer E5 extends Stack.Brand,
                          infer E6 extends Stack.Brand,
                          infer E7 extends Stack.Brand,
                          infer E8 extends Stack.Brand,
                          infer E9 extends Stack.Brand,
                          ...Stack,
                        ]
                        ? readonly [E1, E2, E3, E4, E5, E6, E7, E8, E9]
                        : never
                      : N extends 10
                        ? S extends readonly [
                            infer E1 extends Stack.Brand,
                            infer E2 extends Stack.Brand,
                            infer E3 extends Stack.Brand,
                            infer E4 extends Stack.Brand,
                            infer E5 extends Stack.Brand,
                            infer E6 extends Stack.Brand,
                            infer E7 extends Stack.Brand,
                            infer E8 extends Stack.Brand,
                            infer E9 extends Stack.Brand,
                            infer E10 extends Stack.Brand,
                            ...Stack,
                          ]
                          ? readonly [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10]
                          : never
                        : N extends 11
                          ? S extends readonly [
                              infer E1 extends Stack.Brand,
                              infer E2 extends Stack.Brand,
                              infer E3 extends Stack.Brand,
                              infer E4 extends Stack.Brand,
                              infer E5 extends Stack.Brand,
                              infer E6 extends Stack.Brand,
                              infer E7 extends Stack.Brand,
                              infer E8 extends Stack.Brand,
                              infer E9 extends Stack.Brand,
                              infer E10 extends Stack.Brand,
                              infer E11 extends Stack.Brand,
                              ...Stack,
                            ]
                            ? readonly [
                                E1,
                                E2,
                                E3,
                                E4,
                                E5,
                                E6,
                                E7,
                                E8,
                                E9,
                                E10,
                                E11,
                              ]
                            : never
                          : N extends 12
                            ? S extends readonly [
                                infer E1 extends Stack.Brand,
                                infer E2 extends Stack.Brand,
                                infer E3 extends Stack.Brand,
                                infer E4 extends Stack.Brand,
                                infer E5 extends Stack.Brand,
                                infer E6 extends Stack.Brand,
                                infer E7 extends Stack.Brand,
                                infer E8 extends Stack.Brand,
                                infer E9 extends Stack.Brand,
                                infer E10 extends Stack.Brand,
                                infer E11 extends Stack.Brand,
                                infer E12 extends Stack.Brand,
                                ...Stack,
                              ]
                              ? readonly [
                                  E1,
                                  E2,
                                  E3,
                                  E4,
                                  E5,
                                  E6,
                                  E7,
                                  E8,
                                  E9,
                                  E10,
                                  E11,
                                  E12,
                                ]
                              : never
                            : N extends 13
                              ? S extends readonly [
                                  infer E1 extends Stack.Brand,
                                  infer E2 extends Stack.Brand,
                                  infer E3 extends Stack.Brand,
                                  infer E4 extends Stack.Brand,
                                  infer E5 extends Stack.Brand,
                                  infer E6 extends Stack.Brand,
                                  infer E7 extends Stack.Brand,
                                  infer E8 extends Stack.Brand,
                                  infer E9 extends Stack.Brand,
                                  infer E10 extends Stack.Brand,
                                  infer E11 extends Stack.Brand,
                                  infer E12 extends Stack.Brand,
                                  infer E13 extends Stack.Brand,
                                  ...Stack,
                                ]
                                ? readonly [
                                    E1,
                                    E2,
                                    E3,
                                    E4,
                                    E5,
                                    E6,
                                    E7,
                                    E8,
                                    E9,
                                    E10,
                                    E11,
                                    E12,
                                    E13,
                                  ]
                                : never
                              : N extends 14
                                ? S extends readonly [
                                    infer E1 extends Stack.Brand,
                                    infer E2 extends Stack.Brand,
                                    infer E3 extends Stack.Brand,
                                    infer E4 extends Stack.Brand,
                                    infer E5 extends Stack.Brand,
                                    infer E6 extends Stack.Brand,
                                    infer E7 extends Stack.Brand,
                                    infer E8 extends Stack.Brand,
                                    infer E9 extends Stack.Brand,
                                    infer E10 extends Stack.Brand,
                                    infer E11 extends Stack.Brand,
                                    infer E12 extends Stack.Brand,
                                    infer E13 extends Stack.Brand,
                                    infer E14 extends Stack.Brand,
                                    ...Stack,
                                  ]
                                  ? readonly [
                                      E1,
                                      E2,
                                      E3,
                                      E4,
                                      E5,
                                      E6,
                                      E7,
                                      E8,
                                      E9,
                                      E10,
                                      E11,
                                      E12,
                                      E13,
                                      E14,
                                    ]
                                  : never
                                : N extends 15
                                  ? S extends readonly [
                                      infer E1 extends Stack.Brand,
                                      infer E2 extends Stack.Brand,
                                      infer E3 extends Stack.Brand,
                                      infer E4 extends Stack.Brand,
                                      infer E5 extends Stack.Brand,
                                      infer E6 extends Stack.Brand,
                                      infer E7 extends Stack.Brand,
                                      infer E8 extends Stack.Brand,
                                      infer E9 extends Stack.Brand,
                                      infer E10 extends Stack.Brand,
                                      infer E11 extends Stack.Brand,
                                      infer E12 extends Stack.Brand,
                                      infer E13 extends Stack.Brand,
                                      infer E14 extends Stack.Brand,
                                      infer E15 extends Stack.Brand,
                                      ...Stack,
                                    ]
                                    ? readonly [
                                        E1,
                                        E2,
                                        E3,
                                        E4,
                                        E5,
                                        E6,
                                        E7,
                                        E8,
                                        E9,
                                        E10,
                                        E11,
                                        E12,
                                        E13,
                                        E14,
                                        E15,
                                      ]
                                    : never
                                  : N extends 16
                                    ? S extends readonly [
                                        infer E1 extends Stack.Brand,
                                        infer E2 extends Stack.Brand,
                                        infer E3 extends Stack.Brand,
                                        infer E4 extends Stack.Brand,
                                        infer E5 extends Stack.Brand,
                                        infer E6 extends Stack.Brand,
                                        infer E7 extends Stack.Brand,
                                        infer E8 extends Stack.Brand,
                                        infer E9 extends Stack.Brand,
                                        infer E10 extends Stack.Brand,
                                        infer E11 extends Stack.Brand,
                                        infer E12 extends Stack.Brand,
                                        infer E13 extends Stack.Brand,
                                        infer E14 extends Stack.Brand,
                                        infer E15 extends Stack.Brand,
                                        infer E16 extends Stack.Brand,
                                        ...Stack,
                                      ]
                                      ? readonly [
                                          E1,
                                          E2,
                                          E3,
                                          E4,
                                          E5,
                                          E6,
                                          E7,
                                          E8,
                                          E9,
                                          E10,
                                          E11,
                                          E12,
                                          E13,
                                          E14,
                                          E15,
                                          E16,
                                        ]
                                      : never
                                    : N extends 17
                                      ? S extends readonly [
                                          infer E1 extends Stack.Brand,
                                          infer E2 extends Stack.Brand,
                                          infer E3 extends Stack.Brand,
                                          infer E4 extends Stack.Brand,
                                          infer E5 extends Stack.Brand,
                                          infer E6 extends Stack.Brand,
                                          infer E7 extends Stack.Brand,
                                          infer E8 extends Stack.Brand,
                                          infer E9 extends Stack.Brand,
                                          infer E10 extends Stack.Brand,
                                          infer E11 extends Stack.Brand,
                                          infer E12 extends Stack.Brand,
                                          infer E13 extends Stack.Brand,
                                          infer E14 extends Stack.Brand,
                                          infer E15 extends Stack.Brand,
                                          infer E16 extends Stack.Brand,
                                          infer E17 extends Stack.Brand,
                                          ...Stack,
                                        ]
                                        ? readonly [
                                            E1,
                                            E2,
                                            E3,
                                            E4,
                                            E5,
                                            E6,
                                            E7,
                                            E8,
                                            E9,
                                            E10,
                                            E11,
                                            E12,
                                            E13,
                                            E14,
                                            E15,
                                            E16,
                                            E17,
                                          ]
                                        : never
                                      : never
  : never;

/**
 * Type-level function to push new items onto the front of a stack.
 * Items in T are prepended to stack S, making T[0] the new top item.
 */
export type Push<S extends Stack, T extends Stack> = S extends unknown
  ? T extends unknown
    ? readonly [...T, ...S]
    : never
  : never;

/**
 * Type-level function to remove N items from the top of a stack.
 * Supports up to 17 items (maximum EVM instruction operand count).
 */
export type PopN<S extends Stack, N extends number> = S extends unknown
  ? N extends N
    ? N extends 0
      ? S
      : N extends 1
        ? S extends readonly [Stack.Brand, ...infer Rest extends Stack]
          ? Rest
          : never
        : N extends 2
          ? S extends readonly [
              Stack.Brand,
              Stack.Brand,
              ...infer Rest extends Stack,
            ]
            ? Rest
            : never
          : N extends 3
            ? S extends readonly [
                Stack.Brand,
                Stack.Brand,
                Stack.Brand,
                ...infer Rest extends Stack,
              ]
              ? Rest
              : never
            : N extends 4
              ? S extends readonly [
                  Stack.Brand,
                  Stack.Brand,
                  Stack.Brand,
                  Stack.Brand,
                  ...infer Rest extends Stack,
                ]
                ? Rest
                : never
              : N extends 5
                ? S extends readonly [
                    Stack.Brand,
                    Stack.Brand,
                    Stack.Brand,
                    Stack.Brand,
                    Stack.Brand,
                    ...infer Rest extends Stack,
                  ]
                  ? Rest
                  : never
                : N extends 6
                  ? S extends readonly [
                      Stack.Brand,
                      Stack.Brand,
                      Stack.Brand,
                      Stack.Brand,
                      Stack.Brand,
                      Stack.Brand,
                      ...infer Rest extends Stack,
                    ]
                    ? Rest
                    : never
                  : N extends 7
                    ? S extends readonly [
                        Stack.Brand,
                        Stack.Brand,
                        Stack.Brand,
                        Stack.Brand,
                        Stack.Brand,
                        Stack.Brand,
                        Stack.Brand,
                        ...infer Rest extends Stack,
                      ]
                      ? Rest
                      : never
                    : N extends 8
                      ? S extends readonly [
                          Stack.Brand,
                          Stack.Brand,
                          Stack.Brand,
                          Stack.Brand,
                          Stack.Brand,
                          Stack.Brand,
                          Stack.Brand,
                          Stack.Brand,
                          ...infer Rest extends Stack,
                        ]
                        ? Rest
                        : never
                      : N extends 9
                        ? S extends readonly [
                            Stack.Brand,
                            Stack.Brand,
                            Stack.Brand,
                            Stack.Brand,
                            Stack.Brand,
                            Stack.Brand,
                            Stack.Brand,
                            Stack.Brand,
                            Stack.Brand,
                            ...infer Rest extends Stack,
                          ]
                          ? Rest
                          : never
                        : N extends 10
                          ? S extends readonly [
                              Stack.Brand,
                              Stack.Brand,
                              Stack.Brand,
                              Stack.Brand,
                              Stack.Brand,
                              Stack.Brand,
                              Stack.Brand,
                              Stack.Brand,
                              Stack.Brand,
                              Stack.Brand,
                              ...infer Rest extends Stack,
                            ]
                            ? Rest
                            : never
                          : N extends 11
                            ? S extends readonly [
                                Stack.Brand,
                                Stack.Brand,
                                Stack.Brand,
                                Stack.Brand,
                                Stack.Brand,
                                Stack.Brand,
                                Stack.Brand,
                                Stack.Brand,
                                Stack.Brand,
                                Stack.Brand,
                                Stack.Brand,
                                ...infer Rest extends Stack,
                              ]
                              ? Rest
                              : never
                            : N extends 12
                              ? S extends readonly [
                                  Stack.Brand,
                                  Stack.Brand,
                                  Stack.Brand,
                                  Stack.Brand,
                                  Stack.Brand,
                                  Stack.Brand,
                                  Stack.Brand,
                                  Stack.Brand,
                                  Stack.Brand,
                                  Stack.Brand,
                                  Stack.Brand,
                                  Stack.Brand,
                                  ...infer Rest extends Stack,
                                ]
                                ? Rest
                                : never
                              : N extends 13
                                ? S extends readonly [
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    Stack.Brand,
                                    ...infer Rest extends Stack,
                                  ]
                                  ? Rest
                                  : never
                                : N extends 14
                                  ? S extends readonly [
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      Stack.Brand,
                                      ...infer Rest extends Stack,
                                    ]
                                    ? Rest
                                    : never
                                  : N extends 15
                                    ? S extends readonly [
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        Stack.Brand,
                                        ...infer Rest extends Stack,
                                      ]
                                      ? Rest
                                      : never
                                    : N extends 16
                                      ? S extends readonly [
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          Stack.Brand,
                                          ...infer Rest extends Stack,
                                        ]
                                        ? Rest
                                        : never
                                      : N extends 17
                                        ? S extends readonly [
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            Stack.Brand,
                                            ...infer Rest extends Stack,
                                          ]
                                          ? Rest
                                          : never
                                        : never
    : never
  : never;
