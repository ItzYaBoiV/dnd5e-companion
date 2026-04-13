/// <reference types="vite/client" />

declare module "*.jsx" {
  import type { ComponentType } from "react";
  const Comp: ComponentType<Record<string, unknown>>;
  export default Comp;
}
