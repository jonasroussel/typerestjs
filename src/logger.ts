export namespace Logger {
	type Level = 'debug' | 'info' | 'warn' | 'error' | 'critical'
	type Tag = string
	type LogPipe = (level: Level, tag: Tag, msg: string | Error, metadata?: any) => Promise<void> | void

	const colorOfLevel: { [key in Level]: string } = {
		debug: '90',
		info: '36',
		warn: '33',
		error: '31',
		critical: '35',
	}

	const loggerOfLevel: { [key in Level]: typeof console.log } = {
		debug: console.debug,
		info: console.info,
		warn: console.warn,
		error: console.error,
		critical: console.error,
	}

	const logPipes: LogPipe[] = []

	/**
	 * Add a log pipe to the logger, can be use to send logs to an external service.
	 *
	 * @param pipe - A pipe function that take the `level, tag, msg & metadata` as input
	 */
	export const use = (pipe: LogPipe) => {
		logPipes.push(pipe)
	}

	/**
	 * Logs a `debug` message in the stdout and all the log pipes.
	 *
	 * @param tag - The log tag.
	 * @param msg - The log message or an Error object.
	 * @param metadata - Optional metadata attached to the log.
	 */
	export const debug = (tag: Tag, msg: string | Error, metadata?: any) => log('debug', tag, msg, metadata)
	/**
	 * Logs an `info` message in the stdout and all the log pipes.
	 *
	 * @param tag - The log tag.
	 * @param msg - The log message or an Error object.
	 * @param metadata - Optional metadata attached to the log.
	 */
	export const info = (tag: Tag, msg: string | Error, metadata?: any) => log('info', tag, msg, metadata)
	/**
	 * Logs a `warn` message in the stdout and all the log pipes.
	 *
	 * @param tag - The log tag.
	 * @param msg - The log message or an Error object.
	 * @param metadata - Optional metadata attached to the log.
	 */
	export const warn = (tag: Tag, msg: string | Error, metadata?: any) => log('warn', tag, msg, metadata)
	/**
	 * Logs an `error` message in the stdout and all the log pipes.
	 *
	 * @param tag - The log tag.
	 * @param msg - The log message or an Error object.
	 * @param metadata - Optional metadata attached to the log.
	 */
	export const error = (tag: Tag, msg: string | Error, metadata?: any) => log('error', tag, msg, metadata)
	/**
	 * Logs a `critical` message in the stdout and all the log pipes.
	 *
	 * @param tag - The log tag.
	 * @param msg - The log message or an Error object.
	 * @param metadata - Optional metadata attached to the log.
	 */
	export const crit = (tag: Tag, msg: string | Error, metadata?: any) => log('critical', tag, msg, metadata)

	/**
	 * Logs a message in the stdout and all the log pipes.
	 *
	 * @param level - The log level.
	 * @param tag - The log tag.
	 * @param msg - The log message or an Error object.
	 * @param metadata - Optional metadata attached to the log.
	 */
	export const log = (level: Level, tag: Tag, msg: string | Error, metadata?: any) => {
		if (msg instanceof Error) {
			msg = `[${msg.name}] ${msg.message}\n${msg.stack?.split('\n').slice(1).join('\n') ?? ''}`
		}

		if (metadata?.pipe !== false) {
			for (let pipe of logPipes) {
				try {
					pipe(level, tag, msg, metadata)
				} catch (ex: any) {
					Logger.error('logger', ex, { pipe: false })
				}
			}
		}

		// In development, prettify HTTP logs
		if (process.env.NODE_ENV !== 'production' && tag === 'http') metadata = undefined

		loggerOfLevel[level](
			`\x1B[${colorOfLevel[level]}m[${level.toUpperCase()}]`,
			`[${tag.toUpperCase()}]`,
			msg,
			...(metadata ? [`\n${JSON.stringify(metadata, null, 2)}`] : []),
			'\x1B[0m'
		)
	}
}
