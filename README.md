# @ryanke/openapi-typescript

Generate Typescript interfaces from an [OpenAPI V3](https://swagger.io/specification/) schema. This is a complete hack because no existing generator can generate something usable with SWR. It is unlikely to work with other projects unless they are using json schemas and in general is fairly specific for my own use cases. You've been warned.

## usage

- `pnpm install @ryanke/openapi-typescript`
- `openapi-typescript ./spec.json ./src/generated.ts`

## output

```ts
// output would look something like this
// included helper types are not shown in this example as they are the same no matter the input.
export interface User {
  id: string;
  username: string;
  permissions: number;
  [k: string]: unknown;
}

export interface Invite {
  id: string;
  permissions: number;
  createdAt: string;
  expiresAt: string;
  createdBy: User;
  [k: string]: unknown;
}

export interface Routes {
  "/users": User[];
  "/invite/{id}": Invite;
}

// the output also includes some generic helper types
type Response = ResponseFromRoute<`/invite/123`>; // Response is now of type "Invite"

// you can use this to do relatively simple type safety for things like useSWR()
// instead of manually defining the response type each time.
const useRoute = <Route extends keyof SanitizedRoutes>(route: Route) => {
  return useSWR<ResponseFromRoute<Route>>(route);
};

// this can now be used as you'd expect
const { data, error } = useRoute("/invite/456");
// data is now "Invite | undefined"
```
