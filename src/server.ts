import multipart, { FastifyMultipartBaseOptions, Multipart, MultipartFile } from '@fastify/multipart'
import { randomUUID } from 'crypto'
import fastify, { FastifyBaseLogger, FastifyInstance, FastifyListenOptions, FastifyServerOptions } from 'fastify'
import { createWriteStream } from 'fs'
import { unlink } from 'fs/promises'
import { glob } from 'glob'
import { ServerResponse as HTTPResponse, Server as HTTPServer, IncomingMessage } from 'http'
import { extensions } from 'mime-types'
import { tmpdir } from 'os'
import path from 'path'
import { pipeline } from 'stream/promises'
import { ZodAny, ZodIssue } from 'zod'

import { replyBadRequest, replyBadResponse, replyFileTooLarge, replyUnknownError, replyWrapper } from './helpers'
import { Logger } from './logger'
import { PluginsOptions, Route, ServerRequest, ZodTypeProvider } from './types'
import { isField, isFile, parseDatesInObject, parseStringValue, pathOf } from './utils'

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

export class Server {
	public instance: FastifyInstance<
		HTTPServer<typeof IncomingMessage, typeof HTTPResponse>,
		IncomingMessage,
		HTTPResponse<IncomingMessage>,
		FastifyBaseLogger,
		ZodTypeProvider
	>

	constructor(
		options?: FastifyServerOptions<HTTPServer, FastifyBaseLogger> & {
			multipartLimits?: FastifyMultipartBaseOptions['limits']
		}
	) {
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
			else if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
				return replyFileTooLarge(error, reply, {
					...metadata,
					limit: options?.multipartLimits?.fileSize ?? 256 * 1_048_576,
				})
			} else return replyUnknownError(error, reply, metadata)
		})

		// Register the multipart plugin to handle multipart/form-data requests
		this.instance.register(multipart, {
			attachFieldsToBody: true,
			throwFileSizeLimit: true,
			onFile: async function (part: MultipartFile & { filepath?: string }) {
				let filename = randomUUID()

				const exts = extensions[part.mimetype] || []
				if (exts.length === 1) filename += `.${exts[0]}`
				else if (exts.length > 1) filename += '.' + (exts[0].length < exts[1].length ? exts[0] : exts[1])

				const path = `${tmpdir()}/${filename}`

				try {
					await pipeline(part.file, createWriteStream(path))

					part.filepath = path
					this.socket.on('close', () => unlink(path))
				} catch (_) {
					await unlink(path)
				}
			},
			limits: {
				fieldSize: 32 * 1_048_576, // 32 MB,
				fileSize: 256 * 1_048_576, // 256 MB
				files: 10,
				...options?.multipartLimits,
			},
		})

		// Request parsing for all incoming requests
		this.instance.addHook('preValidation', async (req: ServerRequest) => {
			if (req.isMultipart()) {
				const body: Multipart[] = Object.values(req.body ?? {})

				const fields = body.filter(isField)
				const files = body.filter(isFile)

				req.body = {}

				for (let field of fields) {
					req.body[field.fieldname] = field.value
				}

				for (let file of files) {
					req.body[file.fieldname] = {
						path: file.filepath,
						filename: file.filename,
						size: file.file.bytesRead,
						mimetype: file.mimetype,
					}
				}
			} else {
				req.params ??= {}
				req.query ??= {}
				req.body = parseDatesInObject(req.body ?? {})

				const query = req.query as any

				for (let key in query) {
					query[key] = parseStringValue(query[key])
				}
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

	async enable<T extends keyof PluginsOptions>(plugin: T, opts?: PluginsOptions[T]) {
		if (plugin === 'static') {
			const root = (opts as PluginsOptions['static'])?.root ?? 'public'
			const newOpts = {
				...opts,
				root: (typeof root === 'string' ? [root] : root).map((root) => path.join(require.main!.path, '..', root)),
			} as PluginsOptions['static']

			await this.instance.register(await import('@fastify/static'), newOpts)
		} else {
			await this.instance.register(await import(`@fastify/${plugin}`), opts)
		}
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
								preParsing: (req, _, payload, done) => {
									if (req.routeConfig.rawBody === true) {
										const chunks: Buffer[] = []

										payload.on('data', (chunk) => {
											if (payload.readableEncoding) chunks.push(Buffer.from(chunk, payload.readableEncoding))
											else chunks.push(chunk)
										})

										payload.on('end', () => {
											req.rawBody = Buffer.concat(chunks)
											req.encoding = payload.readableEncoding ?? undefined
										})
									}

									done(null, payload)
								},
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
