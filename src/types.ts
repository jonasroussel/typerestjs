import type { FastifyCookieOptions } from '@fastify/cookie'
import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartBaseOptions } from '@fastify/multipart'
import type { RateLimitOptions, RateLimitPluginOptions } from '@fastify/rate-limit'
import type { FastifyStaticOptions } from '@fastify/static'
import type { FastifyContextConfig, FastifyReply, FastifyRequest, FastifyTypeProvider } from 'fastify'
import type { ZodType, ZodTypeAny, input, output, z } from 'zod'

declare module 'fastify' {
	interface FastifyContextConfig extends Record<string, any> {
		rateLimit?: RateLimitOptions
		multipartLimits?: FastifyMultipartBaseOptions['limits']
		rawBody?: boolean
	}

	interface FastifyRequest {
		rawBody?: Buffer
		encoding?: BufferEncoding
	}
}

export type PluginsOptions = {
	cors: FastifyCorsOptions
	cookie: FastifyCookieOptions
	'rate-limit': RateLimitPluginOptions
	static: FastifyStaticOptions
}

export interface ZodTypeProvider extends FastifyTypeProvider {
	output: this['input'] extends ZodTypeAny ? z.infer<this['input']> : never
}

export interface Schema {
	querystring?: ZodTypeAny
	body?: ZodTypeAny
	params?: ZodTypeAny
	response: { [key in number | string]: ZodTypeAny }
}

export interface SchemaType<S extends Schema> {
	query: S['querystring'] extends ZodTypeAny ? output<S['querystring']> : {}
	body: S['body'] extends ZodTypeAny ? output<S['body']> : {}
	params: S['params'] extends ZodTypeAny ? output<S['params']> : {}

	queryIn: S['querystring'] extends ZodTypeAny ? input<S['querystring']> : {}
	bodyIn: S['body'] extends ZodTypeAny ? input<S['body']> : {}
	paramsIn: S['params'] extends ZodTypeAny ? input<S['params']> : {}

	response: { [K in keyof S['response']]: output<S['response'][K]> }
	result: output<S['response'][keyof S['response']]>
}

export type ModelType<T extends ZodTypeAny> = output<T>

export type CustomType<T> = ZodType<T>

export interface ServerRequest<T extends SchemaType<Schema> = any> extends FastifyRequest {
	body: T['body']
	query: T['query']
	params: T['params']
}

export interface ServerReply<T extends SchemaType<Schema> = any> {
	success: <R extends keyof T['response']>(
		...args: T['response'][R]['data'] extends undefined ? [status: R] : [status: R, data: T['response'][R]['data']]
	) => FastifyReply
	error: <R extends keyof T['response']>(
		status: R,
		type: T['response'][R]['error']['type'],
		message?: string
	) => FastifyReply
	custom: () => FastifyReply
	html: (input: string | JSX.Element) => FastifyReply
}

export type Middleware<T extends SchemaType<Schema> = any> = (
	req: ServerRequest<T>,
	reply: ServerReply<T>
) => Promise<any>

export type Controller<T extends SchemaType<Schema> = any> = (
	req: ServerRequest<T>,
	reply: ServerReply<T>
) => Promise<FastifyReply>

export type Route<
	T extends SchemaType<Schema> = SchemaType<{
		body: ZodTypeAny
		querystring: ZodTypeAny
		params: ZodTypeAny
		response: { [key in number | string]: ZodTypeAny }
	}>
> = {
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	path: `/${string}`
	middlewares?: Middleware<T>[]
	schema?: Schema
	controller: Controller<T>
	config?: FastifyContextConfig
}
