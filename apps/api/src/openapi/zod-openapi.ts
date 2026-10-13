import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Shared Zod schemas become OpenAPI components. A schema used here needs
 * `.meta({ id: 'Name' })`, so it gets one named component instead of an inline copy.
 */
export function schemaRef(schema: z.ZodType): { $ref: string } {
  const id = z.globalRegistry.get(schema)?.id;
  if (!id) throw new Error('A schema used in the OpenAPI spec needs .meta({ id })');
  return { $ref: `#/components/schemas/${id}` };
}

export function ApiZodBody(schema: z.ZodType) {
  return ApiBody({ schema: schemaRef(schema) });
}

export function ApiZodResponse(status: number, schema: z.ZodType, description = '') {
  return applyDecorators(ApiResponse({ status, description, schema: schemaRef(schema) }));
}

/**
 * JSON Schemas (OpenAPI 3.0 dialect) of every Zod schema that has an `id`.
 * Described as inputs: request bodies are what clients send (before transforms
 * and defaults). Response schemas have neither, so they read the same.
 */
export function zodComponents(): Record<string, unknown> {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    target: 'openapi-3.0',
    io: 'input',
    uri: (id) => `#/components/schemas/${id}`,
  });
  return Object.fromEntries(
    Object.entries(schemas).map(([id, schema]) => {
      const { $schema: _$schema, id: _id, ...rest } = schema as Record<string, unknown>;
      return [id, rest];
    }),
  );
}
