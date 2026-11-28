"use client";

import { useForm, type DefaultValues, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

/**
 * react-hook-form wired to a zod schema from lib/schemas. Fields are checked when the form is
 * submitted, then again as the person types (so an error clears as soon as it's fixed), and the
 * first field with a problem gets focus. handleSubmit hands over the schema's parsed output
 * (trimmed text, numbers as numbers, empty optional fields as null).
 */
export function useZodForm<S extends z.ZodType<unknown, FieldValues>>(schema: S, defaultValues: DefaultValues<z.input<S>>) {
  return useForm<z.input<S>, unknown, z.output<S>>({
    // The resolver's generics don't line up with a generic schema parameter; the call is sound.
    resolver: zodResolver(schema as never) as never,
    defaultValues,
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
  });
}
