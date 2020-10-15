'use strict'

module.exports = {
  // data to be used in other modules

  ERROR_CODES: require('./Soap-Error-Codes.json'),

  PLAYER_WITH_TV: ['Sonos Beam', 'Sonos Playbar', 'Sonos Playbase', 'Sonos Arc'],

  REGEX_TIME: /([0-1][0-9]):([0-5][0-9]):([0-5][0-9])/, // Only hh:mm:ss and hours from 0 to 19
  REGEX_TIME_DELTA: /^[-+]?([0-1][0-9]):([0-5][0-9]):([0-5][0-9])/, // Only +/- hh:mm:ss
  REGEX_IP: /^(?:(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(\.(?!$)|$)){4}$/,
  REGEX_SERIAL: /^([0-9a-fA-F][0-9a-fA-F]-){5}[0-9a-fA-F][0-9a-fA-F]:/, // the end might be improved
  REGEX_RADIO_ID: /^[s][0-9]+$/,
  REGEX_2DIGITS: /^\d{1,2}$/,
  REGEX_3DIGITS: /^\d{1,3}$/,
  REGEX_2DIGITSSIGN: /^[-+]?\d{1,2}$/,
  REGEX_3DIGITSSIGN: /^[-+]?\d{1,3}$/,
  REGEX_ANYCHAR: /.+/,
  REGEX_QUEUEMODES: /^(NORMAL|REPEAT_ONE|REPEAT_ALL|SHUFFLE|SHUFFLE_NOREPEAT|SHUFFLE_REPEAT_ONE)$/i,
  REGEX_CSV: /^([a-zA-Z0-9äöüÄÖÜ]+)([ -]){0,1}([a-zA-Z0-9äöüÄÖÜ]+)(,([a-zA-ZäöüÄÖÜ0-9]+)([ -]){0,1}([a-zA-Z0-9äöüÄÖÜ]+))*$/,

  NRCSP_ERRORPREFIX: 'n-r-c-s-p: ',
  NODE_SONOS_ERRORPREFIX: 'upnp: ', // all errors from services _requests
  NODE_SONOS_UPNP500: 'upnp: statusCode 500 & upnpErrorCode ', // only those with 500 (subset)

  // functions to be used in other modules

  /** Starts async discovery of SONOS player and returns ipAddress - used in callback.
   * @param  {object} node current node
   * @param  {string} serialNumber player serial number
   * @param  {function} callback function with parameter err, ipAddress
   * provides ipAddress or null (not found) and calls callback handling that.
   */
  discoverSonosPlayerBySerial: (node, serialNumber, callback) => {
    const sonos = require('sonos')

    node.debug('Start find SONOS player.')
    let ipAddress = null

    // define discovery, find matching player and return ip
    const searchTime = 4000 // in miliseconds
    node.debug('Start searching for players')
    let discovery = sonos.DeviceDiscovery({ timeout: searchTime })

    discovery.on('DeviceAvailable', sonosPlayer => {
      // serial number is in deviceDescription serialNum
      // ipAddress is in sonosPlayer.host
      sonosPlayer
        .deviceDescription()
        .then(data => {
          // compary serial numbers
          if (module.exports.isTruthyAndNotEmptyString(data.serialNum)) {
            if (data.serialNum.trim().toUpperCase() === serialNumber.trim().toUpperCase()) {
              node.debug('Found SONOS player based on serialnumber in device description.')
              if (module.exports.isTruthyAndNotEmptyString(sonosPlayer.host)) {
                // success
                node.debug('Got ipaddres from device.host.')
                ipAddress = sonosPlayer.host
                callback(null, ipAddress)
                node.debug('Cleanup disovery')
                if (module.exports.isTruthyAndNotEmptyString(discovery)) {
                  discovery.destroy()
                  discovery = null
                }
              } else {
                // failure
                throw new Error('Found player but invalid ip address')
              }
            } else {
              // continue awaiting next players
            }
          } else {
            // failure but ignore and awaiting next player
          }
          return true
        })
        .catch(error => {
          callback(error, null)
          node.debug('Cleanup disovery - error')
          if (module.exports.isTruthyAndNotEmptyString(discovery)) {
            discovery.destroy()
            discovery = null
          }
        })
    })

    // listener 'timeout' only once
    discovery.once('timeout', () => {
      node.debug('Received time out without finding any matching (serialnumber) SONOS player')
      // error messages in calling function
      callback(null, null)
    })
  },

  /** Show any error occuring during processing of messages in the node status and create node error.
   * @param  {object} node current node
   * @param  {object} msg current msg
   * @param  {Error object} error  standard node.js or created with new Error ('')
   * @param  {string} [functionName] name of calling function
   *
   * Method:
   * 1. Is the error a standard nodejs error? Indicator: .code exists
   * nodejs provides an error object with properties: .code, .message .name .stack
   * See https://nodejs.org/api/errors.html for more about the error object.
   * .code provides the best information.
   * See https://nodejs.org/api/errors.html#errors_common_system_errors
   *
   * 2. Is the error thrown in node-sonos - service _request? Indicator: .message starts with NODE_SONOS_ERRORPREFIX
   * see https://github.com/bencevans/node-sonos/blob/master/lib/services/Service.js   Service.prototype._request
   * The .message then contains either NODE_SONOS_ERRORPREFIX statusCode 500 & upnpErrorCode ' and the error.response.data
   * or NODE_SONOS_ERRORPREFIX error.message and /// and error.response.data
   *
   * 3. Is the error from this package? Indicator: .message starts with NRCSP_ERRORPREFIX
   *
   * 4. All other error throw inside all modules (node-sonos, axio, ...)
   */

  failure: (node, msg, error, functionName) => {
    node.debug(`Entering error handling from ${functionName}.`)
    let msgShort = 'unknown' // default text used for status message
    let msgDetails = 'unknown' // default text for error message in addition to msgShort
    if (module.exports.isValidPropertyNotEmptyString(error, ['code'])) {
      // 1. nodejs errors - convert into readable message
      if (error.code === 'ECONNREFUSED') {
        msgShort = 'Player refused to connect'
        msgDetails = 'Validate players ip address'
      } else if (error.code === 'EHOSTUNREACH') {
        msgShort = 'Player is unreachable'
        msgDetails = 'Validate players ip address / power on'
      } else if (error.code === 'ETIMEDOUT') {
        msgShort = 'Request timed out'
        msgDetails = 'Validate players IP address / power on'
      } else {
        // Caution: getOwn is neccessary for some error messages eg playmode!
        msgShort = 'nodejs error - contact developer'
        msgDetails = JSON.stringify(error, Object.getOwnPropertyNames(error))
      }
    } else {
      // Caution: getOwn is neccessary for some error messages eg playmode!
      if (module.exports.isValidPropertyNotEmptyString(error, ['message'])) {
        if (error.message.startsWith(module.exports.NODE_SONOS_ERRORPREFIX)) {
          // 2. node sonos upnp errors from service _request
          if (error.message.startsWith(module.exports.NODE_SONOS_UPNP500)) {
            const upnpErrorCode = module.exports.getErrorCodeFromEnvelope(error.message.substring(module.exports.NODE_SONOS_UPNP500.length))
            msgShort = `statusCode 500 & upnpError ${upnpErrorCode}`
            // TODO Notion Helper-Service
            msgDetails = module.exports.getErrorMessageV1(upnpErrorCode, module.exports.ERROR_CODES.UPNP, '') // only UPNP errors
          } else {
            // unlikely as all UPNP errors throw 500
            msgShort = 'statusCode NOT 500'
            msgDetails = `upnp envelope: ${error.message}`
          }
        } else if (error.message.startsWith(module.exports.NRCSP_ERRORPREFIX)) {
          // 3. my thrown errors
          msgDetails = 'none'
          msgShort = error.message.replace(module.exports.NRCSP_ERRORPREFIX, '')
        } else {
          // Caution: getOwn is neccessary for some error messages eg playmode!
          msgShort = error.message
          msgDetails = JSON.stringify(error, Object.getOwnPropertyNames(error))
        }
      } else {
        // 4. all the others
        msgShort = 'Unknown error/ exception -see node.error'
        msgDetails = JSON.stringify(error, Object.getOwnPropertyNames(error))
      }
    }

    node.error(`${functionName}:${msgShort} :: Details: ${msgDetails}`, msg)
    node.status({
      fill: 'red',
      shape: 'dot',
      text: `error: ${functionName} - ${msgShort}`
    })
  },

  /** show warning status and warn message
   * @param  {object} node current node
   * @param  {string} functionName name of calling function
   * @param  {string} messageShort  short message for status
   * @param  {string} messageDetail  details
   */
  warning: (node, functionName, messageShort, messageDetail) => {
    node.debug(`Entering warning handling from ${functionName}`)
    node.warn(`Just a warning: ${functionName} - ${messageShort} :: Details: ` + messageDetail)
    node.status({
      fill: 'blue',
      shape: 'dot',
      text: `warning: ${functionName} - ${messageShort}`
    })
  },

  /** processing of msg was successful
   * @param  {object} node current node
   * @param  {object} msg current msg (maybe null)
   * @param  {string} functionName name of calling function
   */

  success: (node, msg, functionName) => {
    node.send(msg)
    node.status({ fill: 'green', shape: 'dot', text: `ok:${functionName}` })
    node.debug(`OK: ${functionName}`)
  },

  /** Validates whether property is safely accessable - empty string allowed
   * @param  {object} nestdObj object
   * @param  {array} path array with the property chain- should be non empty
   * @outputs {boolean} property exists
   */
  isValidProperty: (nestedObj, pathArray) => {
    const property = pathArray.reduce(
      (obj, key) => (obj && obj[key] !== 'undefined' ? obj[key] : undefined),
      nestedObj
    )
    return module.exports.isTruthy(property)
  },

  /** Validates whether property is safely accessable - empty string NOT allowed
   * @param  {object} nestdObj object
   * @param  {array} path array with the property chain- should be non empty
   */
  isValidPropertyNotEmptyString: (nestedObj, pathArray) => {
    const property = pathArray.reduce(
      (obj, key) => (obj && obj[key] !== 'undefined' ? obj[key] : undefined),
      nestedObj
    )
    return module.exports.isTruthyAndNotEmptyString(property)
  },

  /** Validates whether property exists and is string on/off (Not case sentive)
   * @param  {object} message Node-RED message
   * @param  {string} property property name
   * @param  {string} propertyMeaning additional information
   * @param  {string} packageName package name
   *
   * @return {boolean} true (on), false (off)
   *
   * @throws if is missing/invalid, not string, not on/off NOT case sensitive
   *
   */
  isOnOff: (message, property, propertyMeaning, packageName) => {
    const path = []
    path.push(property)
    if (!module.exports.isValidProperty(message, path)) {
      throw new Error(`${packageName} ${propertyMeaning} (${property}) is missing/invalid`)
    }
    const value = message[property]
    if (typeof value !== 'string') {
      throw new Error(`${packageName} ${propertyMeaning} (${property}) is not string`)
    }
    if (!(value.toLowerCase() === 'on' || value.toLowerCase() === 'off')) {
      throw new Error(`${packageName} ${propertyMeaning} (${property}) is not on/off`)
    }
    return (value.toLowerCase() === 'on')
  },

  /** Validates value and returns integer if string/number and in range.
   * @param  {object} message Node-RED message
   * @param  {string} property property name (string maximum 3 digits)
   * @param  {number} min minimum
   * @param  {number} max maximum
   * @param  {string} propertyMeaning additional information
   * @param  {string} packageName package name
   * @param  {number} [defaultValue] specifies the default value. If missing property is required == throw error
   *
   * @return {promise} type number but integer in range [min,max]
   *
   * @throws if is missing/invalid, not number/string, not integer, not in range
   *
   */
  string2ValidInteger: (message, property, min, max, propertyMeaning, packageName, defaultValue) => {
    // if defaultValue is missing and error will be throw in case property is not defined or missing
    const requiredProperty = (typeof defaultValue === 'undefined')
    const path = []
    path.push(property)
    if (!module.exports.isValidProperty(message, path)) {
      if (requiredProperty) {
        throw new Error(`${packageName} ${propertyMeaning} (${property}) is missing/invalid`)
      } else {
        // set default
        return defaultValue
      }
    }
    let value = message[property]

    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new Error(`${packageName} ${propertyMeaning} (msg.${property}) is not type string/number`)
    }
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) {
        throw new Error(`${packageName} ${propertyMeaning} (msg.${property}) is not integer`)
      }
    } else {
      // it is a string - allow signed/unsigned
      if (!module.exports.REGEX_3DIGITSSIGN.test(value)) {
        throw new Error(`${packageName} ${propertyMeaning} (msg.${property} >>${value}) is not 3 signed digits only`)
      }
      value = parseInt(value)
    }
    if (!(value >= min && value <= max)) {
      throw new Error(`${packageName} ${propertyMeaning} (msg.${property} >>${value}) is out of range`)
    }
    return value
  },

  /** Validates string value against regex and returns string.
   * @param  {object} message Node-RED message
   * @param  {string} property property name (string maximum 3 digits)
   * @param  {string} regex expression to evaluate string
   * @param  {string} propertyMeaning additional information
   * @param  {string} packageName package name
   * @param  {string} [defaultValue] specifies the default value. If missing property is required == throw error
   *
   * @return {promise} string
   *
   * @throws if is missing/invalid, not number/string, not integer, not in range
   *
   */
  stringValidRegex: (message, property, regex, propertyMeaning, packageName, defaultValue) => {
    // if defaultValue is missing and error will be throw in case property is not defined or missing
    const requiredProperty = (typeof defaultValue === 'undefined')
    const path = []
    path.push(property)
    if (!module.exports.isValidProperty(message, path)) {
      if (requiredProperty) {
        throw new Error(`${packageName} ${propertyMeaning} (${property}) is missing/invalid`)
      } else {
        // set default
        return defaultValue
      }
    }
    const value = message[property]
    if (typeof value !== 'string') {
      throw new Error(`${packageName} ${propertyMeaning} (${property}) is not type string`)
    }
    if (!regex.test(value)) {
      throw new Error(`${packageName} ${propertyMeaning} (${property} >>${value}) has wrong syntax/regex >>${regex}`)
    }
    return value
  },

  // Source: https://dev.to/flexdinesh/accessing-nested-objects-in-javascript--9m4
  // pass in your object structure as array elements
  // const name = getNestedProperty(user, ['personalInfo', 'name']);
  // to access nested array, just pass in array index as an element the path array.
  // const city = getNestedProperty(user, ['personalInfo', 'addresses', 0, 'city']);
  // this will return the city from the first address item.
  getNestedProperty: (nestedObj, pathArray) => {
    return pathArray.reduce((obj, key) => obj[key], nestedObj)
  },

  /** Validates whether an constant/variable is "valid" - empty string allowed allowed
   * @param  {object} input const, variable, object
   * @outputs {boolean} valid
   *
   *  All the following are false - same for constants.
   *  let input; let input = null; let input = undefined; let input = NaN; let input = 1.0 / 0; let input = -1.0 / 0
   *  (typeof input === 'number' && !Number.isFinite(input)) avoids NaN, positive, negative Infinite
   *  but these are true: let input = []; let input = {};
   */
  isTruthy: input => {
    return !(typeof input === 'undefined' || input === null ||
      (typeof input === 'number' && !Number.isFinite(input)))
  },

  /** Validates whether an constant/variable is "valid" - empty string NOT allowed allowed
   * @param  {object} input const, variable, object
   * @outputs {boolean} valid
   *
   *  (typeof input === 'number' && !Number.isFinite(input)) avoids NaN, positive, negative Infinite
   *  all the following are false - same for constants.
   *  let input; let input = null; let input = undefined; let input = NaN; let input = 1 / 0; let input = -1 / 0, let input = '';
   *  but these are true: let input = []; let input = {};
   */
  isTruthyAndNotEmptyString: input => {
    return !(typeof input === 'undefined' || input === null ||
      (typeof input === 'number' && !Number.isFinite(input)) || input === '')
  },

  /** Converts hh:mm:ss time to milliseconds
   * @param  {string} hhmmss string in format hh:mm:ss
   * @outputs {number} milliseconds as integer
   */
  hhmmss2msec: (hhmmss) => {
    const [hours, minutes, seconds] = (hhmmss).split(':')
    return ((+hours) * 3600 + (+minutes) * 60 + (+seconds)) * 1000
  },

  /**  Get error code. If not found provide empty string.
   * @param  {string} data  upnp error resonse as envelope with <errorCode>xxx</errorCode>
   *
   * @return {string} error code
   */

  getErrorCodeFromEnvelope: data => {
    let errorCode = '' // default
    if (module.exports.isTruthyAndNotEmptyString(data)) {
      const positionStart = data.indexOf('<errorCode>') + '<errorCode>'.length
      const positionEnd = data.indexOf('</errorCode>')
      if (positionStart > 1 && positionEnd > positionStart) {
        errorCode = data.substring(positionStart, positionEnd)
      }
    }
    return errorCode.trim()
  },

  /**  Get error message from error code. If not found provide 'unknown error'.
   * @param  {string} errorCode
   * @param  {JSON} upnpErrorList - simple mapping .code .message
   * @param  {JSON} [serviceErrorList] - simple mapping .code .message
   *
   * @return {string} error text (from mapping code -  text)
   */

  getErrorMessageV1: (errorCode, upnpErrorList, serviceErrorList) => {
    const errorText = 'unknown error' // default
    if (module.exports.isTruthyAndNotEmptyString(errorCode)) {
      if (serviceErrorList !== '') {
        for (let i = 0; i < serviceErrorList.length; i++) {
          if (serviceErrorList[i].code === errorCode) {
            return serviceErrorList[i].message
          }
        }
      }
      for (let i = 0; i < upnpErrorList.length; i++) {
        if (upnpErrorList[i].code === errorCode) {
          return upnpErrorList[i].message
        }
      }
    }
    return errorText
  }
}
