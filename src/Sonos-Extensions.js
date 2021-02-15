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

const { PACKAGE_PREFIX } = require('./Globals.js')

// TODO move both to extensions
const { executeActionV6, didlXmlToArray } = require('./Sonos-Commands.js')

const { isTruthyPropertyStringNotEmptyTs, isTruthyArrayTs, isTruthyTs, isTruthyPropertyTs, encodeHtmlEntityTs
} = require('./HelperTs.js')

const  request   = require('axios').default
const parser = require('fast-xml-parser')

const debug = require('debug')('nrcsp:Extensions')

module.exports = {

  //
  //                    SPECIAL COMMANDS
  //

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

  /** Set the AVTransport stream for given player. Adds InstanceID. Encodes html.
   * CAUTION: a joiner may leave group
   * CAUTION: Does not play - only sets content. Needs a play afterwards
   * CAUTION: No Metadata generation - must be provided!
   * CAUTION: Allows to set all to empty - means no content, will not play
   * Thats done for the createSnapshot, restoreSnapshot!
   * 
   * @param {object} playerUrlObject player URL build in JavaScript object
   * @param {object} inArgs action arguments (except InstanceID)
   * @param {string} inArgs.CurrentURI such as "x-sonosapi-stream:s119032?sid=254&flags=8224&sn=0"
   * @param {string} inArgs.CurrentURIMetaData uri as DIDL-Lite xml
   *
   * @returns {promise} true
   *
   * @throws {error} from executeActionV6
   * @throws {error} if any inArgs, playerUrl is missing/invalid
   */
  xSetPlayerAVTransport: async function (playerUrlObject, inArgs) { 
    if (!isTruthyTs(playerUrlObject)) {
      throw new Error(`${PACKAGE_PREFIX} playerUrl is invalid/missing.`)
    }
    if (typeof playerUrlObject !== 'object') { // does not cover all but is ok
      throw new Error(`${PACKAGE_PREFIX} playerUrl is not object`)
    }
    
    if (!isTruthyTs(inArgs)) {
      throw new Error(`${PACKAGE_PREFIX} inArgs is invalid/missing.`)
    }
    if (!isTruthyPropertyStringNotEmptyTs(inArgs, ['CurrentURI'])) {
      throw new Error(`${PACKAGE_PREFIX} CurrentURI is missing/not string/empty string.`)
    }
    if (!isTruthyPropertyTs(inArgs, ['CurrentURIMetaData'])) {
      throw new Error(`${PACKAGE_PREFIX} CurrentURIMetaData is missing.`)
    }
    if (typeof inArgs['CurrentURIMetaData'] !== 'string') {
      throw new Error(`${PACKAGE_PREFIX} CurrentURIMetaData is not type string.`)
    }
    const metadata = inArgs['CurrentURIMetaData'].trim()
    
    // HTML encoding is very important (caution: not uri encoding)!
    // transformedArgs are embedded in SOAP envelop
    const transformedArgs = {
      'InstanceID': 0, 
      'CurrentURI': await encodeHtmlEntityTs(inArgs.CurrentURI),
      'CurrentURIMetaData': await encodeHtmlEntityTs(metadata)
    }

    return await executeActionV6(playerUrlObject,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', transformedArgs)
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
    if (!isTruthyPropertyStringNotEmptyTs(transportInfo, ['CurrentTransportState'])) {
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

  //** Play (already set) URI.
  xPlay: async function (coordinatorUrlObject) {
    return await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'Play',
      { 'InstanceID': 0, 'Speed': 1 })
  },

  //** Position in track - requires none empty queue. position h:mm:ss
  xPositionInTrack: async function (coordinatorUrlObject, positionInTrack) {
    if (!isTruthyTs(positionInTrack)) {
      throw new Error(`${NRCSP_PREFIX} positionInTrack is invalid/missing.`)
    }
    if (typeof positionInTrack !== 'string') { 
      throw new Error(`${NRCSP_PREFIX} positionInTrack is not string`)
    }

    return await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'Seek',
      { 'InstanceID': 0, 'Target': positionInTrack, 'Unit': 'REL_TIME' })
  },

  //** Play track - requires none empty queue. trackPosition (number) 1 to queue length
  // track position number or string in range 1 to lenght
  xSelectTrack: async function (coordinatorUrlObject, trackPosition) {
    if (!isTruthyTs(trackPosition)) {
      throw new Error(`${PACKAGE_PREFIX} trackPosition is invalid/missing.`)
    }
    if (typeof trackPosition !== 'string' && typeof trackPosition !== 'number') { 
      throw new Error(`${PACKAGE_PREFIX} trackPosition is not string/number`)
    }
    const track = parseInt(trackPosition)

    return await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'Seek',
      { 'InstanceID': 0, 'Target': track, 'Unit': 'TRACK_NR' })
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
