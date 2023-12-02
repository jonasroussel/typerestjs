import { Middleware } from 'typerestjs'

export namespace AuthMiddleware {
	export const connected = (): Middleware => {
		return async (req, reply) => {
			console.log('connected')
		}
	}
}
