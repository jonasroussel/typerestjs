import { Server } from 'typerestjs'

const server = new Server()

server.enable('static', {
	root: 'public',
	prefix: '/',
})

server.enable('cors', {
	delegator: (req, callback) => {
		callback(null, {
			origin: req.headers.origin ?? '*',
			maxAge: 3600,
			credentials: true,
		})
	},
})

server.enable('cookie', {
	secret: 'super-secret-passphrase',
})

server.enable('rate-limit', {
	global: false,
})

server.start()
