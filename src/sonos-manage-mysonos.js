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
  REGEX_SERIAL, REGEX_IP, REGEX_ANYCHAR, PACKAGE_PREFIX,
  TIMEOUT_HTTP_REQUEST, TIMEOUT_DISCOVERY,
  REQUESTED_COUNT_ML_EXPORT, REQUESTED_COUNT_ML_DEFAULT,
  REQUESTED_COUNT_MYSONOS_DEFAULT, REQUESTED_COUNT_MYSONOS_EXPORT
} = require('./Globals.js')

const { discoverSonosPlayerBySerial } = require('./Discovery.js')

const { getMySonos: xGetMySonos, getMusicLibraryItems: xGetMusicLibraryItems }
  = require('./Commands.js')

const { isSonosPlayer: xIsSonosPlayer, failure, success
} = require('./Extensions.js')

const {
  isTruthy: xIsTruthy, isTruthyProperty: xIsTruthyProperty,
  isTruthyPropertyStringNotEmpty: xIsTruthyPropertyStringNotEmpty, validRegex, validToInteger,
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
   * @param  {object} config current node configuration data
   */
  function SonosManageMySonosNode (config) {
    RED.nodes.createNode(this, config)
    const thisFunction = 'create and subscribe'
    const node = this
    node.status({}) // Clear node status

    // Ip address overruling serial number - at least one must be valid
    const configNode = RED.nodes.getNode(config.confignode)
    if (xIsTruthyPropertyStringNotEmpty(configNode, ['ipaddress']) 
      && REGEX_IP.test(configNode.ipaddress)) {
      // Using config ip address to define the default SONOS player
      // and check whether that IP address is reachable (http request)
      const port = 1400 // assuming this port
      const playerUrlObject = new URL(`http://${configNode.ipaddress}:${port}`)
      xIsSonosPlayer(playerUrlObject, TIMEOUT_HTTP_REQUEST)
        .then((isSonos) => {
          if (isSonos) {
            node.on('input', (msg) => {
              node.debug('node - msg received')
              processInputMsg(node, config, msg, playerUrlObject.hostname)
                .then((msgUpdate) => {
                  Object.assign(msg, msgUpdate) // Defines the output message
                  success(node, msg, msg.nrcspCmd)
                })
                .catch((error) => {
                  let thisFunction = 'processing input msg'
                  if (msg.nrcspCmd && typeof msg.nrcspCmd === 'string') {
                    thisFunction = msg.nrcspCmd
                  }
                  failure(node, msg, error, thisFunction)
                })
            })
            node.status({ fill: 'green', shape: 'dot', text: 'ok:ready' })      
          } else {
            node.status({ fill: 'red', shape: 'dot', text: 'error: given ip not reachable' })      
          }
        })
        .catch((err) => {
          debug('xIsSonos failed >>%s', JSON.stringify(err, Object.getOwnPropertyNames(err)))
          node.status({ fill: 'red', shape: 'dot', text: 'error: xIsSonos went wrong' })
        })
      
    } else if (xIsTruthyPropertyStringNotEmpty(configNode, ['serialnum'])
      && REGEX_SERIAL.test(configNode.serialnum)) {
      // start discovery
      discoverSonosPlayerBySerial(configNode.serialnum, TIMEOUT_DISCOVERY)
        .then((discoveredHost) => {
          debug('found ip address >>%s', discoveredHost)
          const validHost = discoveredHost
          node.on('input', (msg) => {
            node.debug('node - msg received')
            processInputMsg(node, config, msg, validHost)
              .then((msgUpdate) => {
                Object.assign(msg, msgUpdate) // Defines the output message
                success(node, msg, msg.nrcspCmd)
              })
              .catch((error) => {
                let thisFunction = 'processing input msg'
                if (msg.nrcspCmd && typeof msg.nrcspCmd === 'string') {
                  thisFunction = msg.nrcspCmd
                }
                failure(node, msg, error, thisFunction)
              })
          })
          node.status({ fill: 'green', shape: 'dot', text: 'ok:ready' })
        })
        .catch((err) => {
          // discovery failed - most likely because could not find any matching player
          debug('discovery failed >>%s', JSON.stringify(err, Object.getOwnPropertyNames(err)))
          failure(node, null, 'could not discover player by serial', thisFunction)
          return
        })
   
    } else {
      failure(node, null,
        new Error(`${PACKAGE_PREFIX} both ip address/serial number are invalid`), thisFunction)
      return
    }
  }

  /** Validate sonos player object, command and dispatch further.
   * @param  {object}  node current node
   * @param  {object}  config current node configuration
   * @param  {string}  config.command the command from node dialog
   * @param  {string}  config.state the state from node dialog
   * @param  {object}  msg incoming message
   * @param  {string}  urlHost IP address of SONOS player such as 192.168.178.37
   *
   *
   * @returns {promise} All commands have to return a promise - object
   * example: returning {} means message is not modified
   * example: returning { msg.payload: true} means 
   * the original msg.payload will be modified and set to true.
   */
  async function processInputMsg (node, config, msg, urlHost) {
    
    const tsPlayer = new SonosDevice(urlHost)
    if (!xIsTruthy(tsPlayer)) {
      throw new Error(`${PACKAGE_PREFIX} tsPlayer is undefined`)
    }
    if (!(xIsTruthyPropertyStringNotEmpty(tsPlayer, ['host'])
      && xIsTruthyProperty(tsPlayer, ['port']))) {
      throw new Error(`${PACKAGE_PREFIX} tsPlayer ip address or port is missing `)
    }
    tsPlayer.urlObject = new URL(`http://${tsPlayer.host}:${tsPlayer.port}`)

    // Command, required: node dialog overrules msg, store lowercase version in command
    let command
    if (config.command !== 'message') { // command specified in node dialog
      command = config.command
    } else {
      if (!xIsTruthyPropertyStringNotEmpty(msg, ['topic'])) {
        throw new Error(`${PACKAGE_PREFIX} command is undefined/invalid`)
      }
      command = String(msg.topic)
      command = command.toLowerCase()

      // you may omit mysonos. prefix - so we add it here
      const REGEX_PREFIX = /^(mysonos|library)/
      if (!REGEX_PREFIX.test(command)) {
        command = `mysonos.${command}`
      }
    }
    msg.nrcspCmd = command // store command as get commands will overrides msg.payload
    msg.topic = command // update msg.topic with dialog data - is used in playerSetEQ, playerGetEQ

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
        msg.topic = state
      }
    }

    if (!Object.prototype.hasOwnProperty.call(COMMAND_TABLE_MYSONOS, command)) {
      throw new Error(`${PACKAGE_PREFIX} command is invalid >>${command} `)
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
   * @throws {error} all methods
   * @throws {error} no matching item found
   */
  async function libraryExportAlbum (msg, tsPlayer) {
    // payload title search string is required.
    const validSearch = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)
    
    const list
      = await xGetMusicLibraryItems('A:ALBUM:', validSearch, REQUESTED_COUNT_ML_EXPORT, tsPlayer)
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
   * @throws {error} all methods
   * @throws {error} no matching item found
   * 
   */
  async function libraryExportPlaylist (msg, tsPlayer) {
    // payload title search string is required.
    const validSearch = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)
  
    const list = await xGetMusicLibraryItems(
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
   * @returns {promise<exportedItem>}  see def
   *
   * @throws {error} all methods
   * @throws {error} no matching item found
   */
  async function libraryExportTrack (msg, tsPlayer) {
    // payload title search string is required.
    const validSearch = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)
  
    const list
      = await xGetMusicLibraryItems('A:TRACKS:', validSearch, REQUESTED_COUNT_ML_EXPORT, tsPlayer)
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
   * @throws error methods
   */
  async function libraryGetAlbums (msg, tsPlayer) {
    // msg.requestedCount is optional - if missing default is REQUESTED_COUNT_ML_DEFAULT
    const requestedCount = validToInteger(
      msg, 'requestedCount', 1, 999, 'requested count', PACKAGE_PREFIX, REQUESTED_COUNT_ML_DEFAULT)

    // payload as title search string is optional.
    const validSearch
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'payload search in title', PACKAGE_PREFIX, '')
    
    const list
      = await xGetMusicLibraryItems('A:ALBUM:', validSearch, requestedCount, tsPlayer)
    
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
   * @throws all methods
   */
  async function libraryGetPlaylists (msg, tsPlayer) {
    // msg.requestedCount is optional - if missing default is REQUESTED_COUNT_ML_DEFAULT
    const requestedCount = validToInteger(
      msg, 'requestedCount', 1, 999, 'requested count', PACKAGE_PREFIX, REQUESTED_COUNT_ML_DEFAULT)

    // payload as title search string is optional.
    const validSearch
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'payload search in title', PACKAGE_PREFIX, '')
    
    const list
      = await xGetMusicLibraryItems('A:PLAYLISTS:', validSearch, requestedCount, tsPlayer)
    
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
   * @throws {error} all methods
   */
  async function libraryQueuePlaylist (msg, tsPlayer) {
    // payload title search string is required.
    const validSearch = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)
  
    const list = await xGetMusicLibraryItems(
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
   * @throws all methods
   * @throws 'could not find any My Sonos items', 'no title matching search string'
   *
   * Info:  content validation of mediaType, serviceName
   */
  async function mysonosExportItem (msg, tsPlayer) {
    debug('entering method mysonosExportItem')
    // payload title search string is required.
    const validSearch
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)

    const mySonosItems = await xGetMySonos(tsPlayer, REQUESTED_COUNT_MYSONOS_EXPORT)
    if (!xIsTruthy(mySonosItems)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }
    
    // find in title property
    let foundIndex = -1
    foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validSearch))
    })
    if (foundIndex < 0) {
      throw new Error(`${PACKAGE_PREFIX} No title matching search string >>${validSearch}`)
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
   * @throws all methods
   * @throws 'could not find any My Sonos items'
   */
  async function mysonosGetItems (msg, tsPlayer) {
    const payload = await xGetMySonos(tsPlayer, REQUESTED_COUNT_MYSONOS_DEFAULT)
    if (!xIsTruthy(payload)) {
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
   * @throws all methods
   * @throws 'could not find any My Sonos items', 'no title matching search string'
   * 
   */
  async function mysonosQueueItem (msg, tsPlayer) {
    // payload title search string is required.
    const validSearch
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)

    const mySonosItems = await xGetMySonos(tsPlayer, REQUESTED_COUNT_MYSONOS_DEFAULT)
    if (!xIsTruthy(mySonosItems)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }
    // find in title
    let foundIndex = -1
    foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validSearch) && (item.processingType === 'queue'))
    })
    if (foundIndex < 0) {
      throw new Error(`${PACKAGE_PREFIX} no title matching search string >>${validSearch}`)
    }
    
    await tsPlayer.SetAVTransportURI.AddUriToQueue(
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
   * @throws all methods
   * @throws 'could not find any My Sonos items', 'no title matching search string'
   */
  async function mysonosStreamItem (msg, tsPlayer) {
    // payload title search string is required.
    const validSearch
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)

    const mySonosItems = await xGetMySonos(tsPlayer, REQUESTED_COUNT_MYSONOS_DEFAULT)
    if (!xIsTruthy(mySonosItems)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }
    // find in title
    let foundIndex = -1
    foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validSearch) && (item.processingType === 'stream'))
    })
    if (foundIndex < 0) {
      throw new Error(`${PACKAGE_PREFIX} no title matching search string >>${validSearch}`)
    }
    
    await tsPlayer.SetAVTransportURI(mySonosItems[foundIndex].uri)

    // change volume if is provided
    const newVolume = validToInteger(msg, 'volume', 0, 100, 'volume', PACKAGE_PREFIX, -1)
    if (newVolume !== -1) {
      await tsPlayer.SetVolume(newVolume)
    }
    tsPlayer.Play()
    
    return {}
  }

  RED.nodes.registerType('sonos-manage-mysonos', SonosManageMySonosNode)
}
