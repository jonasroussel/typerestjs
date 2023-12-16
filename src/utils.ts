import type { ZodIssue } from 'zod'

import { Multipart, MultipartValue, SavedMultipartFile } from '@fastify/multipart'

export const DATE_REGEX = /^(\d{4})-0?(\d+)-0?(\d+)[T ]0?(\d+):0?(\d+)(:0?(\d+))?(\.(\d{3})Z?)?$/

/**
 * Checks if a value is a string in ISO date format (YYYY-MM-DDTHH:mm:ss.sssZ).
 *
 * @param value - The value to check.
 * @returns Whether the value is a string in ISO date format or not.
 */
export const isDateString = (value: any): boolean => {
	return value && typeof value === 'string' && DATE_REGEX.test(value)
}

/**
 * Checks if a string value is a number.
 *
 * @param value - The value to check.
 */
export const isNumber = (value: string): boolean => {
	if (typeof value === 'number') return value - value === 0
	if (typeof value === 'string' && value.trim() !== '') {
		return Number.isFinite ? Number.isFinite(+value) : isFinite(+value)
	}
	return false
}

/**
 * Parses dates in an object recursively and returns a new object with the same structure.
 *
 * @param obj - The object to parse dates in.
 * @returns A new object with the same structure as the input object but with all date strings converted to Date objects.
 */
export const parseDatesInObject = (obj: any): any => {
	if (obj === null || obj === undefined || typeof obj !== 'object') return obj

	const newBody: Record<string, any> = !Array.isArray(obj) ? {} : []

	for (const key of Object.keys(obj)) {
		const value = obj[key]

		if (isDateString(value)) newBody[key] = new Date(value)
		else if (typeof value === 'object') newBody[key] = parseDatesInObject(value)
		else newBody[key] = value
	}

	return newBody
}

/**
 * Parses a string value and returns the corresponding JavaScript data type.
 *
 * @param value - The string value to parse.
 * @returns The parsed value as a string, boolean, number, Date, or null.
 */
export const parseStringValue = (value: string): string | boolean | number | Date | null => {
	if (value === '') {
		return value
	} else if (value === 'true' || value === 'false') {
		return value === 'true'
	} else if (isNumber(value)) {
		if (value.includes('.')) return parseFloat(value)
		else return parseInt(value)
	} else if (value === 'null') {
		return null
	} else if (typeof value === 'string' && isDateString(value)) {
		return new Date(value)
	} else {
		return value
	}
}

/**
 * Returns the pathname of the input URL.
 *
 * @param input - The input URL.
 * @returns The pathname of the input URL.
 */
export const pathOf = (input?: string) => {
	if (!input) return
	try {
		const url = new URL(input.startsWith('/') ? `http://127.0.0.1${input}` : input)
		return url.pathname
	} catch (_) {}
}

/**
 * Checks if the input is a field in a multipart form.
 *
 * @param input - The input to be checked.
 * @returns A boolean value indicating whether the input is a field.
 */
export const isField = (input: Multipart): input is MultipartValue<string> => input.type === 'field'

/**
 * Checks if the input is a file in a multipart form.
 *
 * @param input - The input to be checked.
 * @returns A boolean value indicating whether the input is a file.
 */
export const isFile = (input: Multipart): input is SavedMultipartFile => input.type === 'file'

/**
 * Transforms an array of ZodIssues into a more simplified format.
 *
 * @param issues - The array of ZodIssues to be transformed.
 * @returns An array of transformed issues.
 */
export const exportIssues = (issues: ZodIssue[]) => {
	return issues.map((issue) => {
		const { path, code, message, ...rest } = issue

		return {
			field: path.join('.'),
			type: code,
			message: message,
			...rest,
		}
	})
}
