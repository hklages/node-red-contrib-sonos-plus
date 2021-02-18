/**
 * Collection of general purpose methods to check variables/constants and object properties.
 * Can be used in other packages because it has no relation to SONOS or Node-RED
 *
 * @module Helpers
 * 
 * @author Henning Klages
 * 
 * @since 2021-02-16
*/

'use strict'

const { PACKAGE_PREFIX } = require('./Globals.js')

const debug = require('debug')(`${PACKAGE_PREFIX}HelperTs`)

module.exports = {

  /** Converts hh:mm:ss time to milliseconds. Does not check input!
   * 
   * @param  {string} hhmmss string in format hh:mm:ss
   * 
   * @returns {number} milliseconds as integer
   * 
   * @throws nothing error if split does nt find :
   */
  hhmmss2msec: (hhmmss) => {
    const [hours, minutes, seconds] = (hhmmss).split(':')
    return ((+hours) * 3600 + (+minutes) * 60 + (+seconds)) * 1000
  },

  /** Encodes specific HTML special characters such as "<"" and others. 
   * Works with multiple occurrences.
   * @param  {string} htmlData the string to be decode, maybe empty.
   * 
   * @returns {Promise<string>} encoded string
   * 
   * @throws Error in case of htmlData is undefined, null, not a string
   * 
   * @since 2021-01-25
   */
  encodeHtmlEntity: async (htmlData) => {
    debug('method >>%s', 'encodeHtmlEntity')
    if (!module.exports.isTruthy(htmlData)) {
      throw new Error('htmlData invalid/missing')
    }
    if (typeof htmlData !== 'string') {
      throw new Error('htmlData is not string')
    }
    return htmlData.replace(/[<>"'&]/g, singleChar => {
      switch (singleChar) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case '\'': return '&apos;'
      case '&': return '&amp;'
      }
    })
  },
  
  /** Decodes specific HTML special characters such as "&lt;" and others. 
   * Works with multiple occurrences.
   * @param  {string} htmlData the string to be decode, maybe empty
   * 
   * @returns {Promise<string>} decoded string
   * 
   * @throws Error in case of htmlData is undefined, null, not a string
   * 
   * @since 2021-01-25
   */
  decodeHtmlEntity: async (htmlData) => {
    debug('method >>%s', 'decodeHtmlEntity')
    if (!module.exports.isTruthy(htmlData)) {
      throw new Error('htmlData invalid/missing')
    }
    if (typeof htmlData !== 'string') {
      throw new Error('htmlData is not string')
    }
    return String(htmlData).replace(/(&lt;|&gt;|&apos;|&quot;|&amp;)/g, substring => {
      switch (substring) {
      case '&lt;': return '<'
      case '&gt;': return '>'
      case '&apos;': return '\''
      case '&quot;': return '"'
      case '&amp;': return '&'
      }
    })
  },

  /** Validates whether property is safely accessible and "truthy", any type.
   * truthy means not undefined, null, NaN, infinite - see method isTruthy.
   * @param  {object} nestedObj object
   * @param  {array<string>} pathArray property chain- must not be empty
   * 
   * @returns {boolean} property is accessible
   * 
   * @throws error in case pathArray is not an array, non empty, elements string
   * @throws error in case nestedObj is not an object
   */
  isTruthyProperty: (nestedObj, pathArray) => {
    debug('method >>%s', 'isTruthyProperty')
    const property = pathArray.reduce(
      (obj, key) => (obj && obj[key] !== 'undefined' ? obj[key] : undefined),
      nestedObj
    )

    return module.exports.isTruthy(property)
  },

  /** Validates whether property is safely accessible and "truthy", type string, not empty
   * Truthy means not undefined, null, NaN, infinite - see method isTruthy.
   * 
   * @param  {object} nestedObj object
   * @param  {array<string>} path path property chain- must not be empty, type string
   * 
   * @returns {boolean} property is accessible and not empty string
   * 
   * @throws error in case of wrong arguments!
   */
  isTruthyPropertyStringNotEmpty: (nestedObj, pathArray) => {
    debug('method >>%s', 'isTruthyPropertyStringNotEmpty')
    const property = pathArray.reduce(
      (obj, key) => (obj && obj[key] !== 'undefined' ? obj[key] : undefined),
      nestedObj
    )

    return module.exports.isTruthyStringNotEmpty(property)
  },

  /** Validates whether an const/variable is "truthy", any type
   * Empty object/array allowed. NOT allowed: undefined or null or NaN or Infinite.
   *  
   * @param  {any} input const, variable
   * 
   * @returns {boolean} 
   * false: let input; let input = null; let input = undefined; let input = NaN; 
   * false: let input = 1.0 divide by 0; let input = -1.0 divide 0 (Infinite)
   * true: let input = {}, let input = {'a':1]}, let input = [], let input = ['a', 'b']
   * true: let input = true; let input = 1, let input = 100.5
   * true: let input = '', let input = 'Hello World'
   * 
   * @since 2021-01-25
   * 
   * @throws nothing
   */
  isTruthy: (input) => {
    debug('method >>%s', 'isTruthy')
    return !(typeof input === 'undefined' || input === null
      //this avoids NaN, positive, negative Infinite
      || (typeof input === 'number' && !Number.isFinite(input)))
  },

  /** Validates whether a constant/variable is "truthy", string, not empty.
   * Not valid : undefined or null or NaN or Infinite, all types except string
   * 
   * @param {any} input const, variable
   * 
   * @returns {boolean} 
   * false: let input; let input = null; let input = undefined; let input = NaN; 
   * false: let input = 1.0 divide by 0; let input = -1.0 divide 0 (Infinite)
   * false: let input = {},let input = {'a':1]}, let input = [], let input = ['a', 'b']
   * false: let input = true; let input = 1, let input = 100.5
   * false: let input = ''
   * true: non empty string
   * 
   * @throws nothing
   * 
   * @since 2021-01-25
   */
  isTruthyStringNotEmpty: (input) => {
    debug('method >>%s', 'isTruthyStringNotEmpty')
    return !(typeof input === 'undefined' || input === null
      //this avoids NaN, positive, negative Infinite, not empty string
      || (typeof input === 'number' && !Number.isFinite(input))
      || typeof input !== 'string' || input === '')
  },

  /** Validates whether a constant/variable is "truthy" and array.
   * Not valid : undefined or null or NaN or Infinite, all types except array
   * 
   * @param {any} input const, variable
   * 
   * @returns {boolean} 
   * false: let input; let input = null; let input = undefined; let input = NaN; 
   * false: let input = 1.0 divide by 0; let input = -1.0 divide 0 (Infinite)
   * false: let input = {},let input = {'a':1]}
   * false: let input = true; let input = 1, let input = 100.5
   * false: let input = '', let input = 'Hello World'
   * true: let input = [], let input = ['a', 'b']
   * 
   * @throws nothing
   * 
   * @since 2021-01-25
   */
  isTruthyArray: (input) => {
    debug('method >>%s', 'isTruthyArray')
    return !(typeof input === 'undefined' || input === null
      //this avoids NaN, positive, negative Infinite, not empty string
      || (typeof input === 'number' && !Number.isFinite(input))
      || !Array.isArray(input))
  },

  /** Gets the property value specified by path. Use isTruthyProperty before!
   * 
   * @param  {object} nestedObj object
   * @param  {array<string>} path path property chain- must not be empty
   * 
   * @returns {any} value of that property
   * 
   * @throws nothing
   */
  // Source: https://dev.to/flexdinesh/accessing-nested-objects-in-javascript--9m4
  // pass in your object structure as array elements
  // const name = getNestedProperty(user, ['personalInfo', 'name']);
  // to access nested array, just pass in array index as an element the path array.
  // const city = getNestedProperty(user, ['personalInfo', 'addresses', 0, 'city']);
  // this will return the city from the first address item.
  getNestedProperty: (nestedObj, pathArray) => {
    return pathArray.reduce((obj, key) => obj[key], nestedObj)
  }
}
