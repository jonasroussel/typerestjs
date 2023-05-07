export namespace Logger {
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

	type Level = 'debug' | 'info' | 'warn' | 'error' | 'critical'
	type Tag = string

	export const debug = (tag: Tag, msg: string | Error, metadata?: any) => log('debug', tag, msg, metadata)
	export const info = (tag: Tag, msg: string | Error, metadata?: any) => log('info', tag, msg, metadata)
	export const warn = (tag: Tag, msg: string | Error, metadata?: any) => log('warn', tag, msg, metadata)
	export const error = (tag: Tag, msg: string | Error, metadata?: any) => log('error', tag, msg, metadata)
	export const crit = (tag: Tag, msg: string | Error, metadata?: any) => log('critical', tag, msg, metadata)

	export const log = (level: Level, tag: Tag, msg: string | Error, metadata?: any) => {
		if (msg instanceof Error) {
			msg = `[${msg.name}] ${msg.message}\n${msg.stack?.split('\n').slice(1).join('\n') ?? ''}`
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
