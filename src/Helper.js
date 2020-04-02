'use strict'

module.exports = {
  // data to be used in other modules

  PLAYER_WITH_TV: ['Sonos Beam', 'Sonos Playbar', 'Sonos Playbase'],

  REGEX_TIME: /([0-1][0-9]):([0-5][0-9]):([0-5][0-9])/, // Only hh:mm:ss and hours from 0 to 19
  REGEX_IP: /^(?:(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(\.(?!$)|$)){4}$/,
  REGEX_SERIAL: /^([0-9a-fA-F][0-9a-fA-F]-){5}[0-9a-fA-F][0-9a-fA-F]:/, // the end might be improved
  REGEX_RADIO_ID: /^[s][0-9]+$/,

  // functions to be used in other modules

  /** Starts async discovery of sonos player and returns ipAddress - used in callback.
   * @param  {object} node current node
   * @param  {string} serialNumber player serial number
   * @param  {function} callback function with parameter err, ipAddress
   * provides ipAddress or null (not found) and calls callback handling that.
   */
  discoverSonosPlayerBySerial: (node, serialNumber, callback) => {
    const sonos = require('sonos')

    node.debug('Start find Sonos player.')
    let ipAddress = null

    // define discovery, find matching player and return ip
    const searchTime = 5000 // in miliseconds
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
              node.debug('Found sonos player based on serialnumber in device description.')
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
      node.debug('Received time out without finding any matching (serialnumber) sonos player')
      // error messages in calling function
      callback(null, null)
    })
  },

  /** processing of msg with failure.
   * @param  {object} node current node
   * @param  {object} msg current msg
   * @param  {Error object} error  error object from response
   * @param  {string} functionName name of calling function
   * @param  {string} messageShort  short message for status
   */
  failure: (node, msg, error, functionName) => {
    let msgShort = 'unknown' // default text
    let msgDetails = 'unknown' // default text
    node.debug(`Entering error handling from ${functionName}.`)
    node.debug(
      `Complete error message >>${JSON.stringify(error, Object.getOwnPropertyNames(error))}`
    )
    if (!module.exports.isTruthyAndNotEmptyString(error.code)) {
      // Caution: getOwn is neccessary for some error messages eg playmode!
      if (!module.exports.isTruthyAndNotEmptyString(error.message)) {
        msgDetails = JSON.stringify(error, Object.getOwnPropertyNames(error))
        msgShort = 'sonos-node / exception'
      } else {
        if (error.message.startsWith('n-r-c-s-p:')) {
          // handle my own error
          msgDetails = 'none'
          msgShort = error.message.replace('n-r-c-s-p: ', '')
        } else {
          // Caution: getOwn is neccessary for some error messages eg playmode!
          msgShort = error.message
          msgDetails = JSON.stringify(error, Object.getOwnPropertyNames(error))
        }
      }
    } else {
      if (error.code === 'ECONNREFUSED') {
        msgShort = 'can not connect to player - refused'
        msgDetails = 'Validate ip address of player'
      } else if (error.code === 'EHOSTUNREACH') {
        msgShort = 'can not connect to player- unreach'
        msgDetails = 'Validate ip address of player / power on'
      } else if (error.code === 'ETIMEDOUT') {
        msgShort = 'can not connect to player- time out'
        msgDetails = 'Validate IP address of player / power on'
      } else {
        // Caution: getOwn is neccessary for some error messages eg playmode!
        msgShort = 'sonos-node / exception'
        msgDetails = JSON.stringify(error, Object.getOwnPropertyNames(error))
      }
    }

    node.error(`${functionName} - ${msgShort} :: Details: ${msgDetails}`, msg)
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
    node.debug(`ok:${functionName}`)
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
    return typeof property !== 'undefined'
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
    return typeof property !== 'undefined' && property !== ''
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
  }
}
