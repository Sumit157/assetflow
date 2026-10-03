import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';

export function zodResolver<T extends FieldValues>(schema: ZodType<T>): Resolver<T> {
  return async (values) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: result.data, errors: {} };
    }

    const errors: FieldErrors<T> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (key && errors[key as keyof FieldErrors<T>] === undefined) {
        (errors as Record<string, { type: string; message: string }>)[key] = {
          type: issue.code,
          message: issue.message,
        };
      }
    }
    return { values: {}, errors };
  };
}
