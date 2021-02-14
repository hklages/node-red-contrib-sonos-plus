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
const { getGroupsAllTs } = require('./Sonos-CommandsTs.js')
const { matchSerialUuid } = require('./HelperTs.js')

const { SonosDeviceDiscovery, SonosDevice } = require('@svrooij/sonos/lib')

const debug = require('debug')('nrcsp:Discovery')

module.exports = {

  /** Does an async discovery of SONOS player, compares with given serial number 
   * and returns ip address if success - otherwise throws error.
   * @param  {string} serialNumber player serial number
   * @param  {number} timeoutSeconds in seconds
   * 
   * @returns {Promise<object>} {'uuid', urlHost} su
   * 
   * @throws error 'could not find any player matching serial'
   * @throws error from getGroupsAllTs, deviceDiscovery.SearchOne
   *
   */
  discoverSonosPlayerBySerialTs: async (serialNumber, timeoutSeconds) => {
    debug('method >>%s', 'discoverSonosPlayerBySerialTs')

    // discover the first one, then get all others from that player.
    // Thats very reliable -deterministic. Discovering 10 player might be time consuming
    // Sonos player knew best the topology
    const deviceDiscovery = new SonosDeviceDiscovery()
    const firstPlayerData = await deviceDiscovery.SearchOne(timeoutSeconds)
    const tsFirstPlayer = new SonosDevice(firstPlayerData.host)
    const allGroups = await getGroupsAllTs(tsFirstPlayer)
    const flatList = [].concat.apply([], allGroups) // merge array of array in array
    const reducedList = flatList.map((item) => { // only some properties
      return {
        'uuid': item.uuid,
        'urlHost': item.url.hostname
      }
    })
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
  }
    
}