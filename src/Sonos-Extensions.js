/**
 * Collection of simple commands based on executeAction.
 * It handles the communication above SOAP level
 *
 * @module Sonos-Extensions.js
 * 
 * @author Henning Klages
 * 
 * @since 2021-02-14
*/

'use strict'

const PACKAGE_PREFIX = 'nrcsp: '

const { executeActionV6, didlXmlToArray } = require('./Sonos-Commands.js')

const { isTruthyPropertyStringNotEmptyTs, isTruthyArrayTs, isTruthyTs, isTruthyPropertyTs
} = require('./HelperTs.js')

const  request   = require('axios').default
const parser = require('fast-xml-parser')

const debug = require('debug')('nrcsp:Extensions')

module.exports = {

  //
  //                    SPECIAL COMMANDS
  //

  /** Get device properties.
   * @param {object} playerUrlObject player URL JavaScript build in Object 
   *
   * @returns {Promise<object>} device properties as object
   *
   * @throws {error}  ???
   */
  xGetDeviceProperties: async function (playerUrlObject) {
    debug('method >>%s', 'xGetDeviceProperties')
    const endpoint = '/xml/device_description.xml'
    const response = await request({
      method: 'get',
      baseURL: playerUrlObject.origin,
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

  /** Validate that ip belongs to a SONOS player.
   * @param {object} playerUrlObject player URL JavaScript build in Object 
   * @param {number} timeout in milliseconds
   * 
   * @returns {Promise<boolean>} true if typical SONOS player response
   *
   * Does not validate parameter!
   * 
   * Method: Every SONOS player will answer to http request with 
   * end point /info and provide the household id. 
   * 
   * @throws no programmed error
   */
  xIsSonosPlayer: async function (playerUrlObject, timeout) {
    debug('method >>%s', 'xIsSonosPlayer')
    let response = null
    try {
      response = await request.get(`${playerUrlObject.origin}/info`, { 'timeout': timeout })  
    } catch (error) {
      // timeout will show up here
      // eslint-disable-next-line max-len
      debug('request failed >>%s', playerUrlObject.host + '-' + JSON.stringify(error, Object.getOwnPropertyNames(error)))
      return false
    }
    if (!isTruthyPropertyStringNotEmptyTs(response, ['data', 'householdId'])) {
      debug('invalid response >>%s', JSON.stringify(response, Object.getOwnPropertyNames(response)))
      return false
    }
    return true
  },

  //
  //                    COMPLEX COMMANDS - EXECUTE ACTION AND TRANSFORM
  //

  /** Get array of all SONOS-Queue items - maximum 200.
   * Adds processingType and playerUrlOrigin to artUri.
   * @param {object} playerUrlObject player URL JavaScript build in Object 
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-queue items, could be empty
   *
   * @throws {error} nrcsp: invalid return from Browse, didlXmlToArray error
   */
  xGetSonosQueue: async function (playerUrlObject) {
    const browseQueue = await executeActionV6(playerUrlObject,
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
            artUri = playerUrlObject.origin + artUri
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
  //  @param  {object} playerUrlObject/coordinatorUrlObject player URL JavaScript build in Object
  //  @returns always a promise
  //  @throws {error} from executeAction
  //
  //...............................................................................................
  
  // Get mute state of given player. values: on|off
  xGetMutestate: async function (playerUrlObject) {
    return (await executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'GetMute',
      { 'InstanceID': 0, 'Channel': 'Master' }) === '1' ? 'on' : 'off')
  },

  // Get media info of given player.
  xGetMediaInfo: async function (coordinatorUrlObject) {
    return await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'GetMediaInfo',
      { 'InstanceID': 0 })
  },

  // Get playbackstate of given player. 
  // values: playing, stopped, playing, paused_playback, transitioning, no_media_present
  xGetPlaybackstate: async function (coordinatorUrlObject) {
    const transportInfo = await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'GetTransportInfo',
      { 'InstanceID': 0 })
    if (!isTruthyPropertyStringNotEmptyTs(transportInfo, 'CurrentTransportState')) {
      throw new Error(`${PACKAGE_PREFIX}: CurrentTransportState is invalid/missing/not string`)
    }
    return transportInfo.CurrentTransportState.toLowerCase()
  },

  // Get position info of given player.
  xGetPositionInfo: async function (coordinatorUrlObject) {
    return await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'GetPositionInfo',
      { 'InstanceID': 0 })
  },

  // Get volume of given player. value: integer, range 0 .. 100
  xGetVolume: async function (playerUrlObject) {
    return await executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'GetVolume',
      { 'InstanceID': 0, 'Channel': 'Master' })
  },

  // Set new mute state at given player. newMutestate string must be on|off
  xSetMutestate: async function (playerUrlObject, newMutestate) {
    return await executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'SetMute',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredMute': (newMutestate ==='on') })
  },

  // Set new volume at given player. newVolume must be number, integer, in range 0 .. 100
  xSetVolume: async function (playerUrlObject, newVolume) {
    return await executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'SetVolume',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredVolume': newVolume })
  },

}
