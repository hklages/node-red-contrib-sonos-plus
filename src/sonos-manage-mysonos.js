/**
 * All functions provided by My Sonos node. My Sonos node handles Music-Library and My-Sonos.
 *
 * @module MySonos
 * 
 * @author Henning Klages
 * 
 * @since 2021-02-18
*/
'use strict'

const {
  REGEX_SERIAL, REGEX_IP, REGEX_ANYCHAR, PACKAGE_PREFIX, TIMEOUT_HTTP_REQUEST, TIMEOUT_DISCOVERY
} = require('./Globals.js')

const { discoverSonosPlayerBySerial } = require('./Discovery.js')

const { getMySonos: xGetMySonos } = require('./Sonos-CommandsTs.js')

const { isSonosPlayer: xIsSonosPlayer, parseBrowseToArray: xParseBrowseToArray,
  executeActionV6, failure, success
} = require('./Sonos-Extensions.js')

const {
  isTruthy: xIsTruthy, isTruthyProperty: xIsTruthyProperty,
  isTruthyPropertyStringNotEmpty: xIsTruthyPropertyStringNotEmpty, validRegex, validToInteger,
} = require('./HelperTs.js')

const { SonosDevice } = require('@svrooij/sonos/lib')

const debug = require('debug')(`${PACKAGE_PREFIX}my-sonos`)

module.exports = function (RED) {

  // function lexical order, ascending
  const COMMAND_TABLE_MYSONOS = {
    'library.export.album': libraryExportAlbum,
    'library.export.playlist': libraryExportPlaylistV2,
    'library.get.albums': libraryGetAlbums,
    'library.get.playlists': libraryGetPlaylistsV2,
    'library.queue.playlist': libraryQueuePlaylistV2,
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
            node.status({ fill: 'green', shape: 'dot', text: 'ok:ready for message' })      
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
          node.status({ fill: 'green', shape: 'dot', text: 'ok:subscribed' })
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
    msg.topic = command // Sets topic - is only used in playerSetEQ, playerGetEQ

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

  /**  Exports first Music-Library album matching search string (is encoded) - maximum 100
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {payload: uri metadata queue title artist}  
   *
   * @throws {error} all functions
   */
  async function libraryExportAlbum (msg, tsPlayer) {
    // payload title search string is required.
    // eslint-disable-next-line max-len
    const validatedSearch = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)
    
    const browseMlAlbum = await executeActionV6(tsPlayer.urlObject,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'A:ALBUM:' + encodeURIComponent(validatedSearch),
        BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0,
        RequestedCount: 100, SortCriteria: ''
      })

    const listAlbum = await xParseBrowseToArray(browseMlAlbum, 'container', PACKAGE_PREFIX)
    if (!xIsTruthy(listAlbum)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse Album is invalid.`)
    }

    return { 'payload': { uri: listAlbum[0].uri, metadata: listAlbum[0].metadata, queue: true } }

  }

  /**  Exports first Music-Library playlist matching search string (is encoded) - maximum 100
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {payload: uri metadata queue title artist}  
   *
   * @throws {error} all functions
   */
  async function libraryExportPlaylistV2 (msg, tsPlayer) {
    // payload title search string is required.
    const validatedSearchString
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)
    
    const browseMlPlaylists = await executeActionV6(tsPlayer.urlObject,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'A:PLAYLISTS:' + encodeURIComponent(validatedSearchString),
        BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0,
        RequestedCount: 100, SortCriteria: ''
      })

    const listPls = await xParseBrowseToArray(browseMlPlaylists, 'container', PACKAGE_PREFIX)
    if (!xIsTruthy(listPls)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse playlists is invalid.`)
    }
    
    return { 'payload': { uri: listPls[0].uri, metadata: listPls[0].metadata, queue: true } }
  }

  /**  Outputs array Music-Library albums - search string is optional
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {string} msg.requestedCount optional, maximum number of found albums, 
   *                  0...999, default 100
   * @param {string} msg.searchTitle search string, optional
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {payload: array of objects: uri metadata queue title artist} 
   * array may be empty  
   *
   * @throws all functions
   * TODO Notion libraryExportAlbum
   */
  async function libraryGetAlbums (msg, tsPlayer) {
    // msg.requestedCount is optional - if missing default is 100
    const requestedCount = validToInteger(
      msg, 'requestedCount', 1, 999, 'requested count', PACKAGE_PREFIX, 100)

    // msg albumName search string is optional - default is empty string
    let validatedSearchString
      = validRegex(msg, 'searchTitle', REGEX_ANYCHAR, 'search title', PACKAGE_PREFIX, '')
    if (validatedSearchString !== '') {
      validatedSearchString = ':' + encodeURIComponent(validatedSearchString)
    }

    const browseAlbum = await executeActionV6(tsPlayer.urlObject,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'A:ALBUM' + validatedSearchString, BrowseFlag: 'BrowseDirectChildren',
        Filter: '*', StartingIndex: 0, RequestedCount: requestedCount, SortCriteria: ''
      })
  
    const listAlbum = await xParseBrowseToArray(browseAlbum, 'container', PACKAGE_PREFIX)
    if (!xIsTruthy(listAlbum)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse Album is invalid.`)
    }

    // add ip address to albumUri
    const albumList = listAlbum.map(element => {
      if (typeof element.artUri === 'string' && element.artUri.startsWith('/getaa')) {
        element.artUri = tsPlayer.urlObject.origin + element.artUri
      }  
      element.processingType = 'queue'
      return element
    })

    return { 'payload': albumList.slice() }
  }

  /**  Outputs array Music-Library playlists - search string is optional
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {string} msg.requestedCount optional, maximum number of found albums, 
   *                 0...999, default 100
   * @param {string} msg.searchTitle search string, optional
  * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {payload: array of objects: uri metadata queue title artist} 
   * array may be empty  
   *
   * @throws all functions
   */
  async function libraryGetPlaylistsV2 (msg, tsPlayer) {
    // msg.requestedCount is optional - if missing default is 100
    const requestedCount = validToInteger(
      msg, 'requestedCount', 1, 999, 'requested count', PACKAGE_PREFIX, 100)

    // msg search string is optional - default is empty string
    let validatedSearchString
      = validRegex(msg, 'searchTitle', REGEX_ANYCHAR, 'search title', PACKAGE_PREFIX, '')
    if (validatedSearchString !== '') {
      validatedSearchString = ':' + encodeURIComponent(validatedSearchString)
    }

    const browsePlaylists = await executeActionV6(tsPlayer.urlObject,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'A:PLAYLISTS' + validatedSearchString, BrowseFlag: 'BrowseDirectChildren',
        Filter: '*', StartingIndex: 0, RequestedCount: requestedCount, SortCriteria: ''
      })
    
    const listPl = await xParseBrowseToArray(browsePlaylists, 'container', PACKAGE_PREFIX)
    if (!xIsTruthy(listPl)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse Playlists is invalid.`)
    }

    // add ip address to albumUri
    const playlistList = listPl.map(element => {
      if (typeof element.artUri === 'string' && element.artUri.startsWith('/getaa')) {
        element.artUri = tsPlayer.urlObject.origin + element.artUri
      }  
      element.processingType = 'queue'
      return element
    })

    return { 'payload': playlistList.slice() }
  }

  /**  Queue first Music-Library playlist matching search string (is encoded) - maximum 100
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {payload: uri metadata queue title artist}  
   *
   * @throws {error} all functions
   */
  async function libraryQueuePlaylistV2 (msg, tsPlayer) {
    // payload title search string is required.
    const validatedSearchString
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)
    
    const browseMlPlaylists = await executeActionV6(tsPlayer.urlObject,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'A:PLAYLISTS:' + encodeURIComponent(validatedSearchString),
        BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0,
        RequestedCount: 100, SortCriteria: ''
      })
    if (!xIsTruthyProperty(browseMlPlaylists, ['NumberReturned'])) {
      throw new Error(`${PACKAGE_PREFIX} invalid response Browse playlists, missing NumberReturned`)
    }
    if (Number(browseMlPlaylists.NumberReturned) === 0) {
      throw new Error(`${PACKAGE_PREFIX} Could not find any title matching search string`)
    }

    const listPls = await xParseBrowseToArray(browseMlPlaylists, 'container')
    if (!xIsTruthy(listPls)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse playlists is invalid.`)
    }
    await tsPlayer.AddUriToQueue(listPls[0].uri,)
    
    return {}
  }

  /**  Export first My-Sonos item matching search string.
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} see return
   *
   * @throws all functions
   *
   * Info:  content validation of mediaType, serviceName
   */
  async function mysonosExportItem (msg, tsPlayer) {
    debug('entering method mysonosExportItem')
    // payload title search string is required.
    const validatedSearchString
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)
    // TODO requested count in globals
    const mySonosItems = await xGetMySonos(tsPlayer, 200)
    if (!xIsTruthy(mySonosItems)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }
    
    // find in string
    let foundIndex = -1
    foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validatedSearchString))
    })
    if (foundIndex < 0) {
      // eslint-disable-next-line max-len
      throw new Error(`${PACKAGE_PREFIX} No title matching search string >>${validatedSearchString}`)
    }

    return { payload: {
      uri: mySonosItems[foundIndex].uri,
      metadata: mySonosItems[foundIndex].metadata,
      queue: (mySonosItems[foundIndex].processingType === 'queue')
    } }

  }

  /**  Outputs array of My-Sonos items as object.
   * @param {object} msg incoming message
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<mySonosItem[]>} payload  = array of my Sonos items 
   * {title, albumArt, uri, metadata, sid, upnpClass, processingType}
   * uri, metadata, sid, upnpclass: empty string are allowed
   *
   * @throws nrcsp error - all functions
   */
  async function mysonosGetItems (msg, tsPlayer) {
    // TODO requested count in globals
    const payload = await xGetMySonos(tsPlayer, 200)
    if (!xIsTruthy(payload)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }

    return { payload }
  }

  /**  Queues (aka add) first My-Sonos item matching search string.
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * { processingType: "queue", mediaType: "playlist", serviceName: "all" }
   
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {}
   *
   * @throws nrcsp-error all functions
   *
   * Info:  msg.filter currently undocumented feature.
   */
  // TODO Notion implement filter
  // TODO Notion clearQueue as parameter
  async function mysonosQueueItem (msg, tsPlayer) {
    // payload title search string is required.
    const validatedSearchString
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)

    // create filter object with processingType queue
    const filter = { processingType: 'queue' } // no streams!
    filter.serviceName = 'all'
    filter.mediaType = 'all'
    
    // TODO requested count in globals
    const mySonosItems = await xGetMySonos(tsPlayer, 200)
    if (!xIsTruthy(mySonosItems)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }
    // find in title
    let foundIndex = -1
    foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validatedSearchString))
    })
    if (foundIndex < 0) {
      // eslint-disable-next-line max-len
      throw new Error(`${PACKAGE_PREFIX} No title matching search string >>${validatedSearchString}`)
    }
    
    await tsPlayer.queue({
      uri: mySonosItems[foundIndex].uri,
      metadata: mySonosItems[foundIndex].metadata
    })

    return {}
  }

  /** Stream (aka play) first My-Sonos item matching search string.
   * @param {object} msg incoming message
   * @param {string} msg.payload search string
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {}
   *
   * @throws all functions
   */
  async function mysonosStreamItem (msg, tsPlayer) {
    // payload title search string is required.
    const validatedSearchString
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string', PACKAGE_PREFIX)
    
    const mySonosItems = await xGetMySonos(tsPlayer)
    if (!xIsTruthy(mySonosItems)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }

    // find in title
    let foundIndex = -1
    foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validatedSearchString))
    })
    if (foundIndex < 0) {
      // eslint-disable-next-line max-len
      throw new Error(`${PACKAGE_PREFIX} No title matching search string >>${validatedSearchString}`)
    }

    // TODO Notion replace node-sonos
    // this does setting the uri AND plays it!
    await tsPlayer.SetAVTransportURI(mySonosItems[foundIndex].uri)

    // change volume if is provided
    const newVolume = validToInteger(msg, 'volume', 0, 100, 'volume', PACKAGE_PREFIX, -1)
    if (newVolume !== -1) {
      await tsPlayer.SetVolume(newVolume)
    }
    tsPlayer.Play()
    
    return {} // don't touch volume
  }

  RED.nodes.registerType('sonos-manage-mysonos', SonosManageMySonosNode)
}
