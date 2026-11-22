// expect: void-kit/route-exports-endpoints | GET is exported but its value is not created with createEndpoint
// expect: void-kit/route-exports-endpoints | POST is exported but its value is not created with createEndpoint
// expect: void-kit/route-exports-endpoints | helper is exported from a route file
// expect: void-kit/route-exports-endpoints | OPTIONS is exported from a route file
// expect: void-kit/route-exports-endpoints | Do not export default
// expect: void-kit/route-exports-endpoints | Do not re-export
import { defineHandler } from "void";

export const GET = defineHandler(() => ({ id: "a" }));
export function POST() {}
export const helper = 1;
export const OPTIONS = 1;
export default 1;
export { x } from "./_other.ts";
