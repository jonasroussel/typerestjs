/// <reference path="./jsx/elements.d.ts" />
/// <reference path="./jsx/events.d.ts" />
/// <reference path="./jsx/index.d.ts" />

type Primitive = number | string | Date | boolean | undefined | null
type Attributes = Record<string, Primitive>
type Child = JSX.Element | Primitive
type Children = Child[]

export interface Props {
	children?: Children
}
export type Component = (props?: Props) => JSX.Element
export type Element = JSX.Element

const esca: { [key: string]: string } = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	"'": '&#39;',
	'"': '&quot;',
}
const sanitize = (html: string) => {
	if (html === '') return ''
	return html.replace(/[&<>'"]/g, (m) => esca[m])
}

const toKebabCase = (name: string) => {
	return name.replace(
		/[A-Z]+(?![a-z])|[A-Z]/g,
		(match, idx, str) => (idx > 0 && str[idx - 1] !== '-' ? '-' : '') + match.toLowerCase()
	)
}

const attributesToString = (attributes: Attributes | undefined | null): string => {
	if (!attributes || Object.keys(attributes).length === 0) return ''

	return (
		' ' +
		Object.entries(attributes)
			.map(([key, value]) => {
				if (value === undefined || value === null) return ''
				else if (typeof value === 'boolean') return key
				else return `${key}="${value.toString().replace(/"/g, '&quot;')}"`
			})
			.join(' ')
	)
}

const childrenToString = (children: Children): string => {
	return children
		.map((child) => {
			if (typeof child === 'boolean' || child == null) return ''
			else if (typeof child === 'string') return sanitize(child)
			else if (Array.isArray(child)) return childrenToString(child)
			else if (typeof child === 'object' && child != null && 'render' in child) return child.render()
			else return child.toString()
		})
		.filter((child) => child !== '')
		.join('')
}

const isVoidElement = (tagName: string) => {
	return (
		[
			'area',
			'base',
			'br',
			'col',
			'command',
			'embed',
			'hr',
			'img',
			'input',
			'keygen',
			'link',
			'meta',
			'param',
			'source',
			'track',
			'wbr',
		].indexOf(tagName) > -1
	)
}

const toElement = (html: string) => {
	return {
		__html: html,
		render() {
			return this.__html
		},
	}
}

export function el(
	nameOrComponent: string | Component,
	attributes: Attributes | undefined | null,
	...children: Children
): JSX.Element {
	if (typeof nameOrComponent === 'function') {
		return nameOrComponent({ ...(attributes ?? {}), children })
	} else {
		const tagName = toKebabCase(nameOrComponent)

		if (isVoidElement(tagName)) {
			return toElement(`<${tagName}${attributesToString(attributes)}>`)
		} else {
			const { __innerhtml, __outerhtml, ...attrs } = attributes ?? {}

			if (__outerhtml) return toElement(__outerhtml.toString())

			const open = `<${tagName}${attributesToString(attrs)}>`
			const close = `</${tagName}>`

			if (__innerhtml) return toElement(open + __innerhtml.toString() + close)

			return toElement(open + childrenToString(children) + close)
		}
	}
}
