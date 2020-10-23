const {
  REGEX_SERIAL, REGEX_IP, REGEX_ANYCHAR,
  NRCSP_ERRORPREFIX,
  discoverSonosPlayerBySerial,
  isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString,
  stringValidRegex, string2ValidInteger,
  failure, success
} = require('./Helper.js')

const { getAllMySonosItemsV2, findStringInMySonosTitleV1, executeAction, extractContainers } = require('./Sonos-Commands.js')

const { Sonos } = require('sonos')

module.exports = function (RED) {
  'use strict'

  // function lexical order, ascending
  const COMMAND_TABLE_MYSONOS = {
    'library.export.album': libraryExportAlbum,
    'library.export.playlist': libraryExportPlaylist,
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
    const nrcspFunction = 'create and subscribe'
    const node = this

    // ip address overruling serial number - at least one must be valid
    const configNode = RED.nodes.getNode(config.confignode)
    if (isValidProperty(configNode, ['ipaddress']) && typeof configNode.ipaddress === 'string' && REGEX_IP.test(configNode.ipaddress)) {
      // ip address is being used - default case
    } else {
      if (isValidProperty(configNode, ['serialnum']) && typeof configNode.serialnum === 'string' && REGEX_SERIAL.test(configNode.serialnum)) {
        discoverSonosPlayerBySerial(node, configNode.serialnum, (err, newIpaddress) => {
          if (err) {
            failure(node, null, new Error(`${NRCSP_ERRORPREFIX} could not figure out ip address (discovery)`), nrcspFunction)
            return
          }
          if (newIpaddress === null) {
            failure(node, null, new Error(`${NRCSP_ERRORPREFIX} could not find any player by serial`), nrcspFunction)
          } else {
            // setting of node status is done in following call handleInputMessage
            node.debug(`OK sonos player ${newIpaddress} was found`)
            configNode.ipaddress = newIpaddress
          }
        })
      } else {
        failure(node, null, new Error(`${NRCSP_ERRORPREFIX} both ipaddress and serial number are invalid/missing`), nrcspFunction)
        return
      }
    }

    // clear node status
    node.status({})

    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received')
      processInputMsg(node, config, msg, configNode.ipaddress)
        .then((msgUpdate) => {
          Object.assign(msg, msgUpdate) // defines the output message
          success(node, msg, msg.nrcspCmd)
        })
        .catch((error) => {
          let functionName = 'processing input msg'
          if (msg.nrcspCmd && typeof msg.nrcspCmd === 'string') {
            functionName = msg.nrcspCmd
          }
          failure(node, msg, error, functionName)
        })
    })
  }

  // ------------------------------------------------------------------------------------

  /** Validate sonos player object, command and dispatch further.
   * @param  {object}  node current node for debug, warning, ...
   * @param  {object}  config current node configuration
   * @param  {string}  config.command the command from node dialog
   * @param  {string}  config.state the state from node dialog
   * @param  {boolean} config.compatibilityMode tic from node dialog
   * @param  {object}  msg incoming message
   * @param  {string}  ipaddress IP address of sonos player
   *
   * Creates also msg.nrcspCmd because in compatibility mode all get commands overwrite msg.payload (the command)
   *
   * @return {promise} All commands have to return a promise - object
   * example: returning {} means message is not modified
   * example: returning { payload: true} means the original msg.payload will be modified and set to true
   */
  async function processInputMsg (node, config, msg, ipaddress) {
    const sonosPlayer = new Sonos(ipaddress)
    // set baseUrl
    if (!isTruthyAndNotEmptyString(sonosPlayer)) {
      throw new Error(`${NRCSP_ERRORPREFIX} sonos player is undefined`)
    }
    if (!(isValidPropertyNotEmptyString(sonosPlayer, ['host']) &&
      isValidPropertyNotEmptyString(sonosPlayer, ['port']))) {
      throw new Error(`${NRCSP_ERRORPREFIX} ip address or port is missing`)
    }
    sonosPlayer.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}` // useful for my extensions

    // handle compatibility to older nrcsp version - depreciated 2020-05-25
    let cmdName = 'topic'
    let stateName = 'payload'
    if (config.compatibilityMode) {
      cmdName = 'payload'
      stateName = 'topic'
    }

    // command, required: node dialog overrules msg, store lowercase version in command
    let command
    if (config.command !== 'message') { // command specified in node dialog
      command = config.command
    } else {
      let cPath = []
      cPath.push(cmdName)
      if (!isValidPropertyNotEmptyString(msg, cPath)) {
        throw new Error(`${NRCSP_ERRORPREFIX} command is undefined/invalid`)
      }
      command = String(msg[cmdName])
      command = command.toLowerCase()

      // you may omit mysonos. prefix - so we add it here
      const REGEX_PREFIX = /^(mysonos|library)/
      if (!REGEX_PREFIX.test(command)) {
        command = `mysonos.${command}`
      }
    }
    msg.nrcspCmd = command // store command as get commands will overrides msg.payload
    msg[cmdName] = command

    // state: node dialog overrules msg.
    let state
    if (config.state) { // payload specified in node dialog
      state = RED.util.evaluateNodeProperty(config.state, config.stateType, node)
      if (typeof state === 'string') {
        if (state !== '') {
          msg[stateName] = state
        }
      } else if (typeof state === 'number') {
        if (state !== '') {
          msg[stateName] = state
        }
      } else if (typeof state === 'boolean') {
        msg[stateName] = state
      }
    }

    if (!Object.prototype.hasOwnProperty.call(COMMAND_TABLE_MYSONOS, command)) {
      throw new Error(`${NRCSP_ERRORPREFIX} command is invalid >>${command} `)
    }
    return COMMAND_TABLE_MYSONOS[command](node, msg, stateName, cmdName, sonosPlayer)
  }

  // ========================================================================
  //
  //             COMMANDS
  //
  // ========================================================================

  /**  Exports first Music Library album matching search string (is encoded)
   * @param  {object} node used for debug message
   * @param  {object} msg incoming message
   * @param  {string} msg[stateName] search string
   * @param  {string} stateName default: payload - in compatibility mode: topic
   * @param  {string} cmdName not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {stateName: uri metadata queue title artist}  CAUTION: stateName!! not payload
   *
   * @throws all functions
   * TODO Notion libraryExportAlbum
   */
  async function libraryExportAlbum (node, msg, stateName, cmdName, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)
    sonosPlayer.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}` // useful for my extensions
    const newArgs = { ObjectID: 'A:ALBUM:' + encodeURIComponent(validatedSearchString) }
    const browseDIDLLite = await executeAction(sonosPlayer.baseUrl, 'Browse', newArgs)
    const albumList = await extractContainers(browseDIDLLite)
    let firstAlbum
    if (albumList.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} Could not find any title matching search string`)
    } else {
      firstAlbum = albumList[0]
    }
    const outputChanged = {}
    outputChanged[stateName] = { uri: firstAlbum.uri, metadata: '', queue: true, artist: firstAlbum.artist, title: firstAlbum.title }
    return outputChanged
  }
  
  /**  Exports first Music Library playlist matching search string.
   * @param  {object} node used for debug message
   * @param  {object} msg incoming message
   * @param  {string} msg[stateName] search string
   * @param  {number} [msg.size = 200] maxim number of playlists to be retrieved
   * @param  {string} stateName default: payload - in compatibility mode: topic
   * @param  {string} cmdName not used but signature libraryGetPlaylist
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {stateName: uri metadata queue}  CAUTION: stateName!! not payload
   *
   * @throws all functions
   * TODO Notion libraryExportAlbum: msg.size is obsolete
   **/ 
  async function libraryExportPlaylist (node, msg, stateName, cmdName, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)
    // msg.size is handled in libraryGetPlaylists 
    const result = await libraryGetPlaylists(node, msg, stateName, cmdName, sonosPlayer)
    const libraryPlaylists = result.payload
    if (libraryPlaylists.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} Could not find any Music library playlist`)
    }
    const found = libraryPlaylists.find(item => (item.title).includes(validatedSearchString))
    if (!found) {
      throw new Error(`${NRCSP_ERRORPREFIX} Could not find any title matching search string`)
    }
    let outputChanged = {}
    outputChanged[stateName] = { uri: found.uri, metadata: '', queue: true }
    return outputChanged
  }

  /**  Get Music Library albums.
   * @param  {object} node used for debug message
   * @param  {object} msg incoming message
   * @param  {string} msg[stateName] search string
   * @param  {string} msg.requestedCount optional, maximum number of found albums, 0...999, default 100
   * @param  {string} msg.searchTitle search string, optional
   * @param  {string} stateName default: payload - in compatibility mode: topic
   * @param  {string} cmdName not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {stateName: array of objects: uri metadata queue title artist}  CAUTION: stateName!! not payload
   *
   * @throws all functions
   * TODO Notion libraryExportAlbum
   */
  async function libraryGetAlbums (node, msg, stateName, cmdName, sonosPlayer) {
    // msg.requestedCount is optional - if missing default is 100
    const requestedCount = string2ValidInteger(msg, 'requestedCount', 1, 999, 'requested count', NRCSP_ERRORPREFIX, 100)

    // msg albumName search string is optional - default is empty string
    let validatedSearchString = stringValidRegex(msg, 'searchTitle', REGEX_ANYCHAR, 'search title', NRCSP_ERRORPREFIX, '')
    if (validatedSearchString !== '') {
      validatedSearchString = ':' + encodeURIComponent(validatedSearchString)
    }
    sonosPlayer.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}` // useful for my extensions
    const newArgs = { ObjectID: 'A:ALBUM' + validatedSearchString, 'RequestedCount': requestedCount }
    const browseDidlLite = await executeAction(sonosPlayer.baseUrl, 'Browse', newArgs)
    const albumList = await extractContainers(browseDidlLite)
    let outputArray = []
    if (albumList.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} Could not find any album`)
    } else {
      outputArray = albumList.map(item => {
        return { uri: item.uri, metadata: '', queue: true, artist: item.artist, title: item.title }
      })
    }
    const outputChanged = {}
    outputChanged[stateName] = outputArray.slice()  // copy array and assign to payload
    return outputChanged
  }

  /**  Outputs array of Music library playlists as object.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {number} [msg.size = 200] maximum number of playlists to be retrieved, integer 1 .. 1000
   * @param  {string} stateName not used
   * @param  {string} cmdName not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @output {array} payload is array of playlist objects. Empty array allowed.
   * Object: id, title, uri, ...
   *
   * @throws all functions. if total is missing or total is !== 0 and items are missing
   */
  async function libraryGetPlaylists (node, msg, stateName, cmdName, sonosPlayer) {
    // msg.size is optional - if missing default is 200
    const listDimension = string2ValidInteger(msg, 'size', 1, 1000, 'size', NRCSP_ERRORPREFIX, 200)
    const libraryPlaylists = await sonosPlayer.getMusicLibrary('playlists', { start: 0, total: listDimension })
    if (!isValidPropertyNotEmptyString(libraryPlaylists, ['total'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} response from sonos does not provide >total`)
    }
    if (libraryPlaylists.total === '0') {
      return { payload: [] }
    }

    if (!isValidPropertyNotEmptyString(libraryPlaylists, ['items'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} list of playlist does not provide >items)`)
    }
    if (!Array.isArray(libraryPlaylists.items)) {
      throw new Error(`${NRCSP_ERRORPREFIX} response list of playlists is not an array`)
    }

    return { payload: libraryPlaylists.items }
  }

  /**  Queues (aka add) first Music Library playlist matching search string.
   * @param  {object} node used for debug message
   * @param  {object} msg incoming message
   * @param  {string} msg[stateName] search string
   * @param  {number} [msg.size = 200] maxim number of playlists to be retrieved
   * @param  {string} stateName default: payload - in compatibility mode: topic
   * @param  {string} cmdName not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {}
   * 
   * TODO Notion libraryExportAlbum: msg.size
   *
   * @throws all functions
   */
  async function libraryQueuePlaylist (node, msg, stateName, cmdName, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)
    const result = await libraryGetPlaylists(node, msg, stateName, cmdName, sonosPlayer)
    const libraryPlaylists = result.payload
    if (libraryPlaylists.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} Could not find any Music library playlist`)
    }
    const found = libraryPlaylists.find(item => (item.title).includes(validatedSearchString))
    if (!found) {
      throw new Error(`${NRCSP_ERRORPREFIX} Could not find any title matching search string`)
    }
    await sonosPlayer.queue(found.uri)
    return {}
  }

  /**  Export first My Sonos item matching search string.
   * @param  {object} node not used
   * @param  {object} msg incoming message
   * @param  {string} msg[stateName] search string
   * @param  {string} stateName default: payload - in compatibility mode: topic
   * @param  {string} cmdName not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} see return   CAUTION: stateName!! not payload
   *
   * @throws all functions
   *        if getAllMySonosItemsV2 does not provide values
   *
   * Info:  content validation of mediaType, serviceName in findStringInMySonosTitleV1
   */
  async function mysonosExportItem (node, msg, stateName, cmdName, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)

    const mySonosItems = await getAllMySonosItemsV2(sonosPlayer.baseUrl)
    if (!isTruthyAndNotEmptyString(mySonosItems)) {
      throw new Error(`${NRCSP_ERRORPREFIX} could not find any My Sonos items`)
    }
    const foundItem = await findStringInMySonosTitleV1(mySonosItems, validatedSearchString)
    const outputChanged = {}
    outputChanged[stateName] = { uri: foundItem.uri, metadata: foundItem.metadata, queue: foundItem.queue }
    return outputChanged
  }

  /**  Outputs array of My Sonos items as object.
   * @param  {object} node not used
   * @param  {object} msg incoming message
   * @param  {string} stateName not used
   * @param  {string} cmdName not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @output {object} payload  = array of my Sonos items {title, albumArt, uri, metadata, sid, upnpClass, processingType}
   * uri, metadata, sid, upnpclass: empty string are allowed
   *
   * @throws all functions
   */
  async function mysonosGetItems (node, msg, stateName, cmdName, sonosPlayer) {
    const mySonosItems = await getAllMySonosItemsV2(sonosPlayer.baseUrl)
    if (!isTruthyAndNotEmptyString(mySonosItems)) {
      throw new Error(`${NRCSP_ERRORPREFIX} could not find any My Sonos items`)
    }
    return { payload: mySonosItems }
  }

  /**  Queues (aka add) first My Sonos item matching search string.
   * @param  {object} node not used
   * @param  {object} msg incoming message
   * @param  {string} msg[stateName] search string
   * @param  {string} stateName default: payload - in compatibility mode: topic
   * @param  {string} cmdName not
   * @param  {object} msg.filter optional, example: { processingType: "queue", mediaType: "playlist", serviceName: "all" }
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {}
   *
   * @throws all functions
   *
   * Info:  msg.filter currently undocumented feature.
   */
  // TODO Notion implement filter
  // TODO Notion clearQueue as parameter
  async function mysonosQueueItem (node, msg, stateName, cmdName, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)

    // create filter object with processingType queue
    const filter = { processingType: 'queue' } // no streams!
    // check existence and value of media type/serviceName
    if (isValidPropertyNotEmptyString(msg, ['filter'])) {
      if (isValidPropertyNotEmptyString(msg, ['filter', 'mediaType'])) {
        filter.mediaType = msg.filter.mediaType
      } else {
        throw new Error(`${NRCSP_ERRORPREFIX} missing media type or empty string` + JSON.stringify(msg.filter))
      }
      // check existence of service name
      if (isValidPropertyNotEmptyString(msg, ['filter', 'serviceName'])) {
        filter.serviceName = msg.filter.serviceName
      } else {
        throw new Error(`${NRCSP_ERRORPREFIX} missing service name or empty string. result msg.filter>>` + JSON.stringify(msg.filter))
      }
    } else {
      // default - no filter
      filter.serviceName = 'all'
      filter.mediaType = 'all'
    }

    const mySonosItems = await getAllMySonosItemsV2(sonosPlayer.baseUrl)
    if (!isTruthyAndNotEmptyString(mySonosItems)) {
      throw new Error(`${NRCSP_ERRORPREFIX} could not find any My Sonos items`)
    }
    const foundItem = await findStringInMySonosTitleV1(mySonosItems, validatedSearchString, filter)
    await sonosPlayer.queue({ uri: foundItem.uri, metadata: foundItem.metadata })
    return {}
  }

  /** Stream (aka play) first My Sonos item matching search string.
   * @param  {object} node not used
   * @param  {object} msg incoming message
   * @param  {string} msg[stateName] search string
   * @param  {string} stateName default: payload - in compatibility mode: topic
   * @param  {string} cmdName not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {}
   *
   * @throws all functions
   *
   */
  
  async function mysonosStreamItem (node, msg, stateName, cmdName, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)
    // TODO Notion implement filter
    const filter = {
      processingType: 'stream',
      mediaType: 'all',
      serviceName: 'all'
    } // only streams

    const mySonosItems = await getAllMySonosItemsV2(sonosPlayer.baseUrl)
    if (!isTruthyAndNotEmptyString(mySonosItems)) {
      throw new Error(`${NRCSP_ERRORPREFIX} could not find any My Sonos items`)
    }
    const foundItem = await findStringInMySonosTitleV1(mySonosItems, validatedSearchString, filter)
    // TODO Notion replace node-sonos
    // this does setting the uri AND plays it!
    await sonosPlayer.setAVTransportURI(foundItem.uri)

    // change volume if is provided
    const newVolume = string2ValidInteger(msg, 'volume', 0, 100, 'volume', NRCSP_ERRORPREFIX, -1)
    if (newVolume !== -1) {
      await sonosPlayer.setVolume(msg.volume)
    }
    return {} // don't touch volume
  }

  RED.nodes.registerType('sonos-manage-mysonos', SonosManageMySonosNode)
}
