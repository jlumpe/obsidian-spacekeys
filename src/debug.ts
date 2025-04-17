/*
 * Tools for debugging.
 *
 * esbuild is configured to substitute the "debug-prod.ts" file for this one in a production
 * build.
 */


// False in production build
export const DEV = true;


// Super cool and fancy CSS formatting in console
const log_style = 'color: #8a5cf5; font-weight: bold';


// Using bind() rather than a wrapper preserves printing of the line number calling the function.
export const debug_log: (...args: any) => void = console.log.bind(null, '%cSpacekeys:', log_style);
