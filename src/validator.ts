import { ZodTypeAny, z } from 'zod'

export const Is = {
	...z,

	file: (mimetype?: RegExp) =>
		z.object({
			path: z.string(),
			filename: z.string(),
			size: z.number(),
			mimetype: mimetype ? z.string().regex(mimetype) : z.string(),
		}),

	success: <Z extends ZodTypeAny>(data?: Z) =>
		z.object({
			success: z.literal(true),
			data: data ?? z.void(),
		}),

	error: <Z extends string>(type: Z) =>
		z.object({
			success: z.literal(false),
			error: z.object({
				type: z.literal(type),
				message: z.string(),
			}),
		}),
}
