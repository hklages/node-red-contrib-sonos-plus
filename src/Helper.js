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

const { PACKAGE_PREFIX, REGEX_4DIGITSSIGN, VALIDATION_INTEGER_MAXIMUM, VALIDATION_INTEGER_MINIMUM,
  REGEX_TIME_24
} = require('./Globals.js')

const debug = require('debug')(`${PACKAGE_PREFIX}helper`)

module.exports = {

  /** Decodes specific HTML special characters such as "&lt;" and others. 
   * Works with multiple occurrences.
   * @param {string} htmlData the string to be decode, maybe empty
   * 
   * @returns {"Promise<string>"} decoded string
   * 
   * @throws {error} 'htmlData invalid/missing', 'htmlData is not string'
   */
  decodeHtmlEntity: async (htmlData) => {
    debug('method:%s', 'decodeHtmlEntity')
    debug('htmlData: %s', htmlData)
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
   * @returns {"Promise<string>"} encoded string
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

  /** Provides an array of satellite UUID's of HTSatChanMapSet (not the subwoofer SW).
   * @param {string} mapString string from HTSatChanMapSet
   * 
   * @returns {"Promise<array of strings>"} array of string with satellite UUIDs, length 1 to 2
   * 
   * @throws {error} 
   * 
   */
  // Example
  // eslint-disable-next-line max-len
  // RINCON_48A6B8B5614E01400:LF,RF;RINCON_38420B92ABE601400:RR;RINCON_7828CA042C8401400:LR;RINCON_542A1B108A6201400:SW
   
  extractSatellitesUuids: async (mapString) => {
    debug('method:%s', 'extractSatellitesUuids')

    if (!module.exports.isTruthy(mapString)) {
      throw new Error('invalid parameter - invalid/missing')
    }
    if (typeof mapString !== 'string') {
      throw new Error('invalid parameter - is not string')
    }
    
    if (!mapString.includes(';')) {
      throw new Error('invalid parameter - no satellites (missing ;)')
    }
    const uuidsPlusChannel = mapString.split(';')
    const satellitesUuids = uuidsPlusChannel.filter((item) => {
      return item.includes(':LR')||item.includes(':RR')
    })
    if (!(satellitesUuids.length >= 1 && satellitesUuids.length <= 2)) {
      throw new Error('invalid parameter -  number of satellites')
    }
    
    // removing :LR and :RR
    return satellitesUuids.map((item) => {
      return item.replace(/:LR|:RR/, '')
    }) 
  },

  /** Returns the UUID of the subwoofer.
   * @param {string} mapString string from HTSatChanMapSet or channelMapSet
   * 
   * @returns {"Promise<string>"} subwoofer UUID
   * 
   * @throws {error} 
   * 
   */
  // Example
  // eslint-disable-next-line max-len
  // RINCON_48A6B8B5614E01400:LF,RF;RINCON_38420B92ABE601400:RR;RINCON_7828CA042C8401400:LR;RINCON_542A1B108A6201400:SW
   
  extractSubwooferUuid: async (mapString) => {
    debug('method:%s', 'extractSubwooferUuid')

    if (!module.exports.isTruthy(mapString)) {
      throw new Error('invalid parameter - invalid/missing')
    }
    if (typeof mapString !== 'string') {
      throw new Error('invalid parameter - is not string')
    }
    
    if (!mapString.includes(';')) {
      throw new Error('invalid parameter - no subwoofer (missing ;)')
    }
    const uuidsPlusChannel = mapString.split(';')
    const subwooferUuidArray = uuidsPlusChannel.filter((item) => {
      return item.includes(':SW')
    })
    if ((subwooferUuidArray.length !== 1)) {
      throw new Error('invalid parameter -  no subwoofer found')
    }
    
    // remove identifier :SW
    return subwooferUuidArray[0].replace(/:SW/, '')
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

  /** Validates and converts required msg[propertyName] to boolean. msg[propertyName] must 
   * exist, be On|on|Off|off. Throws errors if property is missing or invalid. 
   * 
   * @param {object} msg Node-RED message including msg[propertName] as string/integer
   * @param {string} propertyName property name to be validated
   *
   * @returns {boolean} true if On or on
   *
   * @throws {error} see code
   */
  validPropertyRequiredOnOff: (msg, propertyName) => {
    debug('method:%s', 'validPropertyRequiredOnOff')

    const path = [propertyName]
    if (!module.exports.isTruthyProperty(msg, path)) {
      throw new Error(`${PACKAGE_PREFIX} (${propertyName}) is missing/invalid`)
    }
    const value = msg[propertyName]
    if (typeof value !== 'string') {
      throw new Error(`${PACKAGE_PREFIX} (${propertyName}) is not string`)
    }
    if (!(value.toLowerCase() === 'on' || value.toLowerCase() === 'off')) {
      throw new Error(`${PACKAGE_PREFIX} (${propertyName}) is not on/off`)
    }
    return (value.toLowerCase() === 'on')
  },

  /** Validates and converts msg[propertyName] to number (integer). 
   * 
   * Exactly in that case, when the msg[propertyName] is optional, the defaultValue must be given:
   * - No defaultValue (= msg[propertyName] required): msg[propertyName] is returned (if valid)
   * - defaultValue exist: if msg[propertyName] exist it is used, otherwise defaultValue 
   * 
   * min, max should be in range VALIDATION_INTEGER_MINIMUM to VALIDATION_INTEGER_MAXIMUM
   * as that correspondent to REGEX check 4 signed digits
   * defaultValue and msg[propertyName] must be in range [min, max]
   * Exception: defaultValue may also be -1 and out of range: used for volume control
   *  
   * @param {object} msg Node-RED message
   * @param {(string|number)} msg.propertyName item, to be validated, converted
   * @param {string} propertyName property name
   * @param {number} min minimum, not greater 9999
   * @param {number} max maximum, not less -9999, max > min
   * @param {string} propertyMeaning additional information, being included in error message
   * @param {number} [defaultValue] integer, specifies the default value. 
   *
   * @returns {number} integer in range [min,max] or defaultValue
   *
   * @throws {error} see code
   * @throws {error} all methods
   */
  validToInteger: (msg, propertyName, min, max, propertyMeaning, defaultValue) => {
    debug('method:%s', 'validToInteger')
    // validate min max
    if (typeof min !== 'number' || min < VALIDATION_INTEGER_MINIMUM) {
      throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} min is not type number or less -9999`)
    } 
    if (typeof max !== 'number' || max > VALIDATION_INTEGER_MAXIMUM) {
      throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} max is not type number or bigger 9999`)
    } 
    if (min >= max) {
      throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} max is not greater then min`)
    }
    
    // if defaultValue is not given then msg[propertyName] is required and being used
    //   else if msg[propertyName] exist then it is being used
    //     else default is being used
    const txtPrefix = `${PACKAGE_PREFIX} ${propertyMeaning} (msg.${propertyName})`
    
    // does defaultValue exist? if yes validate
    const isPropertyRequired = (typeof defaultValue === 'undefined')
    if (!isPropertyRequired) {
      if (typeof defaultValue !== 'number') {
        throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} defaultValue is not type number`)
      } 
      if (!Number.isInteger(defaultValue)) {
        throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} defaultValue is not integer`)
      }
      if (!((defaultValue >= min && defaultValue <= max) || defaultValue === -1)) {
        throw new Error(`${txtPrefix} >>${defaultValue} is out of range`)
      }
    }
    
    // does propertyName exist? if yes validate and store in integerValue
    const path = []
    path.push(propertyName)
    const propertyNameExists = module.exports.isTruthyProperty(msg, path)
    let validValue
    if (propertyNameExists) {
      const value = msg[propertyName]
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error(`${txtPrefix} is not type string/number`)
      }
      if (typeof value === 'string') {
        if (!REGEX_4DIGITSSIGN.test(value)) {
          throw new Error(`${txtPrefix} >>${value}) is not 4 signed digits only`)
        }
        validValue = parseInt(value)
      } else { // must be number
        validValue = value
      }
      if (!Number.isInteger(validValue)) {
        throw new Error(`${txtPrefix} is not integer`)
      }
      if (!(validValue >= min && validValue <= max)) {
        throw new Error(`${txtPrefix} >>${value} is out of range`)
      }
    }
    // if exist then integerValue is valid integer (otherwise errors have been thrown)
    
    if (isPropertyRequired) {
      if (propertyNameExists) {
        
        return validValue  
      } else {
        throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} (${propertyName}) is missing/invalid`)
      }
    } else {
      
      return (propertyNameExists ? validValue : defaultValue)
    }
    
  },

  /** Validates and converts required msg[propertyName] to number(integer). msg[propertyName] must 
   * exist, be string/ integer in range [min, max]. Throws errors if property is missing or invalid.
   * 
   * min, max should be in range VALIDATION_INTEGER_MINIMUM to VALIDATION_INTEGER_MAXIMUM
   * as that correspondent to REGEX check 4 signed digits
   *  
   * @param {object} msg Node-RED message including msg[propertName] as string/integer
   * @param {string} propertyName property name, value to be verified
   * @param {number} min minimum, not greater VALIDATION_INTEGER_MAXIMUM
   * @param {number} max maximum, not less VALIDATION_INTEGER_MINIMUM, max > min
   *
   * @returns {number} integer in range [min,max]
   *
   * @throws {error} see code
   * @throws {error} all methods
   */
  validPropertyRequiredInteger: (msg, propertyName, min, max) => {
    debug('method:%s', 'validPropertyRequiredInteger')
    
    // validate min max - developer information
    const txtPrefix = `${PACKAGE_PREFIX} (${propertyName})`
    if (typeof min !== 'number' || min < VALIDATION_INTEGER_MINIMUM) {
      throw new Error(`${PACKAGE_PREFIX} min is not type number or less VALIDATION_INTEGER_MINIMUM`)
    } 
    if (typeof max !== 'number' || max > VALIDATION_INTEGER_MAXIMUM) {
      // eslint-disable-next-line max-len
      throw new Error(`${PACKAGE_PREFIX} max is not type number or bigger VALIDATION_INTEGER_MAXIMUM`)
    } 
    if (min >= max) {
      throw new Error(`${PACKAGE_PREFIX} max is not greater then min`)
    }
    
    // property exists?
    if (!module.exports.isTruthyProperty(msg, [propertyName])) {
      throw new Error(`${txtPrefix} is missing`)
    }

    let validValue
    const value = msg[propertyName]
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(`${txtPrefix} is not type string/number`)
    }
    if (typeof value === 'string') {
      if (!REGEX_4DIGITSSIGN.test(value)) {
        throw new Error(`${txtPrefix} >>${value}) is not 4 signed digits`)
      }
      validValue = parseInt(value)
    } else { // as it is not string it must be number
      validValue = value
    }
    if (!Number.isInteger(validValue)) {
      throw new Error(`${txtPrefix} is not integer`)
    }
    if (!(validValue >= min && validValue <= max)) {
      throw new Error(`${txtPrefix} >>${value} is out of range`)
    }
      
    return validValue
        
  },

  /** Returns the msg[propertyName] value if exist or the defaultValue. 
   * Throws an error if msg[propertyName] is not boolean.
   * 
   * @param {object} msg Node-RED message object with msg[propertyName]
   * @param {string} propertyName property name
   * @param {boolean} defaultValue
   *
   * @returns {boolean} value of msg[propertName] if exist and boolean or default, if not exist
   *
   * @throws {error} ${txtPrefix} is not boolean,
   */
  validPropertyOptionalBoolean: (msg, propertyName, defaultValue) => {
    debug('method:%s', 'validPropertyOptionalBoolean')
    const txtPrefix = `${PACKAGE_PREFIX} (${propertyName}`
   
    let validatedValue = defaultValue
    if (module.exports.isTruthyProperty(msg, [propertyName])) {
      const value = msg[propertyName]
      if (typeof value !== 'boolean') {
        throw new Error(`${txtPrefix}) is not boolean`)
      }
      validatedValue = value
    } 

    return validatedValue
  },

  /** Validates msg[propertyName] is a Time at hh:mm:ss format. 
   *  
   * @param {object} msg Node-RED message
   * @param {(string|number)} msg.propertyName item, to be validated
   * @param {string} propertyName property name
   * @param {string} propertyMeaning additional information, being included in error message
   *
   * @returns {string} the valid time in hh:mm:ss format
   *
   * @throws {error} see code
   * @throws {error} all methods
   */
  validTime: (msg, propertyName, propertyMeaning) => {
    debug('method:%s', 'validTime')
      
    // does propertyName exist? if yes validate and store the time
    const path = []
    path.push(propertyName)
    const propertyNameExists = module.exports.isTruthyProperty(msg, path)
    let validValue
    if (propertyNameExists) {
      const txtPrefix = `${PACKAGE_PREFIX} ${propertyMeaning} (msg.${propertyName})`
      const value = msg[propertyName]
  
      if (typeof value !== 'string') {
        throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning}  is not a string`)
      } 
      if (typeof value === 'string') {
        if (!REGEX_TIME_24.test(value)) {
          throw new Error(`${txtPrefix} >>${value} is not a valid time`)
        }
        validValue = value
      } 
          
    } else {
      throw new Error(`${PACKAGE_PREFIX} ${propertyMeaning} (${propertyName}) is missing/invalid`)
    }
  
    return validValue
  
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

  /** Validates msg[propertyName] and returns the value: 
   *  - must exist, be string, match regex - otherwise throws error
   * 
   * @param {object} msg Node-RED message with msg[propertyName]
   * @param {string} propertyName property name
   * @param {string} regex expression to evaluate string
   *
   * @returns {string} validated value 
   *
   * @throws {error} if msg[propertyName] is missing
   * @throws {error} msg[propertyName] is not of type string
   * @throws {error} if msg[propertyName] has invalid regex
   */
  validPropertyRequiredRegex: (msg, propertyName, regex) => {
    debug('method:%s', 'validPropertyRequiredRegex')
    const errorPrefix = `${PACKAGE_PREFIX} (${propertyName})`

    const path = [propertyName]
    if (!module.exports.isTruthyProperty(msg, path)) {
      throw new Error(`${errorPrefix} is missing`)
    }
    const value = msg[propertyName]
   
    if (typeof value !== 'string') {
      throw new Error(`${errorPrefix} is not type string`)
    }
    if (!regex.test(value)) {
      throw new Error(
        `${errorPrefix} >>${value} does not match regular expression -see documentation`
      ) 
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
