/*
 * Replacement for jest-raw-loader, which is not compatible with Jest v28+
 * See https://jestjs.io/docs/code-transformation
 */

module.exports = {
  process: (content) => { return {code: "module.exports = " + JSON.stringify(content)}; },
};
