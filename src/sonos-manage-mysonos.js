const {
  REGEX_SERIAL, REGEX_IP, REGEX_ANYCHAR,
  NRCSP_PREFIX,
  discoverSonosPlayerBySerial,
  isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString,
  validRegex, validToInteger,
  failure, success
} = require('./Helper.js')

const { getMySonosV3, executeActionV6, didlXmlToArray, setPlayerVolume
} = require('./Sonos-Commands.js')

const { Sonos } = require('sonos')

/**
 * All functions provided by My Sonos node. My Sonos node handles Music-Library and My-Sonos.
 *
 * @module MySonos
 * 
 * @author Henning Klages
 * 
 * @since 2020-11-27
*/

module.exports = function (RED) {
  'use strict'

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
    const nrcspFunction = 'create and subscribe'
    const node = this

    // ip address overruling serial number - at least one must be valid
    const configNode = RED.nodes.getNode(config.confignode)
    if (isValidProperty(configNode, ['ipaddress'])
      && typeof configNode.ipaddress === 'string'
      && REGEX_IP.test(configNode.ipaddress)) {
      // ip address is being used - default case
    } else if (isValidProperty(configNode, ['serialnum'])
      && typeof configNode.serialnum === 'string'
      && REGEX_SERIAL.test(configNode.serialnum)) {
      discoverSonosPlayerBySerial(node, configNode.serialnum, (err, newIpaddress) => {
        if (err) {
          failure(
            node, null, new Error(`${NRCSP_PREFIX} couldn't discover ip address`), nrcspFunction)
          return
        }
        if (newIpaddress === null) {
          failure(node, null,
            new Error(`${NRCSP_PREFIX} couldn't find any player by serial`), nrcspFunction)
        } else {
          // setting of node status is done in following call handleInputMessage
          node.debug(`OK sonos player ${newIpaddress} was found`)
          configNode.ipaddress = newIpaddress
        }
      })
    } else {
      failure(node, null, 
        new Error(`${NRCSP_PREFIX} both ipaddress and serial number are invalid/missing`),
        nrcspFunction)
      return
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

  /** Validate sonos player object, command and dispatch further.
   * @param  {object}  node current node for debug, warning, ...
   * @param  {object}  config current node configuration
   * @param  {string}  config.command the command from node dialog
   * @param  {string}  config.state the state from node dialog
   * @param  {boolean} config.compatibilityMode tic from node dialog
   * @param  {object}  msg incoming message
   * @param  {string}  ipaddress IP address of sonos player
   *
   * Creates also msg.nrcspCmd because in compatibility mode all get commands 
   * overwrite msg.payload (the command).
   *
   * @returns {promise} All commands have to return a promise - object
   * example: returning {} means message is not modified
   * example: returning { msg[stateName]: true} means 
   * the original msg.payload will be modified and set to true.
   */
  async function processInputMsg (node, config, msg, ipaddress) {
    const nodesonosPlayer = new Sonos(ipaddress)
    if (!isTruthyAndNotEmptyString(nodesonosPlayer)) {
      throw new Error(`${NRCSP_PREFIX} sonos player is undefined`)
    }
    if (!(isValidPropertyNotEmptyString(nodesonosPlayer, ['host'])
      && isValidPropertyNotEmptyString(nodesonosPlayer, ['port']))) {
      throw new Error(`${NRCSP_PREFIX} ip address or port is missing`)
    }
    nodesonosPlayer.url = new URL(`http://${nodesonosPlayer.host}:${nodesonosPlayer.port}`)

    // handle compatibility to older nrcsp version - depreciated 2020-05-25
    // Path have to be arrays showing the path to property.
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
      if (!isValidPropertyNotEmptyString(msg, [cmdName])) {
        throw new Error(`${NRCSP_PREFIX} command is undefined/invalid`)
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
    msg[cmdName] = command // Sets topic 

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
      throw new Error(`${NRCSP_PREFIX} command is invalid >>${command} `)
    }
    return COMMAND_TABLE_MYSONOS[command](node, msg, stateName, cmdName, nodesonosPlayer)
  }

  //
  //                                          COMMANDS
  //...............................................................................................

  /**  Exports first Music-Library album matching search string (is encoded) - maximum 100
   * @param {object} node used for debug message
   * @param {object} msg incoming message
   * @param {string} msg.stateName search string
   * @param {string} stateName=payload in compatibility mode: topic
   * @param {string} cmdName=topic in compatibility mode: payload
   * @param {object} nodesonosPlayer player with url - as default
   *
   * @returns {promise} {stateName: uri metadata queue title artist}  
   * CAUTION: stateName!! not payload
   *
   * @throws {error} all functions
   */
  async function libraryExportAlbum (node, msg, stateName, cmdName, nodesonosPlayer) {
    // payload title search string is required.
    const validatedSearch = validRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_PREFIX)
    
    const browseMlAlbum = await executeActionV6(nodesonosPlayer.url,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'A:ALBUM:' + encodeURIComponent(validatedSearch),
        BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0,
        RequestedCount: 100, SortCriteria: ''
      })
    if (!isValidPropertyNotEmptyString(browseMlAlbum, ['NumberReturned'])) {
      throw new Error(`${NRCSP_PREFIX} invalid response Browse Album, missing NumberReturned`)
    }
    if (browseMlAlbum.NumberReturned === '0') {
      throw new Error(`${NRCSP_PREFIX} Could not find any title matching search string`)
    }

    const listAlbum = await didlXmlToArray(browseMlAlbum.Result, 'container')
    if (!isTruthyAndNotEmptyString(listAlbum)) {
      throw new Error(`${NRCSP_PREFIX} response form parsing Browse Album is invalid.`)
    }

    return { [stateName]: { uri: listAlbum[0].uri, metadata: listAlbum[0].metadata, queue: true } }

  }

  /**  Exports first Music-Library playlist matching search string (is encoded) - maximum 100
   * @param {object} node used for debug message
   * @param {object} msg incoming message
   * @param {string} msg.stateName search string
   * @param {string} stateName=payload in compatibility mode: topic
   * @param {string} cmdName=topic in compatibility mode: payload
   * @param {object} nodesonosPlayer player with url - as default
   *
   * @returns {promise} {stateName: uri metadata queue title artist}  
   * CAUTION: stateName!! not payload
   *
   * @throws {error} all functions
   */
  async function libraryExportPlaylistV2 (node, msg, stateName, cmdName, nodesonosPlayer) {
    // payload title search string is required.
    const validatedSearchString
      = validRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_PREFIX)
    
    const browseMlPlaylists = await executeActionV6(nodesonosPlayer.url,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'A:PLAYLISTS:' + encodeURIComponent(validatedSearchString),
        BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0,
        RequestedCount: 100, SortCriteria: ''
      })
    if (!isValidPropertyNotEmptyString(browseMlPlaylists, ['NumberReturned'])) {
      throw new Error(`${NRCSP_PREFIX} invalid response Browse playlists, missing NumberReturned`)
    }
    if (browseMlPlaylists.NumberReturned === '0') {
      throw new Error(`${NRCSP_PREFIX} Could not find any title matching search string`)
    }

    const listPls = await didlXmlToArray(browseMlPlaylists.Result, 'container')
    if (!isTruthyAndNotEmptyString(listPls)) {
      throw new Error(`${NRCSP_PREFIX} response form parsing Browse playlists is invalid.`)
    }
    
    return { [stateName]: { uri: listPls[0].uri, metadata: listPls[0].metadata, queue: true } }
  }

  /**  Outputs array Music-Library albums - search string is optional
   * @param {object} node used for debug message
   * @param {object} msg incoming message
   * @param {string} msg.stateName search string
   * @param {string} msg.requestedCount optional, maximum number of found albums, 
   *                  0...999, default 100
   * @param {string} msg.searchTitle search string, optional
   * @param {string} stateName=payload in compatibility mode: topic
   * @param {string} cmdName=topic in compatibility mode: payload
   * @param {object} nodesonosPlayer player with url - as default
   *
   * @returns {promise} {stateName: array of objects: uri metadata queue title artist} 
   * array may be empty  
   * CAUTION: stateName!! not payload
   *
   * @throws all functions
   * TODO Notion libraryExportAlbum
   */
  async function libraryGetAlbums (node, msg, stateName, cmdName, nodesonosPlayer) {
    // msg.requestedCount is optional - if missing default is 100
    const requestedCount = validToInteger(
      msg, 'requestedCount', 1, 999, 'requested count', NRCSP_PREFIX, 100)

    // msg albumName search string is optional - default is empty string
    let validatedSearchString
      = validRegex(msg, 'searchTitle', REGEX_ANYCHAR, 'search title', NRCSP_PREFIX, '')
    if (validatedSearchString !== '') {
      validatedSearchString = ':' + encodeURIComponent(validatedSearchString)
    }

    const browseAlbum = await executeActionV6(nodesonosPlayer.url,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'A:ALBUM' + validatedSearchString, BrowseFlag: 'BrowseDirectChildren',
        Filter: '*', StartingIndex: 0, RequestedCount: requestedCount, SortCriteria: ''
      })
    
    if (!isValidPropertyNotEmptyString(browseAlbum, ['NumberReturned'])) {
      throw new Error(`${NRCSP_PREFIX} invalid response Browse Album - missing NumberReturned`)
    }

    let albumList = []
    if (browseAlbum.NumberReturned !== '0') {
      const listAlbum = await didlXmlToArray(browseAlbum.Result, 'container')
      if (!isTruthyAndNotEmptyString(listAlbum)) {
        throw new Error(`${NRCSP_PREFIX} response form parsing Browse Album is invalid.`)
      }

      // add ip address to albumUri
      albumList = listAlbum.map(element => {
        if (typeof element.artUri === 'string' && element.artUri.startsWith('/getaa')) {
          element.artUri = nodesonosPlayer.url.origin + element.artUri
        }  
        element.processingType = 'queue'
        return element
      })
    }

    return { [stateName]: albumList.slice() }
  }

  /**  Outputs array Music-Library playlists - search string is optional
   * @param {object} node used for debug message
   * @param {object} msg incoming message
   * @param {string} msg.stateName search string
   * @param {string} msg.requestedCount optional, maximum number of found albums, 
   *                 0...999, default 100
   * @param {string} msg.searchTitle search string, optional
   * @param {string} stateName=payload in compatibility mode: topic
   * @param {string} cmdName=topic in compatibility mode: payload
   * @param {object} nodesonosPlayer player with url - as default
   *
   * @returns {promise} {stateName: array of objects: uri metadata queue title artist} 
   * array may be empty  
   * CAUTION: stateName!! not payload
   *
   * @throws all functions
   */
  async function libraryGetPlaylistsV2 (node, msg, stateName, cmdName, nodesonosPlayer) {
    // msg.requestedCount is optional - if missing default is 100
    const requestedCount = validToInteger(
      msg, 'requestedCount', 1, 999, 'requested count', NRCSP_PREFIX, 100)

    // msg search string is optional - default is empty string
    let validatedSearchString
      = validRegex(msg, 'searchTitle', REGEX_ANYCHAR, 'search title', NRCSP_PREFIX, '')
    if (validatedSearchString !== '') {
      validatedSearchString = ':' + encodeURIComponent(validatedSearchString)
    }

    const browsePlaylists = await executeActionV6(nodesonosPlayer.url,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'A:PLAYLISTS' + validatedSearchString, BrowseFlag: 'BrowseDirectChildren',
        Filter: '*', StartingIndex: 0, RequestedCount: requestedCount, SortCriteria: ''
      })
    
    if (!isValidPropertyNotEmptyString(browsePlaylists, ['NumberReturned'])) {
      throw new Error(`${NRCSP_PREFIX} invalid response Browse Playlists - missing NumberReturned`)
    }

    let playlistList = []
    if (browsePlaylists.NumberReturned !== '0') {
      const listPlaylist = await didlXmlToArray(browsePlaylists.Result, 'container')
      if (!isTruthyAndNotEmptyString(listPlaylist)) {
        throw new Error(`${NRCSP_PREFIX} response form parsing Browse Playlists is invalid.`)
      }

      // add ip address to albumUri
      playlistList = listPlaylist.map(element => {
        if (typeof element.artUri === 'string' && element.artUri.startsWith('/getaa')) {
          element.artUri = nodesonosPlayer.url.origin + element.artUri
        }  
        element.processingType = 'queue'
        return element
      })
    }

    return { [stateName]: playlistList.slice() }
  }

  /**  Queue first Music-Library playlist matching search string (is encoded) - maximum 100
   * @param {object} node used for debug message
   * @param {object} msg incoming message
   * @param {string} msg.stateName search string
   * @param {string} stateName=payload in compatibility mode: topic
   * @param {string} cmdName=topic in compatibility mode: payload
   * @param {object} nodesonosPlayer player with url - as default
   *
   * @returns {promise} {stateName: uri metadata queue title artist}  
   * CAUTION: stateName!! not payload
   *
   * @throws {error} all functions
   */
  async function libraryQueuePlaylistV2 (node, msg, stateName, cmdName, nodesonosPlayer) {
    // payload title search string is required.
    const validatedSearchString
      = validRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_PREFIX)
    
    const browseMlPlaylists = await executeActionV6(nodesonosPlayer.url,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'A:PLAYLISTS:' + encodeURIComponent(validatedSearchString),
        BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0,
        RequestedCount: 100, SortCriteria: ''
      })
    if (!isValidPropertyNotEmptyString(browseMlPlaylists, ['NumberReturned'])) {
      throw new Error(`${NRCSP_PREFIX} invalid response Browse playlists, missing NumberReturned`)
    }
    if (browseMlPlaylists.NumberReturned === '0') {
      throw new Error(`${NRCSP_PREFIX} Could not find any title matching search string`)
    }

    const listPls = await didlXmlToArray(browseMlPlaylists.Result, 'container')
    if (!isTruthyAndNotEmptyString(listPls)) {
      throw new Error(`${NRCSP_PREFIX} response form parsing Browse playlists is invalid.`)
    }
    await nodesonosPlayer.queue(listPls[0].uri,)
    
    return {}
  }

  /**  Export first My-Sonos item matching search string.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.stateName search string
   * @param {string} stateName=payload in compatibility mode: topic
   * @param {string} cmdName=topic in compatibility mode: payload
   * @param {object} nodesonosPlayer player with url - as default
   *
   * @returns {promise} see return   CAUTION: stateName!! not payload
   *
   * @throws all functions
   *        if getMySonosV3 does not provide values
   *
   * Info:  content validation of mediaType, serviceName
   */
  async function mysonosExportItem (node, msg, stateName, cmdName, nodesonosPlayer) {
    // payload title search string is required.
    const validatedSearchString
      = validRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_PREFIX)

    const mySonosItems = await getMySonosV3(nodesonosPlayer.url)
    if (!isTruthyAndNotEmptyString(mySonosItems)) {
      throw new Error(`${NRCSP_PREFIX} could not find any My Sonos items`)
    }
    
    // find in string
    let foundIndex = -1
    foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validatedSearchString))
    })
    if (foundIndex < 0) {
      throw new Error(`${NRCSP_PREFIX} No title matching search string >>${validatedSearchString}`)
    }

    return { [stateName]: {
      uri: mySonosItems[foundIndex].uri,
      metadata: mySonosItems[foundIndex].metadata,
      queue: (mySonosItems[foundIndex].processingType === 'queue')
    } }

  }

  /**  Outputs array of My-Sonos items as object.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} stateName=payload in compatibility mode: topic
   * @param {string} cmdName=topic in compatibility mode: payload
   * @param {object} nodesonosPlayer player with url - as default
   *
   * @returns {promise<mySonosItem[]>} payload  = array of my Sonos items 
   * {title, albumArt, uri, metadata, sid, upnpClass, processingType}
   * uri, metadata, sid, upnpclass: empty string are allowed
   *
   * @throws nrcsp error - all functions
   */
  async function mysonosGetItems (node, msg, stateName, cmdName, nodesonosPlayer) {
    const payload = await getMySonosV3(nodesonosPlayer.url)
    if (!isTruthyAndNotEmptyString(payload)) {
      throw new Error(`${NRCSP_PREFIX} could not find any My Sonos items`)
    }

    return { payload }
  }

  /**  Queues (aka add) first My-Sonos item matching search string.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.stateName search string
   * @param {string} stateName=payload in compatibility mode: topic
   * @param {string} cmdName=topic in compatibility mode: payload
   * @param {object} msg.filter optional, example: 
   * { processingType: "queue", mediaType: "playlist", serviceName: "all" }
      * @param  {object} nodesonosPlayer player with url - as default
   *
   * @returns {promise} {}
   *
   * @throws nrcsp-error all functions
   *
   * Info:  msg.filter currently undocumented feature.
   */
  // TODO Notion implement filter
  // TODO Notion clearQueue as parameter
  async function mysonosQueueItem (node, msg, stateName, cmdName, nodesonosPlayer) {
    // payload title search string is required.
    const validatedSearchString
      = validRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_PREFIX)

    // create filter object with processingType queue
    const filter = { processingType: 'queue' } // no streams!
    // check existence and value of media type/serviceName
    if (isValidPropertyNotEmptyString(msg, ['filter'])) {
      if (isValidPropertyNotEmptyString(msg, ['filter', 'mediaType'])) {
        filter.mediaType = msg.filter.mediaType
      } else {
        throw new Error(`${NRCSP_PREFIX} missing media type or empty string`
          + JSON.stringify(msg.filter))
      }
      // check existence of service name
      if (isValidPropertyNotEmptyString(msg, ['filter', 'serviceName'])) {
        filter.serviceName = msg.filter.serviceName
      } else {
        throw new Error(`${NRCSP_PREFIX} missing service name or empty string. result msg.filter>>`
          + JSON.stringify(msg.filter))
      }
    } else {
      // default - no filter
      filter.serviceName = 'all'
      filter.mediaType = 'all'
    }

    const mySonosItems = await getMySonosV3(nodesonosPlayer.url)
    if (!isTruthyAndNotEmptyString(mySonosItems)) {
      throw new Error(`${NRCSP_PREFIX} could not find any My Sonos items`)
    }
    // find in title
    let foundIndex = -1
    foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validatedSearchString))
    })
    if (foundIndex < 0) {
      throw new Error(`${NRCSP_PREFIX} No title matching search string >>${validatedSearchString}`)
    }
    
    await nodesonosPlayer.queue({
      uri: mySonosItems[foundIndex].uri,
      metadata: mySonosItems[foundIndex].metadata
    })

    return {}
  }

  /** Stream (aka play) first My-Sonos item matching search string.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.stateName search string
   * @param {string} stateName=payload in compatibility mode: topic
   * @param {string} cmdName=topic in compatibility mode: payload
   * @param {object} nodesonosPlayer player with url - as default
   *
   * @returns {promise} {}
   *
   * @throws all functions
   */
  async function mysonosStreamItem (node, msg, stateName, cmdName, nodesonosPlayer) {
    // payload title search string is required.
    const validatedSearchString
      = validRegex(msg, stateName, REGEX_ANYCHAR, 'search string', NRCSP_PREFIX)
    
    const mySonosItems = await getMySonosV3(nodesonosPlayer.url)
    if (!isTruthyAndNotEmptyString(mySonosItems)) {
      throw new Error(`${NRCSP_PREFIX} could not find any My Sonos items`)
    }

    // find in title
    let foundIndex = -1
    foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validatedSearchString))
    })
    if (foundIndex < 0) {
      throw new Error(`${NRCSP_PREFIX} No title matching search string >>${validatedSearchString}`)
    }

    // TODO Notion replace node-sonos
    // this does setting the uri AND plays it!
    await nodesonosPlayer.setAVTransportURI(mySonosItems[foundIndex].uri)

    // change volume if is provided
    const newVolume = validToInteger(msg, 'volume', 0, 100, 'volume', NRCSP_PREFIX, -1)
    if (newVolume !== -1) {
      await setPlayerVolume(nodesonosPlayer, newVolume)
    }

    return {} // don't touch volume
  }

  RED.nodes.registerType('sonos-manage-mysonos', SonosManageMySonosNode)
}
