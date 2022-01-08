/**
 * Collection of methods to handle the discovery of player.
 *
 * @module Discovery
 * 
 * @author Henning Klages
 * 
 * @since 2021-02-13
*/

'use strict'
const { PACKAGE_PREFIX } = require('./Globals.js')

const { getGroupsAll: getGroupsAll } = require('./Commands.js')

const { matchSerialUuid: matchSerialUuid, getDeviceProperties: getDeviceProperties
} = require('./Extensions.js')

const { SonosDeviceDiscovery, SonosDevice } = require('@svrooij/sonos/lib')
// testing SonosPlayerDiscovery and SonosDeviceDiscovery - what is more reliable?
const SonosPlayerDiscovery  = require('./Discovery-base-hk.js')

const debug = require('debug')(`${PACKAGE_PREFIX}discovery`)

module.exports = {

  /** Does an async discovery of SONOS player, compares with given serial number 
   * and returns ip address if success - otherwise throws error.
   * @param {string} serialNumber player serial number
   * @param {number} timeoutSeconds in seconds
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
  discoverSpecificSonosPlayerBySerial: async (serialNumber, timeoutSeconds) => {
    debug('method:%s', 'discoverSpecificSonosPlayerBySerial')
    const deviceDiscovery = new SonosDeviceDiscovery()
    const firstPlayerData = await deviceDiscovery.SearchOne(timeoutSeconds)
    debug('first player found')
    const tsFirstPlayer = new SonosDevice(firstPlayerData.host)
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
      new Error(`${PACKAGE_PREFIX} could not find any player matching serial`)
    }
    return reducedList[foundIndex].urlHost
  },

  /** Does an async discovery of SONOS player and returns list of objects
   * with properties label and value including the IP address = host.
   * 
   * @param {number} timeoutSeconds in seconds
   * 
   * @returns {Promise<object>} {'label', value}
   * 
   * @throws {error} all methods
   * 
   * Hint: discover the first one and retrieves all other player from that player.
   * Thats very reliable -deterministic. 
   * Discovering 10 player or more might be time consuming in some networks.
   */
  discoverAllPlayerWithHost: async (timeout) => {
    debug('method:%s', 'discoverAllPlayerWithHost')
    debug('timeout not used' + timeout)
    
    // TODO get experience, then consolidate
    const deviceDiscovery = new SonosPlayerDiscovery()
    const firstPlayerData = await deviceDiscovery.discoverOnePlayer()
    debug('first player found')
    const firstPlayer = new SonosDevice(firstPlayerData)
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
   * @param {number} timeoutSeconds in seconds
   * 
   * @returns {Promise<object>} {'label', value}
   * 
   * @throws {error} all methods
   * 
   * Hint: discover the first one and retrieves all other player from that player.
   * Thats very reliable -deterministic. 
   * Discovering 10 player or more might be time consuming in some networks.
   */
  discoverAllPlayerWithSerialnumber: async (timeout) => {
    debug('method:%s', 'discoverAllPlayerWithSerialnumber')
    const deviceDiscovery = new SonosDeviceDiscovery()
    const firstPlayerData = await deviceDiscovery.SearchOne(timeout)
    debug('first player found')
    const firstPlayer = new SonosDevice(firstPlayerData.host)
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