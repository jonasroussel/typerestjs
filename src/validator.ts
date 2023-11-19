import { ZodTypeAny, z } from 'zod'

export const Is = {
	...z,

	success: <Z extends ZodTypeAny>(data: Z = z.undefined() as Z) =>
		z.object({
			success: z.literal(true),
			data: data,
		}),

	error: <Z extends string>(...types: readonly [Z, ...Z[]]) =>
		z.object({
			success: z.literal(false),
			error: z.object({
				type: z.enum(types),
				message: z.string(),
				details: z.array(z.any()).optional(),
			}),
		}),

	file: (mimetype?: RegExp) =>
		z.object({
			path: z.string(),
			filename: z.string(),
			size: z.number(),
			mimetype: mimetype ? z.string().regex(mimetype) : z.string(),
		}),

	html: () => z.string(),
}
