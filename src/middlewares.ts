import OpenTelemetry from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { glob } from 'glob'
import path from 'path'

import { Logger } from './logger.js'
import { Middleware } from './types.js'

const loadMiddleware = async (file: string) => {
	try {
		const exports = await import(path.resolve(file))
		const middlewareName = Object.keys(exports)[0]
		const middleware = exports[middlewareName]

		const tracer = OpenTelemetry.trace.getTracer(middlewareName)

		const wrappers = Object.entries<(...args: any[]) => Middleware>(middleware)
		for (let [wrapperName, wrapper] of wrappers) {
			middleware[wrapperName] = (...args: any[]): Middleware => {
				return (req, reply) => {
					return tracer.startActiveSpan(wrapperName, async (span) => {
						span.setAttribute(SemanticAttributes.CODE_FUNCTION, wrapperName)
						span.setAttribute(SemanticAttributes.CODE_NAMESPACE, middlewareName)

						try {
							const result = await wrapper(...args)(req, reply)
							span.setStatus({ code: OpenTelemetry.SpanStatusCode.OK })
							return result
						} catch (error) {
							if (error instanceof Error) {
								span.recordException(error)
								span.setStatus({ code: OpenTelemetry.SpanStatusCode.ERROR, message: error.message })
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
		Logger.warn('middlewares', `Failed to load middleware '${file}'`)
		if (ex instanceof Error) Logger.warn('middlewares', ex)
	}
}

export const loadMiddlewares = async () => {
	const files = await glob('./dist/middlewares/**/*.middleware.js')

	const middlewares = files.reduce<Record<string, string>>((middlewares, file) => {
		const [_, name] = file.match(/middlewares\/(\w+)\.middleware\.js$/i) ?? []
		if (!name) return middlewares

		return { ...middlewares, [name]: file }
	}, {})

	await Promise.all(Object.values(middlewares).map((file) => loadMiddleware(file)))
}
