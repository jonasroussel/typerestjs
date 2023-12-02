import { Handler } from 'typerestjs'
import { HelloSchema } from './hello.schema.js'
import { HelloService } from './hello.service.js'

export namespace HelloController {
	/**
	 * @GET /hello/:name
	 */
	// @ts-ignore
	export const greeting: Handler<HelloSchema.greeting> = async (req, reply) => {
		const msg = HelloService.sayHello(req.params.name)

		return msg
		// return reply.success(200, msg)
	}
}
