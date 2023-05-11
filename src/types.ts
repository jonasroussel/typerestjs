import type { FastifyCookieOptions } from '@fastify/cookie'
import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartOptions } from '@fastify/multipart'
import type { FastifyRateLimitOptions } from '@fastify/rate-limit'
import type { FastifyContextConfig, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeAny, input, output } from 'zod'

export type PluginsOptions = {
	cors: FastifyCorsOptions
	cookie: FastifyCookieOptions
	multipart: FastifyMultipartOptions
	'rate-limit': FastifyRateLimitOptions
}

export interface Schema {
	querystring?: ZodTypeAny
	body?: ZodTypeAny
	params?: ZodTypeAny
	response: { [key in number | string]: ZodTypeAny }
}

export type SchemaType<S extends Schema> = {
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

export type ServerRequest<T extends SchemaType<Schema> = any> = {
	body: T['body']
	query: T['query']
	params: T['params']
} & FastifyRequest

export type ServerReply<T extends SchemaType<Schema> = any> = {
	success: <R extends keyof T['response']>(
		status: R,
		result: T['response'][R]['error'] extends Object ? T['response'][R]['error']['type'] : T['response'][R]['data']
	) => FastifyReply
	error: <R extends keyof T['response']>(
		status: R,
		result: T['response'][R]['error'] extends Object ? T['response'][R]['error']['type'] : T['response'][R]['data'],
		message?: string
	) => FastifyReply
	custom: () => FastifyReply
}

export type Middleware<T extends SchemaType<Schema> = any> = (
	req: ServerRequest<T>,
	reply: ServerReply<T>
) => Promise<any>

export type Handler<T extends SchemaType<Schema> = any> = (
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
	handler: Handler<T>
	config?: FastifyContextConfig
}
