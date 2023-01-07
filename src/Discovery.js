/**
 * Collection of methods to handle the discovery of player. 
 * Method: UDP SSD broadcast port 1900.
 *
 * @module Discovery
 * 
 * @author Henning Klages
 * 
 * @since 2023-01-05
*/

'use strict'
const { PACKAGE_PREFIX, ERROR_NOT_FOUND_BY_SERIAL } = require('./Globals.js')

const { getGroupsAll: getGroupsAll } = require('./Commands.js')

const { matchSerialUuid: matchSerialUuid, getDeviceProperties: getDeviceProperties
} = require('./Extensions.js')

const { SonosDevice } = require('@svrooij/sonos/lib')
// Using my own discovery as it is more reliable
const SonosPlayerDiscovery  = require('./Discovery-base-hk.js')

const debug = require('debug')(`${PACKAGE_PREFIX}discovery`)

module.exports = {

  /** Does an async discovery of SONOS player, compares with given serial number 
   * and returns ip address if success - otherwise throws error.
   * @param {string} serialNumber player serial number
   * 
   * @returns {Promise<object>} {'uuid', urlHost} su
   * 
   * @throws error 'could not find any player matching serial'
   * @throws {error} all methods
   * 
   * Hint: discover the first one and retrieves all other player from that player.
   * Thats very reliable -deterministic. 
   * Discovering 10 player or more might be time consuming in some networks.
   *
   */
  discoverSpecificSonosPlayerBySerial: async (serialNumber) => {
    debug('method:%s', 'discoverSpecificSonosPlayerBySerial')
    
    const deviceDiscovery = new SonosPlayerDiscovery()
    const firstPlayerIpv4 = await deviceDiscovery.discoverOnePlayer()
    debug('first player found')
    const tsFirstPlayer = new SonosDevice(firstPlayerIpv4)
    const allGroups = await getGroupsAll(tsFirstPlayer)
    const flatList = [].concat.apply([], allGroups) // merge array of array in array
    debug('got more players, in total >>%s', flatList.length)

    const reducedList = flatList.map((item) => { // only some properties
      return {
        'uuid': item.uuid,
        'urlHost': item.urlObject.hostname
      }
    })
    
    // Do avoid sending n getDeviceProperties we uses stripped mac address
    // uuid and serial number both include the mac address
    let foundIndex = -1 // not found as default
    for (let index = 0; index < reducedList.length; index++) {
      if (matchSerialUuid(serialNumber, reducedList[index].uuid)) {
        foundIndex = index
        break
      }
    }
    if (foundIndex < 0) {
      throw new Error(ERROR_NOT_FOUND_BY_SERIAL)
    }
    return reducedList[foundIndex].urlHost
  },

  /** Does an async discovery of SONOS player and returns list of objects
   * with properties label and value including the IP address = host.
   * 
   * 
   * @returns {Promise<object>} {'label', value}
   * 
   * @throws {error} all methods
   * 
   * Hint: discover the first one and retrieves all other player from that player.
   * Thats very reliable -deterministic. 
   * Discovering 10 player or more might be time consuming in some networks.
   */
  discoverAllPlayerWithHost: async () => {
    debug('method:%s', 'discoverAllPlayerWithHost')
    
    const deviceDiscovery = new SonosPlayerDiscovery()
    const firstPlayerIpv4 = await deviceDiscovery.discoverOnePlayer()
    debug('first player found')
    const firstPlayer = new SonosDevice(firstPlayerIpv4)
    const allGroups = await getGroupsAll(firstPlayer)
    const flatList = [].concat.apply([], allGroups)
    debug('got more players, in total >>%s', flatList.length)

    const reducedList = flatList.map((item) => {
      return {
        'label': `${item.urlObject.hostname} for ${item.playerName}`,
        'value': item.urlObject.hostname
      }
    })
    return reducedList
  },

  /** Does an async discovery of SONOS player and returns list of objects
   * with properties label and value including the serial number.
   * 
   * @returns {Promise<object>} {'label', value}
   * 
   * @throws {error} all methods
   * 
   * Hint: discover the first one and retrieves all other player from that player.
   * Thats very reliable -deterministic. 
   * Discovering 10 player or more might be time consuming in some networks.
   */
  discoverAllPlayerWithSerialnumber: async () => {
    debug('method:%s', 'discoverAllPlayerWithSerialnumber')
    
    const deviceDiscovery = new SonosPlayerDiscovery()
    const firstPlayerIpv4 = await deviceDiscovery.discoverOnePlayer()
    debug('first player found')
    const firstPlayer = new SonosDevice(firstPlayerIpv4)
    const allGroups = await getGroupsAll(firstPlayer)
    const flatList = [].concat.apply([], allGroups)
    debug('got more players, in total >>%s', flatList.length)

    for (let index = 0; index < flatList.length; index++) {
      const deviceProperties = await getDeviceProperties(flatList[index].urlObject)
      // we assume existence of that property
      flatList[index].serialNumber = deviceProperties.serialNum
    }

    const reducedList = flatList.map((item) => {
      return {
        'label': `${item.serialNumber} for ${item.playerName}`,
        'value': item.serialNumber
      }
    })
    return reducedList
  }
    
}