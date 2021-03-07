/**
 * Collection of general purpose methods to check variables/constants and object properties.
 * - encode/decode html entities
 * - convert to boolean, integer, milliseconds 
 * - validate variables/constants and object properties
 *
 * Can be used in other packages - needs PACKAGE_PREFIX for throws.
 * 
 *
 * @module Helper
 * 
 * @author Henning Klages
 * 
 * @since 2021-03-04
*/

'use strict'

const { PACKAGE_PREFIX, REGEX_3DIGITSSIGN } = require('./Globals.js')

const debug = require('debug')(`${PACKAGE_PREFIX}helper`)

module.exports = {

  /** Decodes specific HTML special characters such as "&lt;" and others. 
   * Works with multiple occurrences.
   * @param {string} htmlData the string to be decode, maybe empty
   * 
   * @returns {Promise<string>} decoded string
   * 
   * @throws {error} 'htmlData invalid/missing', 'htmlData is not string'
   */
  decodeHtmlEntity: async (htmlData) => {
    debug('method:%s', 'decodeHtmlEntity')
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

  /** Encodes specific HTML special characters such as "<"" and others.
   * Works with multiple occurrences.
   * @param {string} htmlData the string to be decode, maybe empty.
   * 
   * @returns {Promise<string>} encoded string
   * 
   * @throws {error} 'htmlData invalid/missing', 'htmlData is not string'
   */
  encodeHtmlEntity: async (htmlData) => {
    debug('method:%s', 'encodeHtmlEntity')
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
  
  /** Converts hh:mm:ss time to milliseconds. Does not check input!
   * No validation: hh 0 to 23, mm 0 to 59 ss 0 59, : must exist
   * Recommendation: do a regex check before calling this!
   * 
   * @param {string} hhmmss string in format hh:mm:ss
   * 
   * @returns {number} milliseconds as integer
   * 
   * @throws error if split does not find ':'
   */
  hhmmss2msec: (hhmmss) => {
    const [hours, minutes, seconds] = (hhmmss).split(':')
    return ((+hours) * 3600 + (+minutes) * 60 + (+seconds)) * 1000
  },

  /** Validates property and returns true|false if on|off (NOT case sensitive). 
   * 
   * @param {object} msg Node-RED message
   * @param {string} msg.propertyName item, to be validated
   * @param {string} propertyName property name
   * @param {string} propertyMeaning additional information, including in error message
   *
   * @returns {boolean} true/false if msg.property is "on/off" ! not case sensitive
   *
   * @throws {error} '* ${propertyName}) is missing/invalid', '* ${propertyName}) is not string',
   * '* ${propertyName}) is not on/off'
   * @throws {error} all methods
   */
  isOnOff: (msg, propertyName, propertyMeaning) => {
    debug('method:%s', 'validRegex')
    const path = []
    path.push(propertyName)
    if (!module.exports.isTruthyProperty(msg, path)) {
      throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} (${propertyName}) is missing/invalid`)
    }
    const value = msg[propertyName]
    if (typeof value !== 'string') {
      throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} (${propertyName}) is not string`)
    }
    if (!(value.toLowerCase() === 'on' || value.toLowerCase() === 'off')) {
      throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} (${propertyName}) is not on/off`)
    }
    return (value.toLowerCase() === 'on')
  },

  /** Validates and converts msg[propertyName] to number (integer). 
   * 
   * If defaultValue is NOT given then msg[propertyName] is required! Throws error if missing.
   * If defaultValue is given then msg[propertyName] is not required and default value is only used
   * in case msg[propertyName] is not "isValidProperty" (undefined, null, NaN). 
   * The defaultValue is not used in case of wrong type, not in range.
   * defaultValue should be in range min max (not checked). 
   * 
   * @param {object} msg Node-RED message
   * @param {(string|number)} msg.propertyName item, to be validated, converted
   * @param {string} propertyName property name
   * @param {number} min minimum
   * @param {number} max maximum, max > min
   * @param {string} propertyMeaning additional information, including in error message
   * @param {number} [defaultValue] integer, specifies the default value. 
   *
   * @returns {number} integer in range [min,max] or defaultValue
   *
   * @throws {error} '${propertyMeaning} min is not type number', 
   * '${propertyMeaning} max is not type number', 
   * '${propertyMeaning} max must be greater then min', '*${propertyName}) is missing/invalid', 
   * 'defaultValue is not type number', 'defaultValue is not integer', 
   * '${txtPrefix} is not type string/number', '${txtPrefix} is not integer',
   * '${value}) is not 3 signed digits only', '${value}) is out of range'
   * @throws {error} all methods
   */
  validToInteger: (msg, propertyName, min, max, propertyMeaning, defaultValue) => {
    debug('method:%s', 'validToInteger')
    // validate min max
    if (typeof min !== 'number') {
      throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} min is not type number`)
    } 
    if (typeof max !== 'number') {
      throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} max is not type number`)
    } 
    if (min >= max) {
      throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} max must be greater then min`)
    }
    
    // if defaultValue is missing an error will be throw in case property is not defined or missing
    const requiredProperty = (typeof defaultValue === 'undefined')
    const path = []
    path.push(propertyName)
    if (!module.exports.isTruthyProperty(msg, path)) {
      if (requiredProperty) {
        throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} (${propertyName}) is missing/invalid`)
      } else {
        // use defaultValue but check if valid
        if (typeof defaultValue !== 'number') {
          throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} defaultValue is not type number`)
        } 
        if (!Number.isInteger(defaultValue)) {
          throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} defaultValue is not integer`)
        }
        // no check in range to allow such as -1 to indicate no value given
        return defaultValue
      }
    }
    let value = msg[propertyName]
    const txtPrefix = `${PACKAGE_PREFIX} ${propertyMeaning} (msg.${propertyName})`

    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new Error(`${txtPrefix} is not type string/number`)
    }
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) {
        throw new Error(`${txtPrefix} is not integer`)
      }
    } else {
      // it is a string - allow signed/unsigned
      if (!REGEX_3DIGITSSIGN.test(value)) {
        throw new Error(`${txtPrefix} >>${value}) is not 3 signed digits only`)
      }
      value = parseInt(value)
    }
    if (!(value >= min && value <= max)) {
      throw new Error(`${txtPrefix} >>${value}) is out of range`)
    }
    return value
  },

  /** Validates msg[propertyName] against regex and returns that value or a default value.
   * 
   * If defaultValue is NOT given then msg[propertyName] is required! Throws error if missing.
   * If defaultValue is given then msg[propertyName] is not required and default value is only used
   * in case msg[propertyName] is not "isValidProperty" (undefined, null, NaN). 
   * The defaultValue is not used in case of wrong type, not in range.
   * defaultValue should be in range min max (not checked). 
   * 
   * @param {object} msg Node-RED message
   * @param {string} msg.propertyName item, to be validated - maximum 3 digits
   * @param {string} propertyName property name
   * @param {string} regex expression to evaluate string
   * @param {string} propertyMeaning additional information, including in error message
   * @param {string} [defaultValue] specifies the default value. If missing property is required.
   *
   * @returns {string} if defaultValue is NOT given then msg[propertyName] is required. 
   *
   * @throws {error} if msg[propertyName] is missing and defaultValue is undefined
   * @throws {error} msg[propertyName] is not of type string
   * @throws {error} if msg[propertyName] has invalid regex
   */
  validRegex: (msg, propertyName, regex, propertyMeaning, defaultValue) => {
    debug('method:%s', 'validRegex')
    // if defaultValue is missing and error will be throw in case property is not defined or missing
    const requiredProperty = (typeof defaultValue === 'undefined')
    const path = []
    path.push(propertyName)
    if (!module.exports.isTruthyProperty(msg, path)) {
      if (requiredProperty) {
        throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} (${propertyName}) is missing/invalid`)
      } else {
        // set default
        return defaultValue
      }
    }
    const value = msg[propertyName]
    const txtPrefix = `${PACKAGE_PREFIX} ${propertyMeaning} (${propertyName})`
    if (typeof value !== 'string') {
      throw new Error(`${txtPrefix} is not type string`)
    }
    if (!regex.test(value)) {
      throw new Error(`${txtPrefix} >>${value} wrong syntax. Regular expr. - see documentation`)
    }
    return value
  },

  /** Validates whether property is safely accessible and "truthy", any type.
   * truthy means not undefined, null, NaN, infinite - see method isTruthy.
   * @param {object} nestedObj object
   * @param {array<string>} pathArray property chain- must not be empty
   * 
   * @returns {boolean} property is accessible
   * 
   * @throws '2nd parameter is not array', '2nd parameter is empty array'
   * @throws {error} all methods
   */
  isTruthyProperty: (nestedObj, pathArray) => {
    debug('method:%s', 'isTruthyProperty')
    if (!Array.isArray(pathArray)) {
      throw new Error('2nd parameter is not array')
    }
    if (pathArray.length === 0) {
      throw new Error('2nd parameter is empty array')
    } 
    const property = pathArray.reduce(
      (obj, key) => (obj && obj[key] !== 'undefined' ? obj[key] : undefined),
      nestedObj
    )

    return module.exports.isTruthy(property)
  },

  /** Validates whether property is safely accessible and "truthy", type string, not empty
   * Truthy means not undefined, null, NaN, infinite - see method isTruthy.
   * 
   * @param {object} nestedObj object
   * @param {string[]} path path property chain- must not be empty, type string
   * 
   * @returns {boolean} property is accessible and not empty string
   * 
   * @throws '2nd parameter is not array', '2nd parameter is empty array'
   * @throws {error} all methods
   */
  isTruthyPropertyStringNotEmpty: (nestedObj, pathArray) => {
    debug('method:%s', 'isTruthyPropertyStringNotEmpty')
    if (!Array.isArray(pathArray)) {
      throw new Error('2nd parameter is not array')
    }
    if (pathArray.length === 0) {
      throw new Error('2nd parameter is empty array')
    } 
    const property = pathArray.reduce(
      (obj, key) => (obj && obj[key] !== 'undefined' ? obj[key] : undefined),
      nestedObj
    )

    return module.exports.isTruthyStringNotEmpty(property)
  },

  /** Validates whether an const/variable is "truthy", any type
   * Empty object/array allowed. NOT allowed: undefined or null or NaN or Infinite.
   *
   * @param {any} input const, variable
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
   * @throws none
   */
  isTruthy: (input) => {
    debug('method:%s', 'isTruthy')
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
   * @throws none
   * 
   * @since 2021-01-25
   */
  isTruthyStringNotEmpty: (input) => {
    debug('method:%s', 'isTruthyStringNotEmpty')
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
   * @throws none
   * 
   * @since 2021-01-25
   */
  isTruthyArray: (input) => {
    debug('method:%s', 'isTruthyArray')
    return !(typeof input === 'undefined' || input === null
      //this avoids NaN, positive, negative Infinite, not empty string
      || (typeof input === 'number' && !Number.isFinite(input))
      || !Array.isArray(input))
  },

  /** Gets the property value specified by path. Use isTruthyProperty before!
   * 
   * @param {object} nestedObj object
   * @param {array<string>} path path property chain- must not be empty
   * 
   * @returns {any} value of that property
   * 
   * @throws none
   * 
   * Source: https://dev.to/flexdinesh/accessing-nested-objects-in-javascript--9m4
   * pass in your object structure as array elements
   * const name = getNestedProperty(user, ['personalInfo', 'name']);
   * to access nested array, just pass in array index as an element the path array.
   * const city = getNestedProperty(user, ['personalInfo', 'addresses', 0, 'city']);
   * this will return the city from the first address item.
   */
  getNestedProperty: (nestedObj, pathArray) => {
    return pathArray.reduce((obj, key) => obj[key], nestedObj)
  }
}
