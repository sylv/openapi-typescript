// this might not even be necessary, if the route is something like `/invite/${string}` it should match
// `/invite/{id}` anyway. but i'm gonna leave it because its cool.
export type ReplacePlaceholders<T> = T extends `${infer Before}/{${string}}/${infer After}`
  ? ReplacePlaceholders<`${Before}/${string}/${After}`>
  : T extends `${infer Before}/{${string}}`
  ? ReplacePlaceholders<`${Before}/${string}`>
  : T;

export type SanitizedRoutes = {
  [key in keyof Routes as ReplacePlaceholders<key>]: Routes[key];
};

/**
 * Get the response data for a route.
 * @example
 * type Response = ResponseFromRoute<`/files/123`>
 * type Response = ResponseFromRoute<`/files/${string}`>
 */
export type ResponseFromRoute<T extends keyof SanitizedRoutes> = SanitizedRoutes[T];
