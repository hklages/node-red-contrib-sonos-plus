/**
 * Collection of simple commands based on executeAction.
 * It handles the communication above SOAP level
 *
 * @module Sonos-Extensions.js
 * 
 * @author Henning Klages
 * 
 * @since 2021-02-11
*/

'use strict'

const PACKAGE_PREFIX = 'nrcsp: '

const { executeActionV6, didlXmlToArray } = require('./Sonos-Commands.js')

const { isTruthyPropertyStringNotEmptyTs, isTruthyArrayTs, isTruthyTs, isTruthyPropertyTs
} = require('./HelperTs.js')

const request = require('axios')
const parser = require('fast-xml-parser')

const debug = require('debug')('nrcsp:Extensions')

module.exports = {

  //
  //                    SPECIAL COMMANDS
  //
  /** Get device properties.
  
   * @param {object} playerUrl player URL JavaScript build in
   *
   * @returns {Promise<object>} device properties as object
   *
   * @throws {error}  ???
   */
  xGetDeviceProperties: async function (playerUrl) {
    debug('method >>%s', 'xGetDeviceProperties')
    const endpoint = '/xml/device_description.xml'
    const response = await request({
      method: 'get',
      baseURL: playerUrl.origin,
      url: endpoint,
      headers: {
        'Content-type': 'text/xml; charset=utf8'
      }
    })
    if (!isTruthyTs(response)) {
      throw new Error(`${PACKAGE_PREFIX} invalid response from player - response`)
    }
    // TODO Test ECON ....
    let properties = {}
    if (!isTruthyPropertyStringNotEmptyTs(response, ['data'])) {
      throw new Error(`${PACKAGE_PREFIX} response from player is invalid - data missing`)
    }
    let clean = response.data.replace('<?xml', '<xml')
    clean = clean.replace('?>', '>')
    const attributeNamePrefix = '_'
    const parseNodeValue = false
    const options = { ignoreAttributes: false, attributeNamePrefix, parseNodeValue  }
    properties = await parser.parse(clean, options) 
    if (!isTruthyTs) {
      throw new Error(`${PACKAGE_PREFIX} xml parser: invalid response`)
    }
    if (!isTruthyPropertyTs(properties, ['xml', 'root', 'device'])) {
      throw new Error(`${PACKAGE_PREFIX} xml parser: device data missing`)
    }
    return properties.xml.root.device
  },

  //
  //                    COMPLEX COMMANDS - EXECUTE ACTION AND TRANSFORM
  //

  /** Get array of all SONOS-Queue items - maximum 200.
   * Adds processingType and playerUrlOrigin to artUri.
   * @param {object} playerUrl player URL - JavaScript build in
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-queue items, could be empty
   *
   * @throws {error} nrcsp: invalid return from Browse, didlXmlToArray error
   */
  xGetSonosQueue: async function (playerUrl) {
    const browseQueue = await executeActionV6(playerUrl,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'Q:0', BrowseFlag: 'BrowseDirectChildren', Filter: '*',
        StartingIndex: 0, RequestedCount: 200, SortCriteria: ''
      })
    if (!isTruthyPropertyStringNotEmptyTs(browseQueue, ['NumberReturned'])) {
      throw new Error(`${PACKAGE_PREFIX} invalid response Browse Q:0 - missing NumberReturned`)
    }
    
    let modifiedQueueArray = []
    if (browseQueue.NumberReturned !== '0') {
      if (!isTruthyPropertyStringNotEmptyTs(browseQueue, ['Result'])) {
        throw new Error(`${PACKAGE_PREFIX} invalid response Browse Q:0 - missing Result`)
      }
      // item
      const queueArray = await didlXmlToArray(browseQueue.Result, 'item')
      if (!isTruthyArrayTs(queueArray)) {
        throw new Error(`${PACKAGE_PREFIX} response form parsing Browse Q:0 is invalid.`)
      }

      // update artUri with playerUrl.origin and add proccesingType 'queue'
      modifiedQueueArray = queueArray.map((item) => {
        let  artUri = ''  
        if (isTruthyPropertyStringNotEmptyTs(item, ['artUri'])) {
          artUri = item['artUri']
          if (typeof artUri === 'string' && artUri.startsWith('/getaa')) {
            artUri = playerUrl.origin + artUri
          } 
        }
        item.artUri = artUri
        item.processingType = 'queue'
        return item
      })
    }
    return modifiedQueueArray
  },
  
  //
  //                    SIMPLE COMMANDS - EXECUTE ACTION AND SIMPLE TRANSFORMATION
  //
  //  @param  {object} playerUrl player URL (JavaScript build in )
  //  @returns always a promise
  //  @throws {error} from executeAction
  //
  //...............................................................................................
  
  // Get mute state of given player. values: on|off
  xGetMutestate: async function (playerUrl) {
    return (await executeActionV6(playerUrl,
      '/MediaRenderer/RenderingControl/Control', 'GetMute',
      { 'InstanceID': 0, 'Channel': 'Master' }) === '1' ? 'on' : 'off')
  },

  // Get media info of given player.
  xGetMediaInfo: async function (coordinatorUrl) {
    return await executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'GetMediaInfo',
      { 'InstanceID': 0 })
  },

  // Get playbackstate of given player. 
  // values: playing, stopped, playing, paused_playback, transitioning, no_media_present
  xGetPlaybackstate: async function (coordinatorUrl) {
    const transportInfo = await executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'GetTransportInfo',
      { 'InstanceID': 0 })
    if (!isTruthyPropertyStringNotEmptyTs(transportInfo, 'CurrentTransportState')) {
      throw new Error(`${PACKAGE_PREFIX}: CurrentTransportState is invalid/missing/not string`)
    }
    return transportInfo.CurrentTransportState.toLowerCase()
  },

  // Get position info of given player.
  xGetPositionInfo: async function (coordinatorUrl) {
    return await executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'GetPositionInfo',
      { 'InstanceID': 0 })
  },

  // Get volume of given player. value: integer, range 0 .. 100
  xGetVolume: async function (playerUrl) {
    return await executeActionV6(playerUrl,
      '/MediaRenderer/RenderingControl/Control', 'GetVolume',
      { 'InstanceID': 0, 'Channel': 'Master' })
  },

  // Set new mute state at given player. newMutestate string must be on|off
  xSetMutestate: async function (playerUrl, newMutestate) {
    return await executeActionV6(playerUrl,
      '/MediaRenderer/RenderingControl/Control', 'SetMute',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredMute': (newMutestate ==='on') })
  },

  // Set new volume at given player. newVolume must be number, integer, in range 0 .. 100
  xSetVolume: async function (playerUrl, newVolume) {
    return await executeActionV6(playerUrl,
      '/MediaRenderer/RenderingControl/Control', 'SetVolume',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredVolume': newVolume })
  },

}
