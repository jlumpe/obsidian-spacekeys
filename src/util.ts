export class AssertionError extends Error {
}

export function assert(condition: any, msg?: string): asserts condition {
	if (!condition)
		throw new AssertionError(msg);
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
