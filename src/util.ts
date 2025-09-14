/* ---------------------------------------------------------------------------------------------- */
/*                                             Errors                                             */
/* ---------------------------------------------------------------------------------------------- */

export class AssertionError extends Error {
}

export function assert(condition: any, msg?: string): asserts condition {
	if (!condition)
		throw new AssertionError(msg);
}

/**
 * Assert that the current code path is unreachable.
 */
export function assertNever(): never {
	throw new AssertionError("Shouldn't happen.");
}


/**
 * Error class indicating a message that should be displayed directly to the user, such as through
 * a Notice or Modal.
 * @prop details - Additional error details to be displayed to user.
 * @prop context - Another Error instance that was the cause.
 */
export class UserError extends Error {
	public details: string | null;
	public context: Error | null;

	constructor(msg: string, { details, context}: {details?: string | null, context?: Error | null} = {}) {
		super(msg);
		this.details = details ?? null;
		this.context = context ?? null;
	}
}


/**
 * Get error string to display to user.
 * @param e - Error instance.
 * @param alternate - Alternate message to return if e is not a UserError.
 */
export function userErrorString(e: Error, alternate = '(internal error)'): string {
	return e instanceof UserError ? e.message : alternate;
}


/* ---------------------------------------------------------------------------------------------- */
/*                                              Types                                             */
/* ---------------------------------------------------------------------------------------------- */


/**
 * Check if a value is a regular object (not an array or null).
 */
export function isRegularObject(val: any): val is Exclude<object, Array<any> | null> {
	return typeof val === 'object' && !Array.isArray(val) && val !== null;
}


/**
 * Like Partial but also applies recursively to properties that are objects.
 *
 * https://stackoverflow.com/a/51365037/1775059
 */
export type RecursivePartial<T> = {
	[P in keyof T]?:
		T[P] extends (infer U)[] ? RecursivePartial<U>[] :
		T[P] extends object | undefined ? RecursivePartial<T[P]> :
		T[P];
};


/* ---------------------------------------------------------------------------------------------- */
/*                                              Misc                                              */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Merge properties of values + defaults, recursing into properties.
 */
export function recursiveDefaults<T extends object>(values: RecursivePartial<T>, defaults: T): T {
	const obj: Partial<T> = {};

	for (const key in defaults) {
		const dval = defaults[key];
		if (key in values) {
			const vval = values[key] as typeof dval;
			if (isRegularObject(dval) && isRegularObject(vval))
				// Recursive merge
				obj[key] = recursiveDefaults(vval, dval)
			else
				// Use given value
				obj[key] = vval;
		} else
			// Value missing, use default
			obj[key] = dval;
	}

	return obj as T;
}


/* ---------------------------------------------------------------------------------------------- */
/*                                             Strings                                            */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Split a string by the first instance of a delimiter, if it exists.
 */
export function splitFirst(s: string, delim: string | RegExp = /\s+/): [string, string | null] {

	if (delim instanceof RegExp) {
		const result = delim.exec(s);
		if (result)
			return [s.substring(0, result.index), s.substring(result.index + result[0].length)];
		else
			return [s, null];

	} else {
		const pos = s.indexOf(delim);
		if (pos < 0)
			return [s, null];
		else
			return [s.substring(0, pos), s.substring(pos + delim.length)];
	}
}
