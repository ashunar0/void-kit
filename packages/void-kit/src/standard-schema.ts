/**
 * Types for Standard Schema (https://standardschema.dev). void-kit does not pick a schema library;
 * it accepts anything that has this shape (zod, valibot, ...). Types only, so no added dependency
 */
export interface StandardSchema<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
    readonly validate: (
      value: unknown,
    ) => StandardResult<Output> | Promise<StandardResult<Output>>;
  };
}

export type AnySchema = StandardSchema<any, any>;

export type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardIssue> };

/** One problem a schema found. path is where in the value (`["items", 0, "name"]`), missing for the value itself */
export type StandardIssue = {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
};

export type InferInput<S extends AnySchema> = NonNullable<S["~standard"]["types"]>["input"];

export type InferOutput<S extends AnySchema> = NonNullable<S["~standard"]["types"]>["output"];

/** The path of an issue joined with "." (`items.0.name`). "" for the value as a whole */
export const pathOf = (path: StandardIssue["path"] = []) =>
  path.map((segment) => String(typeof segment === "object" ? segment.key : segment)).join(".");
