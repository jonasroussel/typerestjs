import { FastifyError, FastifyReply } from 'fastify'

import { Logger } from './logger.js'
import { RequestError, ResponseError } from './server.js'
import { ServerReply } from './types.js'
import { exportIssues } from './utils.js'

/**
 * Wraps the FastifyReply object to provide custom reply methods.
 *
 * @param reply - The FastifyReply object to be wrapped.
 * @returns An object with custom reply methods.
 */
export const replyWrapper = (reply: FastifyReply): ServerReply<any> => {
	return {
		success: (...[status, result]) => {
			let intStatus = typeof status === 'number' ? status : parseInt(status.toString())
			if (Number.isNaN(status)) intStatus = 200

			return reply.status(intStatus).send({
				success: true,
				data: result,
			})
		},

		error: (status, type, message) => {
			let intStatus = typeof status === 'number' ? status : parseInt(status.toString())
			if (Number.isNaN(status) || intStatus < 400) intStatus = 400

			return reply.status(intStatus).send({
				success: false,
				error: {
					type: type,
					message: message,
				},
			})
		},

		custom: () => reply,

		html: (input) => reply.header('Content-Type', 'text/html').send(typeof input === 'string' ? input : input.render()),
	}
}

/**
 * Replies with a "bad request" error indicating an issue with the request.
 *
 * @param error - The RequestError object representing the error.
 * @param reply - The FastifyReply object used to send the response.
 * @param metadata - Additional metadata associated with the error (optional).
 */
export const replyBadRequest = (error: RequestError, reply: FastifyReply, metadata?: any) => {
	const response = {
		success: false,
		error: {
			type: 'bad_request',
			message: 'Oops! Looks like there was a problem with your request.',
			details: exportIssues(error.issues),
		},
	}

	reply.error = error

	reply.status(400).send(response)
}

/**
 * Replies with a "bad response" error indicating an issue while generating the response.
 *
 * @param error - The ResponseError object representing the error.
 * @param reply - The FastifyReply object used to send the response.
 * @param metadata - Additional metadata associated with the error (optional).
 */
export const replyBadResponse = (error: ResponseError, reply: FastifyReply, metadata?: any) => {
	const response = {
		success: false,
		error: {
			type: 'bad_response',
			message: 'Something went wrong with your request while generating the response',
			details: exportIssues(error.issues),
		},
	}

	reply.error = error

	reply.status(500).send(response)
}

/**
 * Replies with a "file too large" error response.
 *
 * @param error - The FastifyError object representing the error.
 * @param reply - The FastifyReply object used to send the response.
 * @param metadata - Additional metadata associated with the error (optional).
 */
export const replyFileTooLarge = (error: FastifyError, reply: FastifyReply, metadata?: any) => {
	const response = {
		success: false,
		error: {
			type: 'file_too_large',
			message: "Oops! The file you're trying to upload is too large.",
		},
	}

	error.message = `Request file too large. (limit: ${metadata.limit} bytes)`

	reply.status(413).send(response)
}

/**
 * Replies with an unknown error response.
 *
 * @param error - The FastifyError object representing the error.
 * @param reply - The FastifyReply object used to send the response.
 * @param metadata - Additional metadata associated with the error (optional).
 */
export const replyUnknownError = (error: FastifyError, reply: FastifyReply, metadata?: any) => {
	const response = {
		success: false,
		error: {
			type: 'unknown_error',
			message: 'An unknown error has occurred during the request.',
		},
	}

	reply.error = error

	reply.status(500).send(response)
}
