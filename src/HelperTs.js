/**
 * Collection of general purpose REGEX strings and methods not being related to SOAP or SONOS.
 *
 * @module Helpers
 * 
 * @author Henning Klages
 * 
 * @since 2020-11-21
*/

'use strict'

const debug = require('debug')('nrcsp:HelperTs')

module.exports = {

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
  encodeHtmlEntityTs: async (htmlData) => {
    debug('method >>%s', 'encodeHtmlEntityTs')
    if (!module.exports.isTruthyTs(htmlData)) {
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
  decodeHtmlEntityTs: async (htmlData) => {
    debug('method >>%s', 'decodeHtmlEntityTs')
    if (!module.exports.isTruthyTs(htmlData)) {
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
  isTruthyPropertyTs: (nestedObj, pathArray) => {
    
    const property = pathArray.reduce(
      (obj, key) => (obj && obj[key] !== 'undefined' ? obj[key] : undefined),
      nestedObj
    )

    return module.exports.isTruthyTs(property)
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
  isTruthyPropertyStringNotEmptyTs: (nestedObj, pathArray) => {
    
    const property = pathArray.reduce(
      (obj, key) => (obj && obj[key] !== 'undefined' ? obj[key] : undefined),
      nestedObj
    )

    return module.exports.isTruthyStringNotEmptyTs(property)
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
  isTruthyTs: (input) => {

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
  isTruthyStringNotEmptyTs: (input) => {
    
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
  isTruthyArrayTs: (input) => {
    
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
  getNestedPropertyTs: (nestedObj, pathArray) => {
    return pathArray.reduce((obj, key) => obj[key], nestedObj)
  }
}
