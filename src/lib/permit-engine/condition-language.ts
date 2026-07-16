import { z } from 'zod';

/**
 * Predicate Operators
 */
export const OperatorSchema = z.enum([
  '==', '!=', '>', '>=', '<', '<=',
  'contains', 'not_contains',
  'in', 'not_in',
  'exists', 'not_exists'
]);

export type Operator = z.infer<typeof OperatorSchema>;

/**
 * Single Predicate: { field: "site_area", op: ">=", value: 5000 }
 */
export const PredicateSchema = z.object({
  field: z.string(),
  op: OperatorSchema,
  value: z.any().optional(),
});

export type Predicate = z.infer<typeof PredicateSchema>;

/**
 * Condition Tree: Recursive structure for complex logic
 */
export type Condition = 
  | { all: Condition[] }
  | { any: Condition[] }
  | Predicate;

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() => 
  z.union([
    z.object({ all: z.array(ConditionSchema) }),
    z.object({ any: z.array(ConditionSchema) }),
    PredicateSchema,
  ])
);
