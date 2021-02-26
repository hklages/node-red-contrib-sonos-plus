/**
 * Collection of simple commands based on executeAction, SendToPlayer
 *
 * @module Sonos-Extensions.js
 * 
 * @author Henning Klages
 * 
 * @since 2021-02-19
*/

'use strict'

const { PACKAGE_PREFIX } = require('./Globals.js')

const { isTruthyPropertyStringNotEmpty, isTruthyStringNotEmpty, isTruthyArray, isTruthy,
  isTruthyProperty, encodeHtmlEntity, decodeHtmlEntity, getNestedProperty
} = require('./Helper.js')

const  request   = require('axios').default
const xml2js = require('xml2js')
const parser = require('fast-xml-parser')

const debug = require('debug')(`${PACKAGE_PREFIX}extensions`)

module.exports = {

  ACTIONS_TEMPLATESV6: require('./Db-ActionsV6.json'),
  NODE_SONOS_ERRORPREFIX: 'upnp: ', // all errors from services _requests
  NODE_SONOS_UPNP500: 'upnp: statusCode 500 & upnpErrorCode ', // only those with 500 (subset)
  SOAP_ERRORS: require('./Db-Soap-Errorcodes.json'),  

  MUSIC_SERVICES: require('./Db-MusicServices.json'),

  //
  //                    SPECIAL COMMANDS
  //

  /** Validate that ip belongs to a SONOS player.
   * @param {object} playerUrlObject player JavaScript build-in URL 
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
  isSonosPlayer: async (playerUrlObject, timeout) => {
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
    if (!isTruthyPropertyStringNotEmpty(response, ['data', 'householdId'])) {
      debug('invalid response >>%s', JSON.stringify(response, Object.getOwnPropertyNames(response)))
      return false
    }
    return true
  },

  /** Get device properties.
   * @param {object} playerUrlObject player JavaScript build-in URL
   *
   * @returns {Promise<object>} device properties as object
   *
   * @throws {error}  ???
   */
  getDeviceProperties: async (playerUrlObject) => {
    debug('method >>%s', 'getDeviceProperties')
    const endpoint = '/xml/device_description.xml'
    const response = await request({
      'method': 'get',
      'baseURL': playerUrlObject.origin,
      'url': endpoint,
      'headers': {
        'Content-type': 'text/xml; charset=utf8'
      }
    })
    if (!isTruthy(response)) {
      throw new Error(`${PACKAGE_PREFIX} invalid response from player - response`)
    }
    // TODO Test ECON ....
    let properties = {}
    if (!isTruthyPropertyStringNotEmpty(response, ['data'])) {
      throw new Error(`${PACKAGE_PREFIX} response from player is invalid - data missing`)
    }
    let clean = response.data.replace('<?xml', '<xml')
    clean = clean.replace('?>', '>') // strange but necessary
    properties = await parser.parse(clean, {
      'ignoreAttributes': false,
      'attributeNamePrefix': '_',
      'parseNodeValue': false
    }) 
    if (!isTruthy) {
      throw new Error(`${PACKAGE_PREFIX} xml parser: invalid response`)
    }
    if (!isTruthyProperty(properties, ['xml', 'root', 'device'])) {
      throw new Error(`${PACKAGE_PREFIX} xml parser: device data missing`)
    }
    return properties.xml.root.device
  },

  //
  //                    COMPLEX COMMANDS - EXECUTE ACTION AND TRANSFORM
  //

  /** Get array of all SONOS-Queue items.
   * Adds processingType and player urlobject.origin to artUri.
   * @param {object} tsPlayer sonos-ts player
   * @param {number} requestedCount integer, 1 to ...
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-queue items, could be empty
   *
   * @throws {error} invalid return from Browse, parseBrowseToArray error
   */
  getSonosQueue: async (tsPlayer, requestedCount) => {
    debug('method >>%s', 'getSonosQueue')
    const browseQueue = await tsPlayer.ContentDirectoryService.Browse({
      'ObjectID': 'Q:0', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': requestedCount, 'SortCriteria': ''
    })
    
    let transformed = await module.exports.parseBrowseToArray(browseQueue, 'item', PACKAGE_PREFIX)
    if (!isTruthyArray(transformed)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse Q:0 is invalid.`)
    }
    transformed = transformed.map((item) => {
      if (item.artUri.startsWith('/getaa')) {
        item.artUri = tsPlayer.urlObject.origin + item.artUri
      }
      
      return item
    })

    return transformed
  },

  /** Set the AVTransport stream for given player. Adds InstanceID. Encodes html!!!!!!!!
   * CAUTION: a joiner may leave group
   * CAUTION: Does not play - only sets content. Needs a play afterwards
   * CAUTION: No Metadata generation - must be provided!
   * CAUTION: Allows to set all to empty - means no content, will not play
   * Thats done for the createSnapshot, restoreSnapshot!
   * 
   * @param {object} playerUrlObject player JavaScript build-in URL 
   * @param {object} inArgs action arguments (except InstanceID)
   * @param {string} inArgs.CurrentURI such as "x-sonosapi-stream:s119032?sid=254&flags=8224&sn=0"
   * @param {string} inArgs.CurrentURIMetaData uri as DIDL-Lite xml
   *
   * @returns {promise} true
   *
   * @throws {error} from module.exports.executeActionV6
   * @throws {error} if any inArgs, playerUrl is missing/invalid
   */
  setAvTransport: async (playerUrlObject, inArgs) => { 
    debug('method >>%s', 'setAvTransport')
    if (!isTruthy(playerUrlObject)) {
      throw new Error(`${PACKAGE_PREFIX} playerUrl is invalid/missing.`)
    }
    if (typeof playerUrlObject !== 'object') { // does not cover all but is ok
      throw new Error(`${PACKAGE_PREFIX} playerUrl is not object`)
    }
    
    if (!isTruthy(inArgs)) {
      throw new Error(`${PACKAGE_PREFIX} inArgs is invalid/missing.`)
    }
    if (!isTruthyPropertyStringNotEmpty(inArgs, ['CurrentURI'])) {
      throw new Error(`${PACKAGE_PREFIX} CurrentURI is missing/not string/empty string.`)
    }
    if (!isTruthyProperty(inArgs, ['CurrentURIMetaData'])) {
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
      'CurrentURI': await encodeHtmlEntity(inArgs.CurrentURI),
      'CurrentURIMetaData': await encodeHtmlEntity(metadata)
    }

    return await module.exports.executeActionV6(playerUrlObject,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', transformedArgs)
  },
  
  //
  //                    SIMPLE COMMANDS - EXECUTE ACTION AND SIMPLE TRANSFORMATION
  //
  //  @param  {object} playerUrlObject/coordinatorUrlObject player JavaScript build-in URL urlObject
  //  @returns always a promise
  //  @throws {error} from executeAction
  //
  //...............................................................................................
  
  // Get mute state of given player. values: on|off
  getMutestate: async (playerUrlObject) => {
    debug('method >>%s', 'getMutestate')
    return (await module.exports.executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'GetMute',
      { 'InstanceID': 0, 'Channel': 'Master' }) === '1' ? 'on' : 'off')
  },

  // Get media info of given player.
  getMediaInfo: async (coordinatorUrlObject) => {
    debug('method >>%s', 'getMediaInfo')
    return await module.exports.executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'GetMediaInfo',
      { 'InstanceID': 0 })
  },

  // Get playbackstate of given player. 
  // values: playing, stopped, playing, paused_playback, transitioning, no_media_present
  getPlaybackstate: async (coordinatorUrlObject) => {
    debug('method >>%s', 'getPlaybackstate')
    const transportInfo = await module.exports.executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'GetTransportInfo',
      { 'InstanceID': 0 })
    if (!isTruthyPropertyStringNotEmpty(transportInfo, ['CurrentTransportState'])) {
      throw new Error(`${PACKAGE_PREFIX}: CurrentTransportState is invalid/missing/not string`)
    }
    return transportInfo.CurrentTransportState.toLowerCase()
  },

  // Get position info of given player.
  getPositionInfo: async (coordinatorUrlObject) => {
    debug('method >>%s', 'getPositionInfo')
    return await module.exports.executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'GetPositionInfo',
      { 'InstanceID': 0 })
  },

  // Get volume of given player. value: integer, range 0 .. 100
  getVolume: async (playerUrlObject) => {
    debug('method >>%s', 'getVolume')
    return await module.exports.executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'GetVolume',
      { 'InstanceID': 0, 'Channel': 'Master' })
  },

  //** Play (already set) URI.
  play: async (coordinatorUrlObject) => {
    debug('method >>%s', 'play')
    return await module.exports.executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'Play',
      { 'InstanceID': 0, 'Speed': 1 })
  },

  //** Position in track - requires none empty queue. position h:mm:ss
  positionInTrack: async (coordinatorUrlObject, positionInTrack) => {
    debug('method >>%s', 'positionInTrack')
    if (!isTruthy(positionInTrack)) {
      throw new Error(`${PACKAGE_PREFIX} positionInTrack is invalid/missing.`)
    }
    if (typeof positionInTrack !== 'string') { 
      throw new Error(`${PACKAGE_PREFIX} positionInTrack is not string`)
    }

    return await module.exports.executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'Seek',
      { 'InstanceID': 0, 'Target': positionInTrack, 'Unit': 'REL_TIME' })
  },

  //** Play track - requires none empty queue. trackPosition (number) 1 to queue length
  // track position number or string in range 1 to lenght
  selectTrack: async (coordinatorUrlObject, trackPosition) => {
    debug('method >>%s', 'selectTrack')
    if (!isTruthy(trackPosition)) {
      throw new Error(`${PACKAGE_PREFIX} trackPosition is invalid/missing.`)
    }
    if (typeof trackPosition !== 'string' && typeof trackPosition !== 'number') { 
      throw new Error(`${PACKAGE_PREFIX} trackPosition is not string/number`)
    }
    const track = parseInt(trackPosition)

    return await module.exports.executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'Seek',
      { 'InstanceID': 0, 'Target': track, 'Unit': 'TRACK_NR' })
  },

  // Set new mute state at given player. newMutestate string must be on|off
  setMutestate: async (playerUrlObject, newMutestate) => {
    debug('method >>%s', 'setMutestate')
    return await module.exports.executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'SetMute',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredMute': newMutestate })
  },

  // Set new volume at given player. newVolume must be number, integer, in range 0 .. 100
  setVolume: async (playerUrlObject, newVolume) => {
    debug('method >>%s', 'setVolume')
    return await module.exports.executeActionV6(playerUrlObject,
      '/MediaRenderer/RenderingControl/Control', 'SetVolume',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredVolume': newVolume })
  },

  /** Comparing player UUID and serial number. Returns true if matching.
   * @param  {string} serial the string such as 00-0E-58-FE-3A-EA:5
   * @param  {string} uuid the string such as RINCON_000E58FE3AEA01400
   * RINCONG_xxxxxxxxxxxx01400  (01400 is port)
   * 
   * @returns {Promise<boolean>} true if matching
   * 
   * @throws only split, replace exceptions
   * 
   * Algorithm: only checks the first part of serial number
   * 
   * @since 2021-02-13
   */
  matchSerialUuid: (serial, uuid) => {
    debug('method >>%s', 'matchSerialUuid')
    
    let serialClean = serial.split(':')[0]
    serialClean = serialClean.replace(/-/g, '')

    let uuidClean = uuid.replace(/^(RINCON_)/, '')
    uuidClean = uuidClean.replace(/(01400)$/, '')
    
    return (uuidClean === serialClean)
  },

  /** 
   * Returns an array of items (DidlBrowseItem) extracted from action "Browse" output.
   * @param  {object} browseOutcome Browse outcome
   * @param  {number} browseOutcome.NumberReturned amount returned items
   * @param  {number} browseOutcome.TotalMatches amount of total item
   * @param  {string} browseOutcome.Result Didl-Light format, xml 
   * @param  {string} itemName DIDL-Light property holding the data. Such as "item" or "container"
   * @param  {string} packageName name of calling package  - used for throws
   * 
   * @returns {Promise<DidlBrowseItem[]>} Promise, array of {@link Sonos-CommandsTs#DidlBrowseItem},
   *  maybe empty array.
   *                   
   * @throws {error} if any parameter is missing
   * @throws {error} from method xml2js and invalid response (missing id, title)
   * 
   * Browse provides the results (property Result) in form of a DIDL-Lite xml format. 
   * The <DIDL-Lite> includes several attributes such as xmlns:dc" and entries 
   * all named "container" or "item". These include xml tags such as 'res'. 
   */
  parseBrowseToArray: async (browseOutcome, itemName, packageName) => {
    
    // validate method parameter
    if (!isTruthy(packageName)) {
      throw new Error('Package name is missing')
    }
    if (!isTruthy(browseOutcome)) {
      throw new Error(`${packageName} Browse input is missing`)
    }
    if (!isTruthyStringNotEmpty(itemName)) {
      throw new Error(`${packageName} item name such as container is missing`)
    }
    if (!isTruthyProperty(browseOutcome, ['NumberReturned'])) { 
      throw new Error(`${packageName} invalid response Browse: - missing NumberReturned`)
    }
    if (browseOutcome.NumberReturned < 1) {
      return [] // no My Sonos favorites
    }
    
    // process the Result with Didl-Light
    if (!isTruthyPropertyStringNotEmpty(browseOutcome, ['Result'])) {
      throw new Error(`${packageName} invalid response Browse: - missing Result`)
    }
    const decodedResult = await decodeHtmlEntity(browseOutcome['Result'])
    const resultJson = await parser.parse(decodedResult, {
      'ignoreAttributes': false,
      'attributeNamePrefix': '_',
      'stopNodes': ['r:resMD'], // for My-Sonos items
      'parseNodeValue': false // this is important - example Title 49 will otherwise be converted
    })  
    if (!isTruthyProperty(resultJson, ['DIDL-Lite'])) {
      throw new Error(`${packageName} invalid response Browse: missing DIDL-Lite`)
    }

    let originalItems = []
    // single items are not of type array (fast-xml-parser)
    const path = ['DIDL-Lite', itemName]
    if (isTruthyProperty(resultJson, path)) {
      const itemsOrOne = resultJson[path[0]][path[1]]
      if (Array.isArray(itemsOrOne)) { 
        originalItems = itemsOrOne.slice()
      } else { // single item  - convert to array
        originalItems.push(itemsOrOne) 
      }
    } 

    // transform properties Album related
    const transformedItems = await Promise.all(originalItems.map(async (item) => {
      const newItem = {
        'id': '',
        'title': '',
        'artist': '',
        'album': '',
        'uri': '',
        'artUri': '',
        'metadata': '',
        'sid': '',
        'serviceName': '',
        'upnpClass': '',
        'processingType': 'queue' // has to be updated in calling program
      }
      if (!isTruthyProperty(item, ['_id'])) {
        throw new Error(`${packageName} id is missing`) // should never happen
      }
      newItem.id = item['_id']

      if (!isTruthyProperty(item, ['dc:title'])) {
        throw new Error(`${packageName} title is missing`) // should never happen
      }
      if (isTruthyProperty(item, ['dc:creator'])) {
        newItem.artist = item['dc:creator']
      }
      if (!isTruthyProperty(item, ['dc:title'])) {
        throw new Error(`${packageName} title is missing`) // should never happen
      }
      newItem.title = await decodeHtmlEntity(String(item['dc:title'])) // clean title for search
      if (isTruthyProperty(item, ['dc:creator'])) {
        newItem.artist = item['dc:creator']
      }
      if (isTruthyProperty(item, ['res', '#text'])) {
        newItem.uri = item['res']['#text'] // HTML entity encoded, URI encoded
        newItem.sid = await module.exports.getMusicServiceId(newItem.uri)
        newItem.serviceName = module.exports.getMusicServiceName(newItem.sid)
      }
      if (isTruthyProperty(item, ['r:resMD'])) {
        newItem.metadata = item['r:resMD']  // keep HTML entity encoded, URI encoded
      } 
      if (isTruthyProperty(item, ['upnp:class'])) {
        newItem.upnpClass = item['upnp:class']
      }
      // artURI (cover) maybe an array (one for each track) then choose first
      let artUri = ''
      if (isTruthyProperty(item, ['upnp:albumArtURI'])) {
        artUri = item['upnp:albumArtURI']
        if (Array.isArray(artUri)) {
          if (artUri.length > 0) {
            newItem.artUri = artUri[0]
          }
        } else {
          newItem.artUri = artUri
        }
      }
      // special case My Sonos favorites. It include metadata in DIDL-lite format.
      // these metadata include the original title, original upnp:class (processingType)
      if (isTruthyProperty(item, ['r:resMD'])) {
        newItem.metadata = item['r:resMD']
      }
      return newItem
    })
    )
    return transformedItems  // properties see transformedItems definition
  },

  /**  Get music service id (sid) from HTML ENTITY DECODED Transport URI.
   * @param  {string} uri such as (masked)
   * 'x-rincon-cpcontainer:1004206ccatalog%2falbums%***%2f%23album_desc?sid=201&flags=8300&sn=14'
   * ''
   *
   * @returns {promise<string>} service id or if not found empty string
   *
   * prerequisites: uri is string where the sid is in between "?sid=" and "&flags="
   */
  getMusicServiceId: async (uri) => {
    debug('method >>%s', 'getMusicServiceId')
    let sid = '' // default even if uri undefined.
    if (isTruthyStringNotEmpty(uri)) {
      const decodedUri = await decodeHtmlEntity(uri)
      const positionStart = decodedUri.indexOf('?sid=') + '$sid='.length
      const positionEnd = decodedUri.indexOf('&flags=')
      if (positionStart > 1 && positionEnd > positionStart) {
        sid = decodedUri.substring(positionStart, positionEnd)
      }
    }
    return sid
  },

  /**  Get service name for given service id.
   * @param  {string} sid service id (integer) such as "201" or blank 
   * 
   * @returns {string} service name such as "Amazon Music" or empty string
   *
   * @uses database of services (map music service id  to musics service name)
   */
  getMusicServiceName: (sid) => {
    debug('method >>%s', 'getMusicServiceName')
    let serviceName = '' // default even if sid is blank
    if (sid !== '') {
      const list = module.exports.MUSIC_SERVICES
      const index = list.findIndex((service) => (service.sid === sid))
      if (index >= 0) {
        serviceName = list[index].name
      }  
    } 
    return serviceName
  }, 

  /**  Get TuneIn radioId from Transport URI - only for Music Service TuneIn 
   * @param  {string} uri uri such as x-sonosapi-stream:s24903?sid=254&flags=8224&sn=0
   * 
   * @returns {string} TuneIn radio id or if not found empty
   *
   * prerequisite: uri with radio id is in between "x-sonosapi-stream:" and "?sid=254"
   */
  getRadioId: (uri) => {
    let radioId = ''
    if (uri.startsWith('x-sonosapi-stream:') && uri.includes('sid=254')) {
      const end = uri.indexOf('?sid=254')
      const start = 'x-sonosapi-stream:'.length
      radioId = uri.substring(start, end)
    }
    return radioId
  },

  /**  Get UpnP class from string metadata. 
   * @param  {string} metadataEncoded DIDL-Lite metadata, encoded
   * 
   * @returns {string} Upnp class such as "object.container.album.musicAlbum"
   *
   * prerequisites: metadata containing xml tag <upnp:class>
   */
  getUpnpClassEncoded: async (metadataEncoded) => {
    // TODO has to be parsed - check with event and kidsplayer!
    const decoded = await decodeHtmlEntity(metadataEncoded)
    let upnpClass = '' // default
    if (isTruthyStringNotEmpty(decoded)) {
      const positionStart = decoded.indexOf('<upnp:class>') + '<upnp:class>'.length
      const positionEnd = decoded.indexOf('</upnp:class>')
      if (positionStart >= 0 && positionEnd > positionStart) {
        upnpClass = decoded.substring(positionStart, positionEnd)
      }
    }
    return upnpClass
  },

  /** Show any error occurring during processing of messages in the node status 
   * and create node error.
   * 
   * @param  {object} node current node
   * @param  {object} msg current msg
   * @param  {object} error  standard node.js or created with new Error ('')
   * @param  {string} [functionName] name of calling function
   * 
   * @throws nothing
   * 
   * @returns nothing
   */
  failure: (node, msg, error, functionName) => {
    // 1. Is the error a standard nodejs error? Indicator: .code exists
    // nodejs provides an error object with properties: .code, .message .name .stack
    // See https://nodejs.org/api/errors.html for more about the error object.
    // .code provides the best information.
    // See https://nodejs.org/api/errors.html#errors_common_system_errors
    // 
    // 2. Is the error thrown in node-sonos - service _request? Indicator: 
    // message starts with NODE_SONOS_ERRORPREFIX
    // The .message then contains either NODE_SONOS_ERRORPREFIX statusCode 500 & upnpErrorCode ' 
    // and the error.response.data or NODE_SONOS_ERRORPREFIX error.message and 
    // error.response.data
    // 
    // 3. Is the error from this package? Indicator: .message starts with PACKAGE_PREFIX
    // 
    // 4. All other error throw inside all modules (node-sonos, axio, ...)
    let msgShort = 'unknown' // default text used for status message
    let msgDet = 'unknown' // default text for error message in addition to msgShort
    if (isTruthyPropertyStringNotEmpty(error, ['code'])) {
      // 1. nodejs errors - convert into readable message
      if (error.code === 'ECONNREFUSED') {
        msgShort = 'Player refused to connect'
        msgDet = 'Validate players ip address'
      } else if (error.code === 'EHOSTUNREACH') {
        msgShort = 'Player is unreachable'
        msgDet = 'Validate players ip address / power on'
      } else if (error.code === 'ETIMEDOUT') {
        msgShort = 'Request timed out'
        msgDet = 'Validate players IP address / power on'
      } else {
        // Caution: getOwn is necessary for some error messages eg play mode!
        msgShort = 'nodejs error - contact developer'
        msgDet = JSON.stringify(error, Object.getOwnPropertyNames(error))
      }
    } else {
      // Caution: getOwn is necessary for some error messages eg play mode!
      if (isTruthyPropertyStringNotEmpty(error, ['message'])) {
        if (error.message.startsWith(module.exports.NODE_SONOS_ERRORPREFIX)) {
          // 2. node sonos upnp errors from service _request
          if (error.message.startsWith(module.exports.NODE_SONOS_UPNP500)) {
            const uppnText = error.message.substring(module.exports.NODE_SONOS_UPNP500.length)
            const upnpEc = module.exports.getErrorCodeFromEnvelope(uppnText)
            msgShort = `statusCode 500 & upnpError ${upnpEc}`
            // TODO Notion Helper-Service
            msgDet = module.exports.getErrorMessageV1(upnpEc, module.exports.SOAP_ERRORS.UPNP, '')
          } else {
            // unlikely as all UPNP errors throw 500
            msgShort = 'statusCode NOT 500'
            msgDet = `upnp envelope: ${error.message}`
          }
        } else if (error.message.startsWith(PACKAGE_PREFIX)) {
          // 3. my thrown errors
          msgDet = 'none'
          msgShort = error.message.replace(PACKAGE_PREFIX, '')
        } else {
          // Caution: getOwn is necessary for some error messages eg play mode!
          msgShort = error.message
          msgDet = JSON.stringify(error, Object.getOwnPropertyNames(error))
        }
      } else {
        // 4. all the others
        msgShort = 'Unknown error/ exception -see node.error'
        msgDet = JSON.stringify(error, Object.getOwnPropertyNames(error))
      }
    }
  
    node.error(`${functionName}:${msgShort} :: Details: ${msgDet}`, msg)
    node.status({ 'fill': 'red', 'shape': 'dot', 'text': `error: ${functionName} - ${msgShort}`
    })
  },
  
  /** Set node status and send message.
     * 
     * @param  {object} node current node
     * @param  {object} msg current msg (maybe null)
     * @param  {string} functionName name of calling function
     */
  success: (node, msg, functionName) => {
    node.send(msg)
    node.status({ 'fill': 'green', 'shape': 'dot', 'text': `ok:${functionName}` })
    node.debug(`OK: ${functionName}`)
  },
  
  //
  //                                EXECUTE UPNP ACTION COMMAND
  //...............................................................................................

  /**  Sends action with actionInArgs to endpoint at playerUrl.origin and returns result.
   * @param  {object} playerUrl player URL (JavaScript build in) such as http://192.168.178.37:1400
   * @param  {string} endpoint the endpoint name such as /MediaRenderer/AVTransport/Control
   * @param  {string} actionName the action name such as Seek
   * @param  {object} actionInArgs all arguments - throws error if one argument is missing!
   *
   * @uses ACTIONS_TEMPLATESV6 to get required inArgs and outArgs. 
   * 
   * @returns {Promise<(object|boolean)>} true or outArgs of that action
   *  
   * @throws {error} nrcsp: any inArgs property missing, http return invalid status or not 200, 
   * missing body, unexpected response
   * @throws {error} xml2js.parseStringPromise 
   * 
   * Everything OK if statusCode === 200 and body includes expected 
   * response value (set) or value (get)
   */
  executeActionV6: async (playerUrl, endpoint, actionName, actionInArgs, packageName) => {
    debug('entering method executeActionV6')
   
    let throwName = ''
    if (isTruthy(packageName)) {
      throwName = packageName
    }
    // get action in, out properties from json file 
    const endpointActions = module.exports.ACTIONS_TEMPLATESV6[endpoint]
    const { inArgs, outArgs } = endpointActions[actionName]
    
    // actionInArgs must have all properties
    inArgs.forEach(property => {
      if (!isTruthyProperty(actionInArgs, [property])) {
        throw new Error(`${throwName} property ${property} is missing}`)
      }
    })
    
    // generate serviceName from endpoint - its always the second last
    // SONOS endpoint is either /<device>/<serviceName>/Control or /<serviceName>/Control
    const tmp = endpoint.split('/')  
    const serviceName = tmp[tmp.length - 2]
  
    const response
      // eslint-disable-next-line max-len
      = await module.exports.sendSoapToPlayer(playerUrl.origin, endpoint, serviceName, actionName, actionInArgs)

    // Everything OK if statusCode === 200 
    // && body includes expected response value or requested value
    if (!isTruthyProperty(response, ['statusCode'])) {
      // This should never happen. Just to avoid unhandled exception.
      // eslint-disable-next-line max-len
      throw new Error(`${throwName} status code from sendToPlayer is invalid - response.statusCode >>${JSON.stringify(response)}`)
    }
    if (response.statusCode !== 200) {
      // This should not happen as long as axios is being used. Just to avoid unhandled exception.
      // eslint-disable-next-line max-len
      throw new Error(`${throwName} status code is not 200: ${response.statusCode} - response >>${JSON.stringify(response)}`)
    }
    if (!isTruthyProperty(response, ['body'])) {
      // This should not happen. Just to avoid unhandled exception.
      // eslint-disable-next-line max-len
      throw new Error(`${throwName} body from sendToPlayer is invalid - response >>${JSON.stringify(response)}`)
    }

    // Convert XML to JSON
    const parseXMLArgs = { 'mergeAttrs': true, 'explicitArray': false, 'charkey': '' } 
    // documentation: https://www.npmjs.com/package/xml2js#options  -- don't change option!
    const bodyXml = await xml2js.parseStringPromise(response.body, parseXMLArgs)

    // RESPONSE
    // The key to the core data is ['s:Envelope','s:Body',`u:${actionName}Response`]
    // There are 2 cases: 
    //   1.   no output argument thats typically in a "set" action: 
    //            expected response is just an envelope with
    //            .... 'xmlns:u' = `urn:schemas-upnp-org:service:${serviceName}:1`  
    //   2.   one or more values typically in a "get" action: in addition 
    //            the values outArgs are included.
    //            .... 'xmlns:u' = `urn:schemas-upnp-org:service:${serviceName}:1` 
    //            and in addition the properties from outArgs
    //   
    const key = ['s:Envelope', 's:Body']
    key.push(`u:${actionName}Response`)

    // check body response
    if (!isTruthyProperty(bodyXml, key)) {
      // eslint-disable-next-line max-len
      throw new Error(`${throwName} body from sendToPlayer is invalid - response >>${JSON.stringify(response)}`)
    }
    let result = getNestedProperty(bodyXml, key)
    if (!isTruthyProperty(result, ['xmlns:u'])) {
      throw new Error(`${throwName} xmlns:u property is missing`)
    }
    const expectedResponseValue = `urn:schemas-upnp-org:service:${serviceName}:1`  
    if (result['xmlns:u'] !== expectedResponseValue) {
      throw new Error(`${throwName} unexpected player response: urn:schemas ... is missing `)
    }
    
    if (outArgs.length === 0) { // case 1 
      result = true
    } else {
      // check whether all outArgs exist and return them as object!
      outArgs.forEach(property => { 
        if (!isTruthyProperty(result, [property])) {
          throw new Error(`${throwName} response property ${property} is missing}`)
        }
      })
      delete result['xmlns:u'] // thats not needed
    }
    if (outArgs.length === 1) {
      result = result[outArgs[0]]
    }
    return result
  },

  /** Send http request in SOAP format to player.
   * @param {string} playerUrlOrigin JavaScript URL origin such as http://192.168.178.37:1400
   * @param {string} endpoint SOAP endpoint (URL pathname) such '/ZoneGroupTopology/Control'
   * @param {string} serviceName such as 'ZoneGroupTopology'
   * @param {string} actionName such as 'GetZoneGroupState'
   * @param {object} args such as { InstanceID: 0, EQType: "NightMode" } or just {}
   *
   * @returns {promise} response header/body/error code from player
   */
  // eslint-disable-next-line max-len
  sendSoapToPlayer: async (playerUrlOrigin, endpoint, serviceName, actionName, args, packageName) => {
    debug('entering method sendSoapToPlayer')
    let throwName = ''
    if (isTruthy(packageName)) {
      throwName = packageName
    }

    // create action used in header - notice the " inside
    const soapAction = `"urn:schemas-upnp-org:service:${serviceName}:1#${actionName}"`

    // create body
    let httpBody = `<u:${actionName} xmlns:u="urn:schemas-upnp-org:service:${serviceName}:1">`
    if (args) {
      Object.keys(args).forEach(key => {
        httpBody += `<${key}>${args[key]}</${key}>`
      })
    }
    httpBody += `</u:${actionName}>`

    // body wrapped in envelope
    // eslint-disable-next-line max-len
    httpBody = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' 
      + '<s:Body>' + httpBody + '</s:Body>'
      + '</s:Envelope>'
    debug('soa action >>%s', JSON.stringify(soapAction))
    debug('soap body >>%s', JSON.stringify(httpBody))
    const response = await request({
      'method': 'post',
      'baseURL': playerUrlOrigin,
      'url': endpoint,
      'headers': {
        SOAPAction: soapAction,
        'Content-type': 'text/xml; charset=utf8'
      },
      'data': httpBody
    })
      .catch((error) => {
        // Experience: When using reject(error) the error.response get lost.
        // Thats why error.response is checked and handled here!
        // In case of an SOAP error error.response held the details and status code 500
        if (isTruthyProperty(error, ['response'])) {
        // Indicator for SOAP Error
          if (isTruthyProperty(error, ['message'])) {
            if (error.message.startsWith('Request failed with status code 500')) {
              const errorCode = module.exports.getErrorCodeFromEnvelope(error.response.data)
              let serviceErrorList = ''
              // eslint-disable-next-line max-len
              if (isTruthyPropertyStringNotEmpty(module.exports.SOAP_ERRORS, [serviceName.toUpperCase()])) {
                // look up in the service specific error codes 7xx
                serviceErrorList = module.exports.SOAP_ERRORS[serviceName.toUpperCase()]
              }
              // eslint-disable-next-line max-len
              const errorMessage = module.exports.getErrorMessageV1(errorCode, module.exports.SOAP_ERRORS.UPNP, serviceErrorList)
              // eslint-disable-next-line max-len
              throw new Error(`${throwName} statusCode 500 & upnpErrorCode ${errorCode}. upnpErrorMessage >>${errorMessage}`)
            } else {
              // eslint-disable-next-line max-len
              throw new Error('error.message is not code 500' + JSON.stringify(error, Object.getOwnPropertyNames(error)))
            }
          } else {
            // eslint-disable-next-line max-len
            throw new Error('error.message is missing. error >>' + JSON.stringify(error, Object.getOwnPropertyNames(error)))
          }
        } else {
          // usually ECON.. or timed out. Is being handled in failure procedure
          // eslint-disable-next-line max-len
          debug('error without error.response >>%s', JSON.stringify(error, Object.getOwnPropertyNames(error)))
          throw error
        }
      })
    return {
      'headers': response.headers,
      'body': response.data,
      'statusCode': response.status
    }
  },

  /**  Get error code or empty string.
   * 
   * @param  {string} data  upnp error response as envelope with <errorCode>xxx</errorCode>
   *
   * @returns {string} error code
   * 
   * @throws nothing
   */
  getErrorCodeFromEnvelope: (data) => {
    let errorCode = '' // default
    if (isTruthyStringNotEmpty(data)) {
      const positionStart = data.indexOf('<errorCode>') + '<errorCode>'.length
      const positionEnd = data.indexOf('</errorCode>')
      if (positionStart > 1 && positionEnd > positionStart) {
        errorCode = data.substring(positionStart, positionEnd)
      }
    }
    return errorCode.trim()
  },

  /**  Get error message from error code. If not found provide 'unknown error'.
   * 
   * @param  {string} errorCode
   * @param  {JSON} upnpErrorList - simple mapping .code .message
   * @param  {JSON} [serviceErrorList] - simple mapping .code .message
   *
   * @returns {string} error text (from mapping code -  text)
   * 
   * @throws nothing
   */
  getErrorMessageV1: (errorCode, upnpErrorList, serviceErrorList) => {
    const errorText = 'unknown error' // default
    if (isTruthyStringNotEmpty(errorCode)) {
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
