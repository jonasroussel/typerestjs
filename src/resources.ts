import type { Handler, Route, ServerInstance, ServerReply, ServerRequest } from './types.js'

import OpenTelemetry, { SpanStatusCode } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { glob } from 'glob'
import path from 'path'

import { replyWrapper } from './helpers.js'
import { Logger } from './logger.js'

type ResourceType = 'controller' | 'router' | 'schema' | 'service'

/**
 * Loads a service from a file and wraps its functions with OpenTelemetry tracing.
 *
 * @param file - The path to the file containing the service.
 */
const loadService = async (file: string) => {
	try {
		const exports = await import(path.resolve(file))
		const serviceName = Object.keys(exports)[0]
		const service = exports[serviceName]

		const tracer = OpenTelemetry.trace.getTracer(serviceName)

		const functions = Object.entries<(...args: any[]) => any>(service)
		for (let [funcName, func] of functions) {
			service[funcName] = (...args: any[]) => {
				if (func.constructor.name === 'AsyncFunction') {
					return tracer.startActiveSpan(funcName, async (span) => {
						span.setAttribute(SemanticAttributes.CODE_FUNCTION, funcName)
						span.setAttribute(SemanticAttributes.CODE_NAMESPACE, serviceName)

						try {
							const result = await func(...args)
							span.setStatus({ code: SpanStatusCode.OK })
							return result
						} catch (error) {
							if (error instanceof Error) {
								span.recordException(error)
								span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
							}
							throw error
						} finally {
							span.end()
						}
					})
				} else {
					return tracer.startActiveSpan(funcName, (span) => {
						span.setAttribute(SemanticAttributes.CODE_FUNCTION, funcName)
						span.setAttribute(SemanticAttributes.CODE_NAMESPACE, serviceName)

						try {
							const result = func(...args)
							span.setStatus({ code: SpanStatusCode.OK })
							return result
						} catch (error) {
							if (error instanceof Error) {
								span.recordException(error)
								span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
							}
							throw error
						} finally {
							span.end()
						}
					})
				}
			}
		}
	} catch (ex) {
		Logger.warn('resources', `Failed to load service '${file}'`)
		if (ex instanceof Error) Logger.warn('resources', ex)
	}
}

/**
 * Loads a controller module and wraps its handlers with OpenTelemetry tracing.
 *
 * @param file - The path to the controller module.
 */
const loadController = async (file: string) => {
	try {
		const exports = await import(path.resolve(file))
		const controllerName = Object.keys(exports)[0]
		const controller = exports[controllerName]

		const tracer = OpenTelemetry.trace.getTracer(controllerName)

		const handlers = Object.entries<Handler>(controller)

		for (let [handlerName, handler] of handlers) {
			controller[handlerName] = async (req: ServerRequest, reply: ServerReply) => {
				const result = await tracer.startActiveSpan('handler', async (span) => {
					span.setAttribute(SemanticAttributes.CODE_FUNCTION, handlerName)
					span.setAttribute(SemanticAttributes.CODE_NAMESPACE, controllerName)

					try {
						const result = await handler(req, reply)
						console.log('handler finished')
						span.setStatus({ code: SpanStatusCode.OK })
						return result
					} catch (error) {
						if (error instanceof Error) {
							span.recordException(error)
							span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
						}
						throw error
					} finally {
						span.end()
					}
				})

				return reply.success(200, result)
			}
		}
	} catch (ex) {
		Logger.warn('resources', `Failed to load controller '${file}'`)
		if (ex instanceof Error) Logger.warn('resources', ex)
	}
}

/**
 * Loads a router from a file and registers its routes with the server.
 *
 * @param file - The path to the file containing the router.
 * @param server - The server instance to register the routes with.
 */
const loadRouter = async (file: string, server: ServerInstance, telemetry: boolean) => {
	try {
		const exports = await import(path.resolve(file))
		const routerName = Object.keys(exports)[0]
		const { PREFIX = '', ...router } = exports[routerName] ?? {}

		let tracer: OpenTelemetry.Tracer
		if (telemetry) tracer = OpenTelemetry.trace.getTracer(routerName)

		const routes = Object.entries<Route>(router)
		for (let [routeName, route] of routes) {
			const { method, path, middlewares, schema, handler, config } = route

			const url = `${PREFIX}${path.replace(/\/+$/, '')}`

			server.route({
				url,
				method,
				config,

				...(telemetry && {
					onRequest: (req, _, done) => {
						tracer.startActiveSpan(`${method} ${url}`, (span) => {
							span.setAttribute(SemanticAttributes.CODE_FUNCTION, routeName)
							span.setAttribute(SemanticAttributes.CODE_NAMESPACE, routerName)

							span.setAttributes({
								[SemanticAttributes.HTTP_METHOD]: method,
								[SemanticAttributes.HTTP_ROUTE]: url,
								[SemanticAttributes.HTTP_URL]: req.url,
								[SemanticAttributes.HTTP_CLIENT_IP]: req.ip,
								[SemanticAttributes.HTTP_HOST]: req.headers['host'],
								[SemanticAttributes.HTTP_REQUEST_CONTENT_LENGTH]: req.headers['content-length'] ?? '0',
								[SemanticAttributes.HTTP_USER_AGENT]: req.headers['user-agent'] ?? '',
							})

							req._spans = {}
							req._spans['top'] = span
							done()
						})
					},
				}),

				preParsing: (req, _, payload, done) => {
					if (telemetry) req._spans['parsing'] = tracer.startSpan('parsing')

					if (req.routeOptions.config.rawBody === true) {
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

				preValidation: async (req, reply) => {
					if (telemetry) {
						req._spans['parsing'].end()
						delete req._spans['parsing']
					}

					for (let middleware of middlewares ?? []) {
						await middleware(req, replyWrapper(reply))
					}

					if (telemetry) req._spans['validation'] = tracer.startSpan('validation')
				},

				schema,

				...(telemetry && {
					preHandler: (req, _, done) => {
						req._spans['validation'].end()
						delete req._spans['validation']

						done()
					},
				}),

				handler: (req, reply) => handler(req, replyWrapper(reply)),

				...(telemetry && {
					preSerialization: (req, _, payload, done) => {
						console.log('serialization start')
						req._spans['serialization'] = tracer.startSpan('serialization')
						done(null, payload)
					},
				}),

				...(telemetry && {
					onSend: (req, _, payload, done) => {
						req._spans['serialization'].end()
						delete req._spans['serialization']

						console.log('sending start')
						req._spans['sending'] = tracer.startSpan('sending')
						done(null, payload)
					},
				}),

				...(telemetry && {
					onResponse: (req, reply, done) => {
						req._spans['sending'].end()
						delete req._spans['sending']

						const span = req._spans['top']

						span.setAttributes({
							[SemanticAttributes.HTTP_STATUS_CODE]: reply.statusCode,
							[SemanticAttributes.HTTP_RESPONSE_CONTENT_LENGTH]: reply.getHeader('content-length') ?? '0',
						})
						span.setStatus({ code: reply.statusCode < 500 ? SpanStatusCode.OK : SpanStatusCode.ERROR })

						span.end()
						done()
					},
				}),
			})
		}
	} catch (ex) {
		Logger.warn('resources', `Failed to load router '${file}'`)
		if (ex instanceof Error) Logger.warn('resources', ex)
	}
}

/**
 * Loads a resource asynchronously.
 *
 * @param resourceName - The name of the resource.
 * @param resource - The resource object containing service and router information.
 * @param server - The server instance.
 */
const loadResource = async (resource: Record<ResourceType, string>, server: ServerInstance, telemetry: boolean) => {
	if (resource.service !== undefined && telemetry) await loadService(resource.service)
	if (resource.controller !== undefined && telemetry) await loadController(resource.controller)
	if (resource.router !== undefined) await loadRouter(resource.router, server, telemetry)
}

/**
 * Loads the resources by searching for files in the specified directory.
 * Each resource file should have a specific naming convention and should be located in the './dist/resources' directory.
 * The resources are organized in a record where the key is the resource name and the value is an object containing the different types of resource files.
 * The supported resource types are 'controller', 'router', 'schema', and 'service'.
 *
 * @returns A promise that resolves when all the resources are loaded.
 */
export const loadResources = async (server: ServerInstance, telemetry: boolean) => {
	const files = await glob('./dist/resources/*/*.{controller,router,schema,service}.js')

	const resources = files.reduce<Record<string, Record<ResourceType, string>>>((resources, file) => {
		const [_, name, type] = file.match(/resources\/(\w+)\/\w+\.(controller|router|schema|service)\.js$/i) ?? []
		if (!name || !type) return resources

		return { ...resources, [name]: { ...resources[name], [type]: file } }
	}, {})

	await Promise.all(Object.values(resources).map((resource) => loadResource(resource, server, telemetry)))
}
