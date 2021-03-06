/**
 * All functions provided by My Sonos node. My Sonos node handles Music-Library and My-Sonos.
 * My Sonos also holds SONOS playlists.
 *
 * @module MySonos
 * 
 * @author Henning Klages
 * 
 * @since 2021-02-18
*/
'use strict'

const {
  PACKAGE_PREFIX, REGEX_ANYCHAR, REGEX_ANYCHAR_BLANK, REGEX_IP, REGEX_SERIAL,
  REQUESTED_COUNT_ML_DEFAULT, REQUESTED_COUNT_ML_EXPORT, REQUESTED_COUNT_MYSONOS_DEFAULT,
  REQUESTED_COUNT_MYSONOS_EXPORT, TIMEOUT_DISCOVERY, TIMEOUT_HTTP_REQUEST
} = require('./Globals.js')

const { discoverSpecificSonosPlayerBySerial } = require('./Discovery.js')

const { getMusicLibraryItems, getMySonos
} = require('./Commands.js')

const { failure, decideCreateNodeOn, success
} = require('./Extensions.js')

const { isTruthy, isTruthyProperty, isTruthyPropertyStringNotEmpty, validRegex, validToInteger
} = require('./Helper.js')

const { SonosDevice } = require('@svrooij/sonos/lib')

const debug = require('debug')(`${PACKAGE_PREFIX}mysonos`)

module.exports = function (RED) {

  // function lexical order, ascending
  const COMMAND_TABLE_MYSONOS = {
    'library.export.album': libraryExportAlbum,
    'library.export.playlist': libraryExportPlaylist,
    'library.export.track': libraryExportTrack,
    'library.get.albums': libraryGetAlbums,
    'library.get.playlists': libraryGetPlaylists,
    'library.queue.playlist': libraryQueuePlaylist,
    'mysonos.export.item': mysonosExportItem,
    'mysonos.get.items': mysonosGetItems,
    'mysonos.queue.item': mysonosQueueItem,
    'mysonos.stream.item': mysonosStreamItem
  }

  /**  Create My Sonos node, get valid ip address, store nodeDialog and subscribe to messages.
   * @param {object} config current node configuration data
   */
  function SonosManageMySonosNode (config) {
    debug('method:%s', 'SonosManageMySonosNode')
    const thisFunctionName = 'create and subscribe'
    RED.nodes.createNode(this, config)
    const node = this
    node.status({}) // Clear node status

    // Ip address overruling serial number - at least one must be valid
    const configNode = RED.nodes.getNode(config.confignode)
    if (isTruthyPropertyStringNotEmpty(configNode, ['ipaddress']) 
      && REGEX_IP.test(configNode.ipaddress)) {
      // Using config ip address to define the default SONOS player
      // and check whether that IP address is reachable (http request)
      const port = 1400 // assuming this port
      const playerUrlObject = new URL(`http://${configNode.ipaddress}:${port}`)
      decideCreateNodeOn(playerUrlObject, TIMEOUT_HTTP_REQUEST, config.avoidCheckPlayerAvailability)
        .then((isSonos) => {
          if (isSonos) {
            
            // subscribe and set processing function
            node.on('input', (msg) => {
              debug('msg received >>%s', 'universal node')
              processInputMsg(node, config, msg, playerUrlObject.hostname)
                // processInputMsg sets msg.nrcspCmd to current command
                .then((msgUpdate) => {
                  Object.assign(msg, msgUpdate) // Defines the output message
                  success(node, msg, msg.nrcspCmd)
                })
                .catch((error) => {
                  let lastFunction = 'processInputMsg'
                  if (msg.nrcspCmd && typeof msg.nrcspCmd === 'string') {
                    lastFunction = msg.nrcspCmd
                  }
                  failure(node, msg, error, lastFunction)
                })
            })
            debug('successfully subscribed - node.on')
            node.status({ fill: 'green', shape: 'dot', text: 'ok:ready' })
          } else {
            debug('ip address not reachable')
            node.status({ fill: 'red', shape: 'dot', text: 'error: ip not reachable' })
          }
        })
        .catch((err) => {
          debug('xIsSonos failed >>%s', JSON.stringify(err, Object.getOwnPropertyNames(err)))
          node.status({ fill: 'red', shape: 'dot', text: 'error: isSonos went wrong' })
        })
      
    } else if (isTruthyPropertyStringNotEmpty(configNode, ['serialnum'])
      && REGEX_SERIAL.test(configNode.serialnum)) {
      // start discovery
      discoverSpecificSonosPlayerBySerial(configNode.serialnum, TIMEOUT_DISCOVERY)
        .then((discoveredHost) => {
          debug('found ip address >>%s', discoveredHost)
          const validHost = discoveredHost
          
          // subscribe and set processing function
          node.on('input', (msg) => {
            debug('msg received >>%s', 'universal node')
            processInputMsg(node, config, msg, validHost)
            // processInputMsg sets msg.nrcspCmd to current command
              .then((msgUpdate) => {
                Object.assign(msg, msgUpdate) // Defines the output message
                success(node, msg, msg.nrcspCmd)
              })
              .catch((error) => {
                let lastFunction = 'processInputMsg'
                if (msg.nrcspCmd && typeof msg.nrcspCmd === 'string') {
                  lastFunction = msg.nrcspCmd
                }
                failure(node, msg, error, lastFunction)
              })
          })
          debug('successfully subscribed - node.on')
          node.status({ fill: 'green', shape: 'dot', text: 'ok:ready' })

        })
        .catch((err) => {
          // discovery failed - most likely because could not find any matching player
          debug('discovery failed >>%s', JSON.stringify(err, Object.getOwnPropertyNames(err)))
          failure(node, null, 'could not discover player by serial', thisFunctionName)
          return
        })
   
    } else {
      failure(node, null,
        new Error(`${PACKAGE_PREFIX} both ip address/serial number are invalid`), thisFunctionName)
      return
    }
  }

  /** Validate sonos player object, command and dispatch further.
   * @param {object} node current node
   * @param {object} config current node configuration
   * @param {string} config.command the command from node dialog
   * @param {string} config.state the state from node dialog
   * @param {object} msg incoming message
   * @param {string} urlHost host of SONOS player such as 192.168.178.37
   *
   * Creates also msg.nrcspCmd with the used command in lower case.
   * Modifies msg.payload if set in dialog or for output!
   *
   * @returns {promise} All commands have to return a promise - object
   * example: returning {} means msg is not modified (except msg.nrcspCmd)
   * example: returning { 'payload': true } means 
   * the original msg.payload will be modified and set to true.
   */
  async function processInputMsg (node, config, msg, urlHost) {
    debug('method:%s', 'processInputMsg')
    const tsPlayer = new SonosDevice(urlHost)
    if (!isTruthy(tsPlayer)) {
      throw new Error(`${PACKAGE_PREFIX} tsPlayer is undefined`)
    }
    if (!(isTruthyPropertyStringNotEmpty(tsPlayer, ['host'])
      && isTruthyProperty(tsPlayer, ['port']))) {
      throw new Error(`${PACKAGE_PREFIX} tsPlayer ip address or port is missing `)
    }
    // needed for my extension in Extensions
    tsPlayer.urlObject = new URL(`http://${tsPlayer.host}:${tsPlayer.port}`)

    // Command, required: node dialog overrules msg, store lowercase version in nrcspCmd
    let command
    if (config.command !== 'message') { // command specified in node dialog
      command = config.command
    } else {
      if (!isTruthyPropertyStringNotEmpty(msg, ['topic'])) {
        throw new Error(`${PACKAGE_PREFIX} command is undefined/invalid`)
      }
      command = String(msg.topic).toLowerCase()

      // you may omit mysonos. prefix - so we add it here
      const REGEX_PREFIX = /^(mysonos|library)/
      if (!REGEX_PREFIX.test(command)) {
        command = `mysonos.${command}`
      }
    }
    if (!Object.prototype.hasOwnProperty.call(COMMAND_TABLE_MYSONOS, command)) {
      throw new Error(`${PACKAGE_PREFIX} command is invalid >>${command} `)
    }
    msg.nrcspCmd = command // store command

    // state: node dialog overrules msg.
    let state
    if (config.state) { // payload specified in node dialog
      state = RED.util.evaluateNodeProperty(config.state, config.stateType, node)
      if (typeof state === 'string') {
        if (state !== '') {
          msg.payload = state
        }
      } else if (typeof state === 'number') {
        if (state !== '') {
          msg.payload = state
        }
      } else if (typeof state === 'boolean') {
        msg.payload = state
      }
    }
    
    return COMMAND_TABLE_MYSONOS[command](msg, tsPlayer)
  }

  //
  //                                          COMMANDS
  //...............................................................................................

  /**
   * @typedef {object} exportedItem exported data which can be used in group.play.export
   * @global
   * @property {string} uri the URI to be used in SetAVTransport or AddURIToQeueu
   * @property {string} metadata metadata for the uri
   * @property {boolean} queue true means use AddURI otherwise SetAVTransport
   */

  /**  Exports first Music-Library album matching search string (is encoded)
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<exportedItem>}
   * 
   * @throws {error} 'no matching item found'
   * @throws {error} all methods
   */
  async function libraryExportAlbum (msg, tsPlayer) {
    debug('method:%s', 'libraryExportAlbum')
    // payload title search string is required.
    const validSearch = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string')
    
    const list
      = await getMusicLibraryItems('A:ALBUM:', validSearch, REQUESTED_COUNT_ML_EXPORT, tsPlayer)
    if (list.length === 0) {
      throw new Error(`${PACKAGE_PREFIX} no matching item found`)
    }

    // the first matching is being used
    return { 'payload': { 'uri': list[0].uri, 'metadata': list[0].metadata, 'queue': true } }
  }

  /**  Exports first Music-Library playlist matching search string (is encoded)
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<exportedItem>
   *
   * @throws {error} 'no matching item found'
   * @throws {error} all methods
   * 
   */
  async function libraryExportPlaylist (msg, tsPlayer) {
    debug('method:%s', 'libraryExportPlaylist')
    // payload title search string is required.
    const validSearch = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string')
  
    const list = await getMusicLibraryItems(
      'A:PLAYLISTS:', validSearch, REQUESTED_COUNT_ML_EXPORT, tsPlayer)
    if (list.length === 0) {
      throw new Error(`${PACKAGE_PREFIX} no matching item found`)
    }
  
    // the first matching is being used
    return { 'payload': { 'uri': list[0].uri, 'metadata': list[0].metadata, 'queue': true } }
  }

  /**  Exports first Music-Library track matching search string (is encoded)
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<exportedItem>} see def
   *
   * @throws {error} 'no matching item found'
   * @throws {error} all methods
   */
  async function libraryExportTrack (msg, tsPlayer) {
    debug('method:%s', 'libraryExportTrack')
    // payload title search string is required.
    const validSearch = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string')
  
    const list
      = await getMusicLibraryItems('A:TRACKS:', validSearch, REQUESTED_COUNT_ML_EXPORT, tsPlayer)
    if (list.length === 0) {
      throw new Error(`${PACKAGE_PREFIX} no matching item found`)
    }
  
    // the first matching is being used
    return { 'payload': { 'uri': list[0].uri, 'metadata': list[0].metadata, 'queue': true } }
  }

  /**  Outputs array Music-Library albums - search string is optional
   * @param {object} msg incoming message
   * @param {string} [msg.payload] search string
   * @param {string} [msg.requestedCount= REQUESTED_COUNT_ML_DEFALUT] 
   *                  maximum number of found albums
   * @param {object} tsPlayer sonos-ts player with urlObject as Javascript build-in URL
   *
   * @returns {promise} {payload: array of objects: uri metadata queue title artist} 
   * array may be empty
   *
   * @throws {error} all methods
   */
  async function libraryGetAlbums (msg, tsPlayer) {
    debug('method:%s', 'libraryGetAlbums')
    // msg.requestedCount is optional - if missing default is REQUESTED_COUNT_ML_DEFAULT
    const requestedCount = validToInteger(
      msg, 'requestedCount', 1, 999, 'requested count', REQUESTED_COUNT_ML_DEFAULT)

    // payload as title search string is optional.
    const validSearch
      // eslint-disable-next-line max-len
      = validRegex(msg, 'payload', REGEX_ANYCHAR_BLANK, 'payload search in title', '')
    
    const list
      = await getMusicLibraryItems('A:ALBUM:', validSearch, requestedCount, tsPlayer)
    
    // add ip address to albumUri
    const payload = list.map(element => {
      if (typeof element.artUri === 'string' && element.artUri.startsWith('/getaa')) {
        element.artUri = tsPlayer.urlObject.origin + element.artUri
      }  
      element.processingType = 'queue'
      return element
    })

    return { payload }
  }

  /**  Outputs array Music-Library playlists - search string is optional
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {string} [msg.requestedCount= REQUESTED_COUNT_ML_DEFALUT] 
   *                  maximum number of found albums
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {payload: array of objects: uri metadata queue title artist} 
   * array may be empty
   *
   * @throws {error} all methods
   */
  async function libraryGetPlaylists (msg, tsPlayer) {
    debug('method:%s', 'libraryGetPlaylists')
    // msg.requestedCount is optional - if missing default is REQUESTED_COUNT_ML_DEFAULT
    const requestedCount = validToInteger(
      msg, 'requestedCount', 1, 999, 'requested count', REQUESTED_COUNT_ML_DEFAULT)

    // payload as title search string is optional.
    const validSearch
      // eslint-disable-next-line max-len
      = validRegex(msg, 'payload', REGEX_ANYCHAR_BLANK, 'payload search in title', '')
    
    const list
      = await getMusicLibraryItems('A:PLAYLISTS:', validSearch, requestedCount, tsPlayer)
    
    // add ip address to albumUri
    const payload = list.map(element => {
      if (typeof element.artUri === 'string' && element.artUri.startsWith('/getaa')) {
        element.artUri = tsPlayer.urlObject.origin + element.artUri
      }  
      element.processingType = 'queue'
      return element
    })

    return { payload }
  }

  /**  Queue first Music-Library playlist matching search string (is encoded) - maximum 100
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {payload: uri metadata queue title artist}  
   *
   * @throws {error} 'no matching item found'
   * @throws {error} all methods
   */
  async function libraryQueuePlaylist (msg, tsPlayer) {
    debug('method:%s', 'libraryQueuePlaylist')
    // payload title search string is required.
    const validSearch = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string')
  
    const list = await getMusicLibraryItems(
      'A:PLAYLISTS:', validSearch, REQUESTED_COUNT_ML_EXPORT, tsPlayer)
    if (list.length === 0) {
      throw new Error(`${PACKAGE_PREFIX} no matching item found`)
    }

    await tsPlayer.AddUriToQueue(list[0].uri)
    
    return {}
  }

  /**  Export first My-Sonos item matching search string.
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<exportedItem>} 
   *
   * @throws 'could not find any My Sonos items', 'no title matching search string'
   * @throws {error} all methods
   *
   * Info: content validation of mediaType, serviceName
   */
  async function mysonosExportItem (msg, tsPlayer) {
    debug('method:%s', 'mysonosExportItem')
    // payload title search string is required.
    const validSearch
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string')

    const mySonosItems = await getMySonos(tsPlayer, REQUESTED_COUNT_MYSONOS_EXPORT)
    if (!isTruthy(mySonosItems)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }
    
    // find in title property (findIndex returns -1 if not found)
    const foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validSearch))
    })
    if (foundIndex === -1) {
      throw new Error(`${PACKAGE_PREFIX} no title matching search string >>${validSearch}`)
    }

    return { 'payload': {
      'uri': mySonosItems[foundIndex].uri,
      'metadata': mySonosItems[foundIndex].metadata,
      'queue': (mySonosItems[foundIndex].processingType === 'queue')
    } }

  }

  /**  Outputs array of My-Sonos items as object.
   * @param {object} msg incoming message
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<mySonosItem[]>}
   *
   * @throws 'could not find any My Sonos items'
   * @throws {error} all methods
   */
  async function mysonosGetItems (msg, tsPlayer) {
    debug('method:%s', 'mysonosGetItems')
    const payload = await getMySonos(tsPlayer, REQUESTED_COUNT_MYSONOS_DEFAULT)
    if (!isTruthy(payload)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }

    return { payload }
  }

  /**  Queues (aka add) first My-Sonos item matching search string.
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {}
   *
   * @throws 'could not find any My Sonos items', 'no title matching search string'
   * @throws {error} all methods
   * 
   */
  async function mysonosQueueItem (msg, tsPlayer) {
    debug('method:%s', 'mysonosQueueItem')
    // payload title search string is required.
    const validSearch
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string')

    const mySonosItems = await getMySonos(tsPlayer, REQUESTED_COUNT_MYSONOS_DEFAULT)
    if (!isTruthy(mySonosItems)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }
    // find in title, findIndex returns -1 if not found
    const foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validSearch) && (item.processingType === 'queue'))
    })
    if (foundIndex === -1) {
      throw new Error(`${PACKAGE_PREFIX} no title matching search string >>${validSearch}`)
    }
    
    await tsPlayer.AVTransportService.AddURIToQueue(
      { 'InstanceID': 0, 
        'EnqueuedURI': mySonosItems[foundIndex].uri,
        'EnqueuedURIMetaData': mySonosItems[foundIndex].metadata,
        'DesiredFirstTrackNumberEnqueued': 0,
        'EnqueueAsNext': true
      })

    return {}
  }

  /** Stream (aka play) first My-Sonos item matching search string.
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {string} msg.volume new volume 0 ..100
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {}
   *
   * @throws 'could not find any My Sonos items', 'no title matching search string'
   * @throws {error} all methods
   */
  async function mysonosStreamItem (msg, tsPlayer) {
    debug('method:%s', 'mysonosStreamItem')
    // payload title search string is required.
    const validSearch
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string')

    const mySonosItems = await getMySonos(tsPlayer, REQUESTED_COUNT_MYSONOS_DEFAULT)
    if (!isTruthy(mySonosItems)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }
    // find in title, findIndex returns -1 if not found
    const foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validSearch) && (item.processingType === 'stream'))
    })
    if (foundIndex === -1) {
      throw new Error(`${PACKAGE_PREFIX} no title matching search string >>${validSearch}`)
    }
    
    await tsPlayer.SetAVTransportURI(mySonosItems[foundIndex].uri)

    // change volume if is provided
    const newVolume = validToInteger(msg, 'volume', 0, 100, 'volume', -1)
    if (newVolume !== -1) {
      await tsPlayer.SetVolume(newVolume)
    }
    tsPlayer.Play()
    
    return {}
  }

  RED.nodes.registerType('sonos-manage-mysonos', SonosManageMySonosNode)
}
