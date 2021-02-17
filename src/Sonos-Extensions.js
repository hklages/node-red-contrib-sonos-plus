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
const { executeActionV6 } = require('./Sonos-Commands.js')

const { isTruthyPropertyStringNotEmpty: xIsTruthyPropertyStringNotEmpty,
  isTruthyArray: xIsTruthyArray, isTruthy: xIsTruthy, isTruthyProperty: xIsTruthyProperty,
  encodeHtmlEntity: xEncodeHtmlEntity
} = require('./HelperTs.js')

const  request   = require('axios').default
const parser = require('fast-xml-parser')

const debug = require('debug')(`${PACKAGE_PREFIX}Extensions`)

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
  isSonosPlayer: async function (playerUrlObject, timeout) {
    debug('method >>%s', 'isSonosPlayer')
    let response = null
    try {
      response = await request.get(`${playerUrlObject.origin}/info`, { 'timeout': timeout })  
    } catch (error) {
      // timeout will show up here
      // eslint-disable-next-line max-len
      debug('request failed >>%s', playerUrlObject.host + '-' + JSON.stringify(error, Object.getOwnPropertyNames(error)))
      return false
    }
    if (!xIsTruthyPropertyStringNotEmpty(response, ['data', 'householdId'])) {
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
  getDeviceProperties: async function (playerUrlObject) {
    debug('method >>%s', 'getDeviceProperties')
    const endpoint = '/xml/device_description.xml'
    const response = await request({
      method: 'get',
      baseURL: playerUrlObject.origin,
      url: endpoint,
      headers: {
        'Content-type': 'text/xml; charset=utf8'
      }
    })
    if (!xIsTruthy(response)) {
      throw new Error(`${PACKAGE_PREFIX} invalid response from player - response`)
    }
    // TODO Test ECON ....
    let properties = {}
    if (!xIsTruthyPropertyStringNotEmpty(response, ['data'])) {
      throw new Error(`${PACKAGE_PREFIX} response from player is invalid - data missing`)
    }
    let clean = response.data.replace('<?xml', '<xml')
    clean = clean.replace('?>', '>') // strange but necessary
    properties = await parser.parse(clean, {
      'ignoreAttributes': false,
      'attributeNamePrefix': '_',
      'parseNodeValue': false
    }) 
    if (!xIsTruthy) {
      throw new Error(`${PACKAGE_PREFIX} xml parser: invalid response`)
    }
    if (!xIsTruthyProperty(properties, ['xml', 'root', 'device'])) {
      throw new Error(`${PACKAGE_PREFIX} xml parser: device data missing`)
    }
    return properties.xml.root.device
  },

  //
  //                    COMPLEX COMMANDS - EXECUTE ACTION AND TRANSFORM
  //

  /** Get array of all SONOS-Queue items.
   * Adds processingType and playerUrlOrigin to artUri.
   * @param {object} tsPlayer sonos-ts player
   * @param {number} requestedCount integer, 1 to ...
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-queue items, could be empty
   *
   * @throws {error} invalid return from Browse, didlXmlToArray error
   */
  getSonosQueue: async function (tsPlayer, requestedCount) {
    debug('method >>%s', 'getSonosQueue')
    const browseQueue = await tsPlayer.ContentDirectoryService.Browse({
      ObjectID: 'Q:0', BrowseFlag: 'BrowseDirectChildren', Filter: '*',
      StartingIndex: 0, RequestedCount: requestedCount, SortCriteria: ''
    })
    if (!xIsTruthyProperty(browseQueue, ['NumberReturned'])) {
      throw new Error(`${PACKAGE_PREFIX} invalid response Browse Q:0 - missing NumberReturned`)
    }
    
    let transformedItems = [] // empty queue
    if (browseQueue.NumberReturned > 0) {
      if (!xIsTruthyPropertyStringNotEmpty(browseQueue, ['Result'])) {
        throw new Error(`${PACKAGE_PREFIX} invalid response Browse Q:0 - missing Result`)
      }
      // item
      // eslint-disable-next-line max-len
      transformedItems = await module.exports.parseBrowseDidlXmlToArray(browseQueue.Result, 'item')
      if (!xIsTruthyArray(transformedItems)) {
        throw new Error(`${PACKAGE_PREFIX} response form parsing Browse Q:0 is invalid.`)
      }
      transformedItems = transformedItems.map((item) => {
        if (item.artUri.startsWith('/getaa')) {
          item.artUri = tsPlayer.urlObject.origin + item.artUri
        }
        return item
      })
    }
    return transformedItems
  },

  /** Set the AVTransport stream for given player. Adds InstanceID. Encodes html!!!!!!!!
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
  setAvTransport: async function (playerUrlObject, inArgs) { 
    debug('method >>%s', 'setAvTransport')
    if (!xIsTruthy(playerUrlObject)) {
      throw new Error(`${PACKAGE_PREFIX} playerUrl is invalid/missing.`)
    }
    if (typeof playerUrlObject !== 'object') { // does not cover all but is ok
      throw new Error(`${PACKAGE_PREFIX} playerUrl is not object`)
    }
    
    if (!xIsTruthy(inArgs)) {
      throw new Error(`${PACKAGE_PREFIX} inArgs is invalid/missing.`)
    }
    if (!xIsTruthyPropertyStringNotEmpty(inArgs, ['CurrentURI'])) {
      throw new Error(`${PACKAGE_PREFIX} CurrentURI is missing/not string/empty string.`)
    }
    if (!xIsTruthyProperty(inArgs, ['CurrentURIMetaData'])) {
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
      'CurrentURI': await xEncodeHtmlEntity(inArgs.CurrentURI),
      'CurrentURIMetaData': await xEncodeHtmlEntity(metadata)
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
  getMutestate: async function (playerUrlObject) {
    debug('method >>%s', 'setMutestate')
    return (await executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'GetMute',
      { 'InstanceID': 0, 'Channel': 'Master' }) === '1' ? 'on' : 'off')
  },

  // Get media info of given player.
  getMediaInfo: async function (coordinatorUrlObject) {
    debug('method >>%s', 'getMediaInfo')
    return await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'GetMediaInfo',
      { 'InstanceID': 0 })
  },

  // Get playbackstate of given player. 
  // values: playing, stopped, playing, paused_playback, transitioning, no_media_present
  getPlaybackstate: async function (coordinatorUrlObject) {
    debug('method >>%s', 'getPlaybackstate')
    const transportInfo = await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'GetTransportInfo',
      { 'InstanceID': 0 })
    if (!xIsTruthyPropertyStringNotEmpty(transportInfo, ['CurrentTransportState'])) {
      throw new Error(`${PACKAGE_PREFIX}: CurrentTransportState is invalid/missing/not string`)
    }
    return transportInfo.CurrentTransportState.toLowerCase()
  },

  // Get position info of given player.
  getPositionInfo: async function (coordinatorUrlObject) {
    debug('method >>%s', 'getPositionInfo')
    return await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'GetPositionInfo',
      { 'InstanceID': 0 })
  },

  // Get volume of given player. value: integer, range 0 .. 100
  getVolume: async function (playerUrlObject) {
    debug('method >>%s', 'getVolume')
    return await executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'GetVolume',
      { 'InstanceID': 0, 'Channel': 'Master' })
  },

  //** Play (already set) URI.
  play: async function (coordinatorUrlObject) {
    debug('method >>%s', 'play')
    return await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'Play',
      { 'InstanceID': 0, 'Speed': 1 })
  },

  //** Position in track - requires none empty queue. position h:mm:ss
  positionInTrack: async function (coordinatorUrlObject, positionInTrack) {
    debug('method >>%s', 'positionInTrack')
    if (!xIsTruthy(positionInTrack)) {
      throw new Error(`${PACKAGE_PREFIX} positionInTrack is invalid/missing.`)
    }
    if (typeof positionInTrack !== 'string') { 
      throw new Error(`${PACKAGE_PREFIX} positionInTrack is not string`)
    }

    return await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'Seek',
      { 'InstanceID': 0, 'Target': positionInTrack, 'Unit': 'REL_TIME' })
  },

  //** Play track - requires none empty queue. trackPosition (number) 1 to queue length
  // track position number or string in range 1 to lenght
  selectTrack: async function (coordinatorUrlObject, trackPosition) {
    debug('method >>%s', 'selectTrack')
    if (!xIsTruthy(trackPosition)) {
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
  setMutestate: async function (playerUrlObject, newMutestate) {
    debug('method >>%s', 'setMutestate')
    return await executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'SetMute',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredMute': (newMutestate ==='on') })
  },

  // Set new volume at given player. newVolume must be number, integer, in range 0 .. 100
  setVolume: async function (playerUrlObject, newVolume) {
    debug('method >>%s', 'setVolume')
    return await executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'SetVolume',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredVolume': newVolume })
  },

}
