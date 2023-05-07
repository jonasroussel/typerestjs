import fastify, {
	FastifyBaseLogger,
	FastifyError,
	FastifyInstance,
	FastifyListenOptions,
	FastifyReply,
	FastifyServerOptions,
	FastifyTypeProvider
} from 'fastify'
import { glob } from 'glob'
import { ServerResponse as HTTPResponse, Server as HTTPServer, IncomingMessage } from 'http'
import path from 'path'
import { ZodAny, ZodIssue, ZodTypeAny, z } from 'zod'

import { Logger } from './logger'
import { Route, ServerReply } from './types'
import { parseDatesInObject, parseStringValue } from './utils'

// Error thrown when the request schema validation failed
export class RequestError extends Error {
	public issues: ZodIssue[]

	constructor(issues: ZodIssue[]) {
		super("Request doesn't match the schema")
		this.issues = issues
	}
}

// Error thrown when the response schema validation failed
export class ResponseError extends Error {
	public issues: ZodIssue[]

	constructor(issues: ZodIssue[]) {
		super("Response doesn't match the schema")
		this.issues = issues
	}
}

// Type Provider for Zod
interface ZodTypeProvider extends FastifyTypeProvider {
	output: this['input'] extends ZodTypeAny ? z.infer<this['input']> : never
}

//------------------//
// HELPER FUNCTIONS //
//------------------//

const replyWrapper = (reply: FastifyReply): ServerReply<any> => {
	return {
		success: (status, result) => {
			let intStatus = typeof status === 'number' ? status : parseInt(status.toString())
			if (Number.isNaN(status)) intStatus = 200

			return reply.status(intStatus).send({
				success: true,
				data: result,
			})
		},

		error: (status, type, message) => {
			let intStatus = typeof status === 'number' ? status : parseInt(status.toString())
			if (Number.isNaN(status) || intStatus < 400) intStatus = 400

			return reply.status(intStatus).send({
				success: false,
				error: {
					type: type,
					message: message,
				},
			})
		},

		custom: () => reply,
	}
}

const pathOf = (input?: string) => {
	if (!input) return
	try {
		const url = new URL(input.startsWith('/') ? `http://127.0.0.1${input}` : input)
		return url.pathname
	} catch (_) {}
}

const replyBadRequest = (error: RequestError, reply: FastifyReply, metadata?: any) => {
	const response = {
		success: false,
		error: {
			type: 'bad_request',
			message: 'Oops! Looks like there was a problem with your request.',
			details: error.issues.map((issue) => {
				const { path, code, message, ...rest } = issue

				return {
					field: path.join('.'),
					type: code,
					message: message,
					...rest,
				}
			}),
		},
	}

	Logger.error('http', error, { ...metadata, status: 400, response })

	reply.status(400).send(response)
}

const replyBadResponse = (error: ResponseError, reply: FastifyReply, metadata?: any) => {
	const response = {
		success: false,
		error: {
			type: 'bad_response',
			message: 'Something went wrong with your request while generating the response',
			details: error.issues.map((issue) => {
				const { path, code, message, ...rest } = issue

				return {
					field: path.join('.'),
					type: code,
					message: message,
					...rest,
				}
			}),
		},
	}

	Logger.crit('http', error, { ...metadata, status: 500, response })

	reply.status(500).send(response)
}

const replyUnknownError = (error: FastifyError, reply: FastifyReply, metadata?: any) => {
	const response = {
		success: false,
		error: {
			type: 'unknown_error',
			message: 'An unknown error has occurred during the request.',
		},
	}

	Logger.crit('server', error, { ...metadata, status: 500, response })

	reply.status(500).send(response)
}

//------------------//
// SERVER COMPONENT //
//------------------//

export class Server {
	public instance: FastifyInstance<
		HTTPServer<typeof IncomingMessage, typeof HTTPResponse>,
		IncomingMessage,
		HTTPResponse<IncomingMessage>,
		FastifyBaseLogger,
		ZodTypeProvider
	>

	constructor(options?: FastifyServerOptions<HTTPServer, FastifyBaseLogger>) {
		this.instance = fastify({
			// Recommended
			connectionTimeout: 60_000, // 60s
			bodyLimit: 32 * 1_048_576, // 32 MB
			caseSensitive: true,

			// User customizations
			...options,

			// Mandatory
			logger: false,
			ignoreDuplicateSlashes: true,
			ignoreTrailingSlash: true,
		}).withTypeProvider<ZodTypeProvider>()

		// Request schema validation
		this.instance.setValidatorCompiler<ZodAny>(({ schema }) => {
			return (data): any => {
				const result = schema.safeParse(data)
				if (result.success) return { value: result.data }
				return { error: new RequestError(result.error.issues) }
			}
		})

		// Response schema validation
		this.instance.setSerializerCompiler<ZodAny | { properties: ZodAny }>(({ schema }) => {
			return (data) => {
				if (data.success === false) return JSON.stringify(data)

				const result = ('properties' in schema ? schema.properties : schema).safeParse(data)
				if (result.success) return JSON.stringify(result.data)

				throw new ResponseError(result.error.issues)
			}
		})

		// Handle request/response errors & unknown errors
		this.instance.setErrorHandler((error, req, reply) => {
			const metadata = {
				method: req.method,
				path: req.routerPath ?? pathOf(req.url) ?? req.url,
				ip: req.ip,
				params: req.params,
				query: req.query,
			}

			if (error instanceof RequestError) return replyBadRequest(error, reply, metadata)
			else if (error instanceof ResponseError) return replyBadResponse(error, reply, metadata)
			else return replyUnknownError(error, reply, metadata)
		})

		// Request parsing for all incoming requests
		this.instance.addHook('onRequest', async (req, reply) => {
			req.params ??= {}
			req.query ??= {}
			req.body = parseDatesInObject(req.body ?? {})

			const query = req.query as any

			for (let key in query) {
				query[key] = parseStringValue(query[key])
			}
		})

		// Response parsing for all outcoming responses
		this.instance.addHook('onResponse', async (req, reply) => {
			const data = {
				method: req.method,
				path: req.routerPath ?? pathOf(req.url) ?? req.url,
				ip: req.ip,
				status: reply.statusCode,
				rs: Math.round(reply.getResponseTime()),
				params: req.params,
				query: req.query,
			}

			Logger.log(
				data.status >= 500 ? 'error' : 'info',
				'http',
				`${data.method} ${data.path} ${data.ip} ${data.status} (${data.rs}ms)`,
				data
			)
		})
	}

	async on(event: 'ready' | 'error', action: (...args: any[]) => Promise<void> | void) {
		switch (event) {
			case 'ready':
				this.instance.addHook('onReady', action)
				break
			case 'error':
				this.instance.addHook('onError', action)
				break
		}
	}

	async start(options?: FastifyListenOptions) {
		// Auto-import all existing routes
		this.instance.after(async () => {
			// @ts-ignore
			const lang = process[Symbol.for('ts-node.register.instance')] ? 'ts' : 'js'
			const files = await glob(lang === 'ts' ? './src/routes/**/*.ts' : './dist/routes/**/*.js')

			await Promise.all(
				files.map(async (file) => {
					const expt = await import(path.resolve(file))
					const router = expt[Object.keys(expt)[0]]
					const { PREFIX = '', ...routes } = router

					for (let name in routes) {
						try {
							const { path, middlewares, handler, ...props } = routes[name] as Route

							this.instance.route({
								url: `${PREFIX}${path.replace(/\/+$/, '')}`,
								...props,
								...(middlewares
									? {
											preValidation: async (req, reply) => {
												for (let middleware of middlewares) {
													await middleware(req, replyWrapper(reply))
												}
											},
									  }
									: {}),
								handler: (req, reply) => handler(req, replyWrapper(reply)),
							})
						} catch (_) {
							Logger.warn('server', `${file}[${name}] fails to load`)
						}
					}
				})
			)
		})

		await this.instance.ready()

		const host = options?.host ?? 'localhost'
		const port = parseInt(options?.port?.toString() ?? process.env.PORT ?? '8080')

		await this.instance.listen({
			...options,
			host,
			port,
		})

		Logger.info('server', `Server listening at http://${host}:${port}`)
	}
}

//--------------//
// SERVER TYPES //
//--------------//

export const Is = {
	...z,
	success: <Z extends ZodTypeAny>(data: Z) =>
		z.object({
			success: z.literal(true),
			data: data,
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
