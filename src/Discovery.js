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

const { getGroupsAll: xGetGroupsAll } = require('./Commands.js')

const { matchSerialUuid: xMatchSerialUuid, getDeviceProperties: xGetDeviceProperties
} = require('./Extensions.js')

const { SonosDeviceDiscovery, SonosDevice } = require('@svrooij/sonos/lib')

const debug = require('debug')(`${PACKAGE_PREFIX}discovery`)

module.exports = {

  /** Does an async discovery of SONOS player, compares with given serial number 
   * and returns ip address if success - otherwise throws error.
   * @param  {string} serialNumber player serial number
   * @param  {number} timeoutSeconds in seconds
   * 
   * @returns {Promise<object>} {'uuid', urlHost} su
   * 
   * @throws error 'could not find any player matching serial'
   * @throws error from xGetGroupsAll, deviceDiscovery.SearchOne
   *
   */
  discoverSonosPlayerBySerial: async (serialNumber, timeoutSeconds) => {
    debug('method >>%s', 'discoverSonosPlayerBySerial')

    // discover the first one, then get all others from that player.
    // Thats very reliable -deterministic. Discovering 10 player might be time consuming
    // Sonos player knew best the topology
    const deviceDiscovery = new SonosDeviceDiscovery()
    const firstPlayerData = await deviceDiscovery.SearchOne(timeoutSeconds)
    const tsFirstPlayer = new SonosDevice(firstPlayerData.host)
    const allGroups = await xGetGroupsAll(tsFirstPlayer)
    const flatList = [].concat.apply([], allGroups) // merge array of array in array
    const reducedList = flatList.map((item) => { // only some properties
      return {
        'uuid': item.uuid,
        'urlHost': item.urlObject.hostname
      }
    })
    let foundIndex = -1 // not found as default
    for (let index = 0; index < reducedList.length; index++) {
      if (xMatchSerialUuid(serialNumber, reducedList[index].uuid)) {
        foundIndex = index
        break
      }
    }
    if (foundIndex < 0) {
      new Error(`${PACKAGE_PREFIX} could not find any player matching serial`)
    }
    return reducedList[foundIndex].urlHost
  },

  discoverPlayersHost: async () => {
    // discover the first one an get all others because we need also the player names
    // and thats very reliable -deterministic. Discovering 10 player might be time consuming
    // Sonos player knew best the topology
    const deviceDiscovery = new SonosDeviceDiscovery()
    const firstPlayerData = await deviceDiscovery.SearchOne(5)
    debug('first player found')
    const firstPlayer = new SonosDevice(firstPlayerData.host)
    const allGroups = await xGetGroupsAll(firstPlayer)
    const flatList = [].concat.apply([], allGroups)
    debug('got more players, in total >>%s', flatList.length)

    const reducedList = flatList.map((item) => {
      return {
        'label': item.playerName,
        'value': item.urlObject.hostname
      }
    })
    return reducedList
  },

  discoverPlayersSerialnumber: async () => {
    // discover the first one an get all others because we need also the player names
    // and thats very reliable -deterministic. Discovering 10 player might be time consuming
    // Sonos player knew best the topology
    debug('method >>%s', 'discoverPlayersSerialnumber')
    const deviceDiscovery = new SonosDeviceDiscovery()
    const firstPlayerData = await deviceDiscovery.SearchOne(5)
    debug('first player found')
    const firstPlayer = new SonosDevice(firstPlayerData.host)
    const allGroups = await xGetGroupsAll(firstPlayer)
    const flatList = [].concat.apply([], allGroups)
    debug('got more players, in total >>%s', flatList.length)

    debug('get the serial nummber for each player')
    for (let index = 0; index < flatList.length; index++) {
      const deviceProperties = await xGetDeviceProperties(flatList[index].urlObject)
      // TODO check existence
      flatList[index].serialNumber = deviceProperties.serialNum
    }

    const reducedList = flatList.map((item) => {
      return {
        'label': item.playerName,
        'value': item.serialNumber
      }
    })
    return reducedList
  }
    
}