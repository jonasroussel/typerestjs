import { Server } from 'typerestjs'

const server = new Server()

await server.enable('telemetry', {
	serviceName: 'example',
	serviceVersion: '1.0.0',
})

server.start()
