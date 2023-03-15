/**
 * Collection of 
 * - Node-RED related such as failure, success
 * - simple HTML commands
 * - simple SOAP commands based on executeAction and sendSoapToPlayer
 * - SONOS related helper for parsing xml data
 * - executeAction, sendSoapToPlayer.
 *
 * @module Sonos-Extensions.js
 * 
 * @author Henning Klages
 * 
 * @since 2021-03-04
*/

'use strict'

const { PACKAGE_PREFIX, REGEX_ANYCHAR } = require('./Globals.js')

const { decodeHtmlEntity, getNestedProperty, isTruthy, isTruthyProperty,
  isTruthyPropertyStringNotEmpty, isTruthyStringNotEmpty, validRegex, validToInteger
} = require('./Helper.js')

const request = require('axios').default
const { XMLParser } = require('fast-xml-parser')

const debug = require('debug')(`${PACKAGE_PREFIX}extensions`)

module.exports = {

  NODE_SONOS_ERRORPREFIX: 'upnp: ', // all errors from services _requests
  NODE_SONOS_UPNP500: 'upnp: statusCode 500 & upnpErrorCode ', // only those with 500 (subset)
  SOAP_ERRORS: require('./Db-Soap-Errorcodes.json'),  

  MUSIC_SERVICES: require('./Db-MusicServices.json'),

  //
  //     NODE-RED STATUS & ERROR HANDLING 
  //     

  /**
   *  Validates general group properties msg.playerName, msg.volume, msg.sameVolume, msg.clearQueue
   * Returns default if is NOT isTruthyProperty (undefined, null, ...) 
   * but throws error if has wrong type or wrong value (such as out of range, regex, ...)
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = ''] playerName
   * @param {string/number} [msg.volume = -1] volume. if not set don't touch original volume.
   * @param {boolean} [msg.sameVolume = true] sameVolume
   * @param {boolean} [msg.clearQueue = true] indicator for clear queue
   *
   * @returns {promise} object {playerName, volume, sameVolume, flushQueue}
   *
   * @throws {error} 'sameVolume (msg.sameVolume) is not boolean', 
   * 'sameVolume (msg.sameVolume) is true but msg.volume is not specified', 
   * 'clearQueue (msg.cleanQueue) is not boolean'
   * @throws {error} all methods
   */
  validatedGroupProperties: async (msg) => {
    // playerName 
    const playerName = validRegex(msg, 'playerName', REGEX_ANYCHAR, 'player name', '')

    // volume 
    const volume = validToInteger(msg, 'volume', 0, 100, 'volume', -1)

    // sameVolume
    let sameVolume = true
    if (isTruthyProperty(msg, ['sameVolume'])) {
      if (typeof msg.sameVolume !== 'boolean') {
        throw new Error(`${PACKAGE_PREFIX}: sameVolume (msg.sameVolume) is not boolean`)
      }
      if (volume === -1 && msg.sameVolume === true) {
        throw new Error(
          `${PACKAGE_PREFIX}: sameVolume (msg.sameVolume) is true but msg.volume is not specified`)
      }
      sameVolume = msg.sameVolume
    }

    // clearQueue
    let clearQueue = true
    if (isTruthyProperty(msg, ['clearQueue'])) {
      if (typeof msg.clearQueue !== 'boolean') {
        throw new Error(`${PACKAGE_PREFIX}: clearQueue (msg.cleanQueue) is not boolean`)
      }
      clearQueue = msg.clearQueue
    }

    return { playerName, volume, sameVolume, clearQueue }
  },
  
  /** Show any error occurring during processing of messages in the node status 
   * and create node error.
   * 
   * @param {object} node current node
   * @param {object} msg current msg
   * @param {object} done Node-RED function done
   * @param {object} error standard node.js or created with new Error ('')
   * @param {string} [functionName] name of calling function
   * 
   * @throws nothing
   * 
   * @returns nothing
   */
  failureV2: (node, msg, done, error, functionName) => {
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
    // incompatibility to 0.x
    done(`${functionName}:${msgShort} :: Details: ${msgDet}`)
    node.status({ 'fill': 'red', 'shape': 'dot', 'text': `error: ${functionName} - ${msgShort}`
    })
  },
  //
  //     SPECIAL COMMANDS - SIMPLE HTML REQUEST
  //     

  /** Check whether device is a SONOS-Player and online.
   * @param {object} playerUrlObject player JavaScript build-in URL 
   * @param {number} timeout in milliseconds
   *
   * @returns {Promise<boolean>} true if SONOS player response
   *
   * Does not validate parameter!
   * 
   * Method: Every SONOS player will answer to http request with 
   * end point /info and provide the household id. 
   * 
   * @throws none - they are caught insight
   */
  isOnlineSonosPlayer: async (playerUrlObject, timeout) => {
    debug('method:%s', 'isOnlineSonosPlayer')
    
    let response
    try {
      response = await request.get(`${playerUrlObject.origin}/info`, { 'timeout': timeout })  
    } catch (error) {
      // timeout will show up here
      debug('Error: SONOS endpoint does not respond >>%s', playerUrlObject.host + '-'
        + JSON.stringify(error, Object.getOwnPropertyNames(error)))
      
      return false
    }
    if (!isTruthyPropertyStringNotEmpty(response, ['data', 'householdId'])) {
      debug('Error: missing householdId >>%s',
        JSON.stringify(response, Object.getOwnPropertyNames(response)))
      
      return false
    }

    return true
  },

  /** Get device info and verifies existence of capabilities and id.
   * @param {object} playerUrlObject player JavaScript build-in URL
   * @param {number} timeout in milliseconds
   *
   * @returns {Promise<object>} device properties as object
   *
   * @throws {error} response from player is invalid - data missing|id missing|capabilities missing
   * @throws {error} all methods especially a timeout
   */
  getDeviceInfo: async (playerUrlObject, timeout) => {
    debug('method:%s', 'getDeviceInfo')
    // error is thrown if not status code 200
    const response = await request.get(`${playerUrlObject.origin}/info`, {
      'timeout': timeout,
      'validateStatus': (status) => (status === 200) // Resolve only if the status code is 200
    })  
    if (!isTruthyProperty(response, ['data'])) {
      throw new Error(`${PACKAGE_PREFIX} response from player is invalid - data missing`)
    }
    if (!isTruthyProperty(response, ['data', 'device', 'id'])) {
      throw new Error(`${PACKAGE_PREFIX} response from player is invalid - id missing`)
    }
    if (!isTruthyProperty(response, ['data', 'device', 'capabilities'])) {
      throw new Error(`${PACKAGE_PREFIX} response from player is invalid - capabilities missing`)
    }

    return response.data
  },

  /** Get battery info for new roam device
   * @param {object} playerUrlObject player JavaScript build-in URL
   * @param {number} timeout in milliseconds
   *
   * @returns {Promise<object>} battery level as integer 0 .. 100
   *
   * @throws {error} response from player is invalid - data missing|id missing|capabilities missing
   * @throws {error} all methods especially a timeout
   */
  getDeviceBatteryLevel: async (playerUrlObject, timeout) => {
    debug('method:%s', 'getDeviceBatteryLevel')
    // error is thrown if not status code 200
    const endpoint = '/status/batterystatus'
    const response = await request({
      'method': 'get',
      'baseURL': playerUrlObject.origin,
      'url': endpoint,
      'headers': {
        'Content-type': 'text/xml; charset=utf8',
      },
      'timeout': timeout,
      'validateStatus': (status) => (status === 200) // Resolve only if the status code is 200
    })  
    if (!isTruthyProperty(response, ['data'])) {
      throw new Error(`${PACKAGE_PREFIX} response from player is invalid - data missing`)
    }

    // Test data
    // eslint-disable-next-line max-len
    // response.data = '<?xml version="1.0" ?><?xml-stylesheet type="text/xsl" href="/xml/review.xsl"?><ZPSupportInfo><LocalBatteryStatus><Data name="Health">GREEN</Data><Data name="Level">89</Data><Data name="Temperature">NORMAL</Data><Data name="PowerSource">BATTERY</Data></LocalBatteryStatus><!-- SDT: 0 ms --></ZPSupportInfo>'
    let clean = response.data.replace('<?xml', '<xml')
    clean = clean.replace('?>', '>') // strange but necessary
    
    const parser = new XMLParser({
      parseTagValue: false,
    })
    const parsed = await parser.parse(clean) 

    if (!isTruthyProperty(parsed, ['xml', 'ZPSupportInfo', 'LocalBatteryStatus'])) {
      throw new Error(`${PACKAGE_PREFIX} SONOS player did not provide battery level status!`)
    }    

    const result = {
      'level': Number(parsed.xml.ZPSupportInfo.LocalBatteryStatus.Data[1]),
      'powerSource': parsed.xml.ZPSupportInfo.LocalBatteryStatus.Data[3]
    }
    return result
  },

  /** Get device properties.
   * @param {object} playerUrlObject player JavaScript build-in URL
   *
   * @returns {Promise<object>} device properties as object
   *
   * @throws {error} 'invalid response from player - response', 
   * 'response from player is invalid - data missing', 'xml parser: invalid response', 
   * 'xml parser: invalid response
   * @throws {error} all methods
   */
  getDeviceProperties: async (playerUrlObject) => {
    debug('method:%s', 'getDeviceProperties')
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
    let properties = {}
    if (!isTruthyPropertyStringNotEmpty(response, ['data'])) {
      throw new Error(`${PACKAGE_PREFIX} response from player is invalid - data missing`)
    }
    let clean = response.data.replace('<?xml', '<xml')
    clean = clean.replace('?>', '>') // strange but necessary
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '_',
      parseTagValue: false,
    })
    properties = await parser.parse(clean) 
    if (!isTruthy) {
      throw new Error(`${PACKAGE_PREFIX} xml parser: invalid response`)
    }
    if (!isTruthyProperty(properties, ['xml', 'root', 'device'])) {
      throw new Error(`${PACKAGE_PREFIX} xml parser: invalid response`)
    }
    return properties.xml.root.device
  },

  //
  //     SIMPLE COMMANDS - EXECUTE ACTION AND SIMPLE TRANSFORMATION
  //
  //     @param  {object} playerUrlObject/coordinatorUrlObject JavaScript build-in URL urlObject
  //     @returns always a promise
  //     @throws {error} from executeAction
  //     ..........................................................
  
  // Get media info of given player.
  // Difference between standard sonos-ts and this implementation
  // 1. Track is number versus string
  // 2. CurrentURIMetaData is object versus string <DIDL-lite>
  // 3. Most likely Next Metadata is also object 
  // 4. undefined instead of ''
  getMediaInfo: async (coordinatorUrlObject) => {
    debug('method:%s', 'getMediaInfo')
    return await module.exports.executeActionV8(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'GetMediaInfo',
      { 'InstanceID': 0 })
  },
  
  //
  //     SONOS RELATED HELPER
  //     ....................

  /** Comparing player UUID and serial number. Returns true if matching.
   * @param {string} serial the string such as 00-0E-58-FE-3A-EA:5
   * @param {string} uuid the string such as RINCON_000E58FE3AEA01400
   * RINCONG_xxxxxxxxxxxx01400 (01400 is port)
   * 
   * @returns {Promise<boolean>} true if matching but ignores last digit here 5
   * 
   * @throws only split, replace exceptions
   * 
   * Algorithm: only checks the first part of serial number
   * 
   * @since 2022-01-11
   */
  matchSerialUuid: (serial, uuid) => {
    debug('method:%s', 'matchSerialUuid')
    
    let serialClean = serial.split(':')[0]
    serialClean = serialClean.replace(/-/g, '')

    let uuidClean = uuid.replace(/^(RINCON_)/, '')
    uuidClean = uuidClean.replace(/(01400)$/, '')
    
    return (uuidClean === serialClean)
  },

  /** 
   * Returns an array (always) of items (DidlBrowseItem) extracted from action "Browse" output. 
   * title, id, artist, album are html decoded. uri, r:resMD (string) aren't! 
   * @param {object} browseOutcome Browse outcome
   * @param {number} browseOutcome.NumberReturned amount returned items
   * @param {number} browseOutcome.TotalMatches amount of total item
   * @param {string} browseOutcome.Result Didl-Light format, xml 
   * @param {string} itemName DIDL-Light property holding the data. Such as "item" or "container"
   * 
   * @returns {Promise<DidlBrowseItem[]>} Promise, array of {@link Sonos-CommandsTs#DidlBrowseItem},
   * maybe empty array.
   * 
   * @throws {error} if any parameter is missing
   * @throws {error} from method xml2js and invalid response (missing id, title)
   * 
   * Browse provides the results (property Result) in form of a DIDL-Lite xml format. 
   * The <DIDL-Lite> includes several attributes such as xmlns:dc" and entries 
   * all named "container" or "item". These include xml tags such as 'res'. 
   */
  parseBrowseToArray: async (browseOutcome, itemName) => {
    // validate method parameter
    if (!isTruthy(PACKAGE_PREFIX)) {
      throw new Error('parameter package name is missing')
    }
    if (!isTruthy(browseOutcome)) {
      throw new Error('parameter browse input is missing')
    }
    if (!isTruthyStringNotEmpty(itemName)) {
      throw new Error('parameter item name such as container is missing')
    }
    if (!isTruthyProperty(browseOutcome, ['NumberReturned'])) { 
      throw new Error(`${PACKAGE_PREFIX} invalid response Browse: - missing NumberReturned`)
    }
    if (browseOutcome.NumberReturned < 1) {
      return [] // no My Sonos favorites
    }
    
    // process the Result with Didl-Light
    if (!isTruthyPropertyStringNotEmpty(browseOutcome, ['Result'])) {
      throw new Error(`${PACKAGE_PREFIX} invalid response Browse: - missing Result DIDL XML`)
    }
    const decodedResult = await decodeHtmlEntity(browseOutcome['Result'])
    // stopNodes because we use that value for export and import and no further processing
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '_',
      parseAttributeValue: false,  // is default
      parseTagValue: false, // is default - example Title 49 will otherwise be converted
      arrayMode: false,
      stopNodes: ['r:resMD'], // for My-Sonos items, play export!
      textNodeName: '#text',  //is default, just to remember
      processEntities: false // very important to keep the didl in "r:resMD"!
    })
    const browseJson = await parser.parse(decodedResult)  
    if (!isTruthyProperty(browseJson, ['DIDL-Lite'])) {
      throw new Error(`${PACKAGE_PREFIX} invalid response Browse: missing DIDL-Lite`)
    }

    // The following section is because of fast-xml-parser with 'arrayMode' = false
    // if only ONE item then convert it to array with one 
    let itemsAlwaysArray = []
    const path = ['DIDL-Lite', itemName]
    if (isTruthyProperty(browseJson, path)) {
      const itemsOrOne = browseJson[path[0]][path[1]]
      if (Array.isArray(itemsOrOne)) { 
        itemsAlwaysArray = itemsOrOne.slice()
      } else { // single item  - convert to array
        itemsAlwaysArray = [itemsOrOne]
      }
    }

    // transform properties
    const transformedItems = await Promise.all(itemsAlwaysArray.map(async (item) => {
      const newItem = {
        'id': '', // required
        'title': '', // required
        'artist': '',
        'album': '',
        'description': '',
        'uri': '',
        'artUri': '',
        'metadata': '',
        'sid': '',
        'serviceName': '',
        'upnpClass': '', // might be overwritten
        'processingType': 'queue' // has to be updated in calling program
      }

      // String() not necessary, see parsing options. But used in case 
      // there might be a number.
      // special property, required. 
      if (!isTruthyProperty(item, ['_id'])) {
        throw new Error(`${PACKAGE_PREFIX} id is missing`) // should never happen
      }
      newItem.id = String(item['_id'])
      if (!isTruthyProperty(item, ['dc:title'])) {
        throw new Error(`${PACKAGE_PREFIX} title is missing`) // should never happen
      }
      newItem.title = await decodeHtmlEntity(String(item['dc:title']))

      // properties, optional
      if (isTruthyProperty(item, ['dc:creator'])) {
        newItem.artist = await decodeHtmlEntity(String(item['dc:creator']))
      }

      if (isTruthyProperty(item, ['upnp:album'])) {
        newItem.album = await decodeHtmlEntity(String(item['upnp:album']))
      }

      if (isTruthyProperty(item, ['res', '#text'])) {
        newItem.uri = item['res']['#text'] // HTML entity encoded, URI encoded
        newItem.sid = await module.exports.getMusicServiceId(newItem.uri)
        newItem.serviceName = module.exports.getMusicServiceName(newItem.sid)
      }
      if (isTruthyProperty(item, ['r:description'])) { // my sonos
        newItem.description = item['r:description'] 
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
   * @param {string} uri such as (masked)
   * 'x-rincon-cpcontainer:1004206ccatalog%2falbums%***%2f%23album_desc?sid=201&flags=8300&sn=14'
   * ''
   *
   * @returns {promise<string>} service id or if not found empty string
   *
   * prerequisites: uri is string where the sid is in between "?sid=" and "&flags="
   */
  getMusicServiceId: async (uri) => {
    debug('method:%s', 'getMusicServiceId')
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
   * @param {string} sid service id (integer) such as "201" or blank 
   * 
   * @returns {string} service name such as "Amazon Music" or empty string
   *
   * @uses database of services (map music service id  to musics service name)
   */
  getMusicServiceName: (sid) => {
    debug('method:%s', 'getMusicServiceName')
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

  /**  Get UpnP class from string metadata. 
   * @param {string} metadataEncoded DIDL-Lite metadata, encoded
   * 
   * @returns {Promise<string>} Upnp class such as "object.container.album.musicAlbum"
   *
   * prerequisites: metadata containing xml tag <upnp:class>
   */
  getUpnpClassEncoded: async (metadataEncoded) => {
    debug('method:%s', 'getUpnpClassEncoded')
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

  /**  guessProcessingType from UPnP string
   * @param {string} upnpClass the UPNP class such as 'object.item.audioItem.audioBroadcast'
   * 
   * @returns {Promise<string>} processingType 'queue'|'stream'
   *
   * prerequisites: metadata containing xml tag <upnp:class>
   */
  guessProcessingType: async (upnpClass) => {
    debug('method:%s', 'guessProcessingType')

    // startsWith because object.item.audioItem.audioBroadcast#swimlane-genre for Sonos Radio
    const UPNP_CLASSES_STREAM = 'object.item.audioItem.audioBroadcast'

    const UPNP_CLASSES_QUEUE = [
      'object.container.album.musicAlbum',
      'object.container.playlistContainer',
      'object.item.audioItem.musicTrack',
      'object.container',
      'object.container.playlistContainer#playlistItem',
      'object.container.playlistContainer.#playlistItem',
      'object.container.playlistContainer.#PlaylistView'
    ]
    // unsupported:
    // 'object.container.podcast.#podcastContainer',
    // 'object.container.albumlist'
    
    let processingType
    if (upnpClass.startsWith(UPNP_CLASSES_STREAM)) {
      debug('upnp class is of type stream ')
      processingType = 'stream'
    } else if (UPNP_CLASSES_QUEUE.includes(upnpClass)) {
      debug('upnp class is of type queue ')
      processingType = 'queue'
    } else {
      debug('upnp class is unsupported - we assume queue')
      processingType = 'queue'
    }

    return processingType
  },

  /** 
   * Returns an array (always) of alarms from ListAlarms 
   * @param {object} currentAlarmList property CurrentAlarmList from ListAlarm
   * 
   * @returns {Promise<Alarms[]>} Promise, array of alarms, can be empty.
   * 
   * @throws {error} if any parameter is missing, illegal response from ListAlarms
   * * @throws {error} if decodeHtmlEntity, parser.parse
   * 
   * currentAlarmList provides html-decoded xml data containing the alarms. All alamr properties
   * are attributes- therefor attribute prefix is set to ''
   */
  parseAlarmsToArray: async (currentAlarmList) => {
    // validate method parameter
    if (!isTruthy(PACKAGE_PREFIX)) {
      throw new Error('parameter package name is missing')
    }
    if (!isTruthy(currentAlarmList)) {
      throw new Error(`${PACKAGE_PREFIX} parameter alarmList input is missing`)
    }
   
    const decodedAlarmXml = await decodeHtmlEntity(currentAlarmList)
    let alarmsAlwaysArray
    if (decodedAlarmXml === '<Alarms></Alarms>') {
      // no alarms
      alarmsAlwaysArray = []
    } else {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        parseAttributeValue: false,  // is default
        parseTagValue: false,
        arrayMode: false, // watch fields of type array!
        textNodeName: '#text',  //is default, just to remember
        processEntities: false // - see above decodedAlarmXml
      })
      const alarmsJson = await parser.parse(decodedAlarmXml)
      // convert single object to array
      if (isTruthyProperty(alarmsJson, ['Alarms', 'Alarm'])) {
        if (Array.isArray(alarmsJson.Alarms.Alarm)) {
          alarmsAlwaysArray = alarmsJson.Alarms.Alarm.slice()
        } else {
          alarmsAlwaysArray = [alarmsJson.Alarms.Alarm] 
        }
      } else {
        throw new Error(`${PACKAGE_PREFIX} illegal response from ListAlarms`)
      }
    }
    
    return alarmsAlwaysArray
  },

  /** Parse outcome of GetZoneGroupState and create an array of all groups in household. 
   * Each group consist of an array of player <playerGroupData>.
   * Coordinator is always in position 0. Group array may have size 1 (standalone).
   * Hidden players (example stereopair) are removed, if removeHiden = true (default).
   * @param {string} zoneGroupState the xml data from GetZoneGroupState
   * @param {boolean} removeHidden removes all hidden payers  
   * 
   * @returns {promise<playerGroupData[]>} array of arrays with playerGroupData
   *          First group member is coordinator
   *
   * @throws {error} 'response form parse xml is invalid', 'parameter package name is missing',
   * 'parameter zoneGroupState is missing`
   * @throws {error} all methods
   * 
   * CAUTION: To be on the safe side: playerName uses String (see parse*Value)
   * CAUTION: We use arrayMode false and do it manually
   */
  parseZoneGroupToArray: async (zoneGroupState, removeHidden = true) => { 
    debug('method:%s', 'parseZoneGroupToArray')
    // Validate method parameter
    if (!isTruthyStringNotEmpty(zoneGroupState)) {
      throw new Error('parameter zoneGroupState is missing')
    }
    
    const decoded = await decodeHtmlEntity(zoneGroupState)
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '_',
      parseAttributeValue: false,
      parseTagValue: false,
      arrayMode: false,
      processEntities: false
    })
    const groupState = await parser.parse(decoded) 
    
    // The following section is because of fast-xml-parser with 'arrayMode' = false
    // If only ONE group then convert it to array of groups with one member
    let groupsAlwaysArray
    if (isTruthyProperty(groupState, ['ZoneGroupState', 'ZoneGroups', 'ZoneGroup'])) {
      // This is the standard case for new firmware!
      if (Array.isArray(groupState.ZoneGroupState.ZoneGroups.ZoneGroup)) {
        groupsAlwaysArray = groupState.ZoneGroupState.ZoneGroups.ZoneGroup.slice()
      } else {
        groupsAlwaysArray = [groupState.ZoneGroupState.ZoneGroups.ZoneGroup] 
      }
      // If a group has only ONE member then convert it to array with one member
      groupsAlwaysArray = groupsAlwaysArray.map(group => {
        if (!Array.isArray(group.ZoneGroupMember)) group.ZoneGroupMember = [group.ZoneGroupMember]
        return group
      })
    } else {
      // Try this for very old firmware version, where ZoneGroupState is missing
      if (isTruthyProperty(groupState, ['ZoneGroups', 'ZoneGroup'])) {
        if (Array.isArray(groupState.ZoneGroups.ZoneGroup)) {
          groupsAlwaysArray = groupState.ZoneGroups.ZoneGroup.slice()
        } else {
          groupsAlwaysArray = [groupState.ZoneGroups.ZoneGroup] 
        }
        // If a group has only ONE member then convert it to array with one member
        groupsAlwaysArray = groupsAlwaysArray.map(group => {
          if (!Array.isArray(group.ZoneGroupMember)) group.ZoneGroupMember = [group.ZoneGroupMember]
          return group
        })
      } else {
        throw new Error(`${PACKAGE_PREFIX} response form parse xml: properties missing.`)
      }
    }
    // Result is groupsAlwaysArray is array<groupDataRaw> and always arrays (not single item)

    // Sort all groups that coordinator is in position 0 and select properties
    // See typeDef playerGroupData. 
    const groupsArraySorted = [] // result to be returned
    for (const group of groupsAlwaysArray) {
      let groupSorted = []
      const coordinatorUuid = group._Coordinator
      const groupId = group._ID
      // First push coordinator, its other properties will be updated later!
      groupSorted.push({ groupId, 'uuid': coordinatorUuid })
      const iCoord = 0 // used for later access
      
      for (const member of group.ZoneGroupMember) {
        const urlObject = new URL(member._Location)
        urlObject.pathname = '' // clean up
        const uuid = member._UUID  
        // My naming is playerName instead of the SONOS ZoneName
        const playerName = String(member._ZoneName) // safety
        const invisible = (member._Invisible === '1')
        const channelMapSet = member._ChannelMapSet || ''      
        const htSatChanMapSet = member._HTSatChanMapSet || ''   
        if (member._UUID !== coordinatorUuid) {
          // Push new joiner 
          groupSorted.push({
            urlObject, playerName, uuid, groupId, invisible,
            channelMapSet, htSatChanMapSet
          })
        } else {
          // Update coordinator
          groupSorted[iCoord].urlObject = urlObject
          groupSorted[iCoord].playerName = playerName
          groupSorted[iCoord].invisible = invisible
          groupSorted[iCoord].channelMapSet = channelMapSet
          groupSorted[iCoord].htSatChanMapSet = htSatChanMapSet
        }
      }
      if (removeHidden) { // Removes all hidden player
        groupSorted = groupSorted.filter((member) => member.invisible === false)   
      }
      // Invisible player form a group with 1 - remove that. Should not happen
      if (groupSorted.length !== 0) groupsArraySorted.push(groupSorted)
    }
    return groupsArraySorted
  },

  /** Extract group for a given player. playerName - if isTruthyStringNotEmpty- 
   * is overruling playerUrlHost
   * @param {string} playerUrlHost (wikipedia) host such as 192.168.178.37
   * @param {object} allGroupsData from getGroupsAll
   * @param {string} [playerName] SONOS-Playername such as Kitchen 
   * 
   * @returns {promise<object>} returns object:
   * { groupId, playerIndex, coordinatorIndex, members[]<playerGroupData> } 
   *
   * @throws {error} 'could not find given player in any group'
   * @throws {error} all methods
   */
  extractGroup: async (playerUrlHost, allGroupsData, playerName) => {
    debug('method:%s', 'extractGroup')
    
    // this ensures that playerName overrules given playerUrlHostname
    const searchByPlayerName = isTruthyStringNotEmpty(playerName)

    // find player in group bei playerName or playerUrlHostname
    // playerName - if valid - overrules playerUrlHostname!
    let foundGroupIndex = -1 // indicator for player NOT found
    let visible
    let groupId
    let usedPlayerUrlHost = ''
    for (let iGroup = 0; iGroup < allGroupsData.length; iGroup++) {
      for (let iMember = 0; iMember < allGroupsData[iGroup].length; iMember++) {
        visible = !allGroupsData[iGroup][iMember].invisible
        groupId = allGroupsData[iGroup][iMember].groupId
        if (searchByPlayerName) {
          // we compare playerName (string) such as Küche
          if (allGroupsData[iGroup][iMember].playerName === playerName && visible) {
            foundGroupIndex = iGroup
            usedPlayerUrlHost = allGroupsData[iGroup][iMember].urlObject.hostname
            break // inner loop
          }
        } else {
          // we compare by URL hostname such as '192.168.178.35'
          if (allGroupsData[iGroup][iMember].urlObject.hostname === playerUrlHost && visible) {
            foundGroupIndex = iGroup
            usedPlayerUrlHost = allGroupsData[iGroup][iMember].urlObject.hostname
            break // inner loop
          }
        }
      }
      if (foundGroupIndex >= 0) {
        break // break also outer loop
      }
    }
    if (foundGroupIndex === -1) {
      throw new Error(`${PACKAGE_PREFIX} could not find given player in any group`)
    }
    
    // remove all invisible players player (in stereopair there is one invisible)
    const members = allGroupsData[foundGroupIndex].filter((member) => (member.invisible === false))

    // find our player index in that group. At this position because we did filter!
    // that helps to figure out role: coordinator, joiner, independent
    const playerIndex
      = members.findIndex((member) => (member.urlObject.hostname === usedPlayerUrlHost))

    return {
      groupId,
      playerIndex,
      'coordinatorIndex': 0,
      members
    }
  },

  //
  //    BASIC EXECUTE UPNP ACTION COMMAND AND SOAP REQUEST
  //    

  /**  Sends action with actionInArgs to endpoint at playerUrl.origin and returns result.
   * @param {object} playerUrl player URL (JavaScript build in) such as http://192.168.178.37:1400
   * @param {string} endpoint the endpoint name such as /MediaRenderer/AVTransport/Control
   * @param {string} actionName the action name such as Seek
   * @param {object} actionInArgs all arguments - throws error if one argument is missing!
   *
   * @returns {Promise<(object|boolean)>} true or outArgs of that action
   * 
   * @throws {error} http return invalid status or not 200, 
   * missing body, unexpected response
   * @throws {error} fastxmlparser errors 
   * 
   * Everything OK if statusCode === 200 and body includes expected 
   * response value (set) or value (get)
   */

  executeActionV8: async (playerUrl, endpoint, actionName, actionInArgs) => {
    debug('method:%s', 'executeActionV7')
   
    // !no check of inArgs
     
    // generate serviceName from endpoint - its always the second last
    // SONOS endpoint is either /<component>/<serviceName>/Control or /<serviceName>/Control
    // component MediaRenderer or MediaServer
    const tmp = endpoint.split('/')  
    const serviceName = tmp[tmp.length - 2]
  
    const response
      // eslint-disable-next-line max-len
      = await module.exports.sendSoapToPlayer(playerUrl.origin, endpoint, serviceName, actionName, actionInArgs)
    debug('xml response body as string >>%s', response.body)

    // Everything OK if statusCode === 200 
    // && body includes expected response value or requested value
    if (!isTruthyProperty(response, ['statusCode'])) {
      // This should never happen. Just to avoid unhandled exception.
      // eslint-disable-next-line max-len
      throw new Error(`${PACKAGE_PREFIX} status code from sendToPlayer is invalid - response.statusCode >>${JSON.stringify(response)}`)
    }
    if (response.statusCode !== 200) {
      // This should not happen as long as axios is being used. Just to avoid unhandled exception.
      // eslint-disable-next-line max-len
      throw new Error(`${PACKAGE_PREFIX} status code is not 200: ${response.statusCode} - response >>${JSON.stringify(response)}`)
    }
    if (!isTruthyProperty(response, ['body'])) {
      // This should not happen. Just to avoid unhandled exception.
      // eslint-disable-next-line max-len
      throw new Error(`${PACKAGE_PREFIX} body from sendToPlayer is invalid - response >>${JSON.stringify(response)}`)
    }

    // Convert XML to JSON - now with fast xml parser
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: false,
      parseTagValue: false,
      arrayMode: false,
      processEntities: false // decoding will be done manually
    })
    const bodyXml = await parser.parse(response.body)
    debug('parsed JSON response body >>%s', JSON.stringify(bodyXml))

    // RESPONSE
    // The key to the core data is ['s:Envelope','s:Body',`u:${actionName}Response`]
    // There are 2 cases: 
    //   1. no output argument thats typically in a "set" action: 
    //      expected response is just an envelope with
    //      .... 'xmlns:u' = `urn:schemas-upnp-org:service:${serviceName}:1`  
    //   2. one or more values typically in a "get" action: in addition 
    //       the values outArgs are included.
    //       .... 'xmlns:u' = `urn:schemas-upnp-org:service:${serviceName}:1` 
    //       and in addition the properties from outArgs
    // 
    const key = ['s:Envelope', 's:Body']
    key.push(`u:${actionName}Response`)

    // check body response
    if (!isTruthyProperty(bodyXml, key)) {
      // eslint-disable-next-line max-len
      throw new Error(`${PACKAGE_PREFIX} body from sendToPlayer is invalid - response >>${JSON.stringify(response)}`)
    }
    const result = getNestedProperty(bodyXml, key)
    if (!isTruthyProperty(result, ['xmlns:u'])) {
      throw new Error(`${PACKAGE_PREFIX} xmlns:u property is missing`)
    }
    const expectedResponseValue = `urn:schemas-upnp-org:service:${serviceName}:1`  
    if (result['xmlns:u'] !== expectedResponseValue) {
      throw new Error(`${PACKAGE_PREFIX} unexpected player response: urn:schemas ... is missing `)
    } else {
      delete result['xmlns:u']
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
  sendSoapToPlayer: async (playerUrlOrigin, endpoint, serviceName, actionName, args) => {
    debug('method:%s', 'sendSoapToPlayer')

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
    debug('soap action >>%s', JSON.stringify(soapAction))
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
              throw new Error(`${PACKAGE_PREFIX} statusCode 500 & upnpErrorCode ${errorCode}. upnpErrorMessage >>${errorMessage}`)
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
   * @param {string} data upnp error response as envelope with <errorCode>xxx</errorCode>
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
   * @param {string} errorCode
   * @param {JSON} upnpErrorList - simple mapping .code .message
   * @param {JSON} [serviceErrorList] - simple mapping .code .message
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
  },

  /**  Replace &apos; with %27.
   * 
   * @param {string} uri uri from Music library query
   * 
   * @returns {string} uri without &apos; instead %27
   * 
   * Example: x-rincon-playlist:RINCON_5CAAFD00223601400#A:ALBUM/A%20Hard%20Day&apos;s%20Night
   * @throws nothing
   */
  replaceAposColon: (uri) => {
    const newUri = uri.replace(/&apos;/g, '%27')
    return newUri
  }
}
