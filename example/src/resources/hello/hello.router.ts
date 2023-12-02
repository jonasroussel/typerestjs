import { Route } from 'typerestjs'
import { HelloController } from './hello.controller.js'
import { HelloSchema } from './hello.schema.js'
import { AuthMiddleware } from '../../middlewares/auth.middleware.js'

export namespace HelloRouter {
	export const PREFIX = '/hello'

	/**
	 * @GET /hello/:name
	 */
	export const greeting: Route<HelloSchema.greeting> = {
		method: 'GET',
		path: '/:name',
		middlewares: [AuthMiddleware.connected()],
		schema: HelloSchema.greeting,
		handler: HelloController.greeting,
	}
}
