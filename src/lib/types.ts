export type Prettify<T> = T extends object ? { [K in keyof T]: T[K] } & {} : T

/**
 * DeepPrettify: Recursively forces TypeScript to resolve intersections (&)
 * into a single clean object. This is what fixes the "ugly" hover state.
 */
export type DeepPrettify<T> = T extends Date ? T : T extends object ? { [K in keyof T]: DeepPrettify<T[K]> } & {} : T
