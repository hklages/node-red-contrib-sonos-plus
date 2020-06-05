const {
  REGEX_SERIAL, REGEX_IP, REGEX_ANYCHAR,
  NRCSP_ERRORPREFIX,
  discoverSonosPlayerBySerial,
  isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString,
  stringValidRegex, string2ValidInteger,
  failure, success
} = require('./Helper.js')

const { getAllMySonosItemsV2, findStringInMySonosTitleV1 } = require('./Sonos-Commands.js')

const { Sonos } = require('sonos')

module.exports = function (RED) {
  'use strict'

  const COMMAND_TABLE_MYSONOS = {
    'mysonos.export.item': exportItem,
    'mysonos.queue.item': queueItem,
    'mysonos.stream.item': streamItem,
    'mysonos.get.items': getMySonosItems,
    'library.export.playlist': exportLibraryPlaylist,
    'library.queue.playlist': queueLibraryPlaylist,
    'library.get.playlists': getLibraryPlaylists
  }

  /**  Create My Sonos node, get valid ipaddress, store nodeDialog and subscribe to messages.
   * @param  {object} config current node configuration data
   */
  function SonosManageMySonosNode (config) {
    RED.nodes.createNode(this, config)
    const nrcspFunction = 'create and subscribe'
    const node = this

    // ipaddress overriding serialnum - at least one must be valid
    const configNode = RED.nodes.getNode(config.confignode)
    if (isValidProperty(configNode, ['ipaddress']) && typeof configNode.ipaddress === 'string' && REGEX_IP.test(configNode.ipaddress)) {
      node.debug(`OK config node IP address ${configNode.ipaddres} is being used`)
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
            // setting of nodestatus is done in following call handelIpuntMessage
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
          Object.assign(msg, msgUpdate) // defines the ouput message
          success(node, msg, msg[config.compatibilty ? 'payload' : 'topic'])
        })
        .catch((error) => failure(node, msg, error, 'processing input msg'))
    })
  }

  // ------------------------------------------------------------------------------------

  /** Validate sonos player object, command and dispatch further.
   * @param  {object}  node current node for debug, warning, ...
   * @param  {object}  config current node configuration
   * @param  {string}  config.command the command from node dialog
   * @param  {string}  config.state the state from node dialog
   * @param  {boolean} config.compatibilty tic from node dialog
   * @param  {object}  msg incoming message
   * @param  {string}  ipaddress IP address of sonos player
   *
   * @return {promise} All commands have to return a promise - object
   * example: returning {} means message is not modified
   * example: returning { payload: true} means the orignal msg.payload will be modified and set to true
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
    sonosPlayer.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}` // usefull for my extensions

    // handle compatibility to older nrcsp version - depreciated 2020-05-25
    let cmdPath = ['topic']
    let payloadPath = ['payload']
    if (config.compatibilityMode) {
      cmdPath = ['payload']
      payloadPath = ['topic']
    }

    // command, required: node dialog overrides msg, store lowercase version in command
    let command
    if (config.command !== 'message') { // command specified in node dialog
      command = config.command
    } else {
      if (!isValidPropertyNotEmptyString(msg, cmdPath)) {
        throw new Error(`${NRCSP_ERRORPREFIX} command is undefined/invalid`)
      }
      command = String(msg[cmdPath[0]])
      command = command.toLowerCase()

      // you may omitt mysonos. prefix - so we add it here
      const REGEX_PREFIX = /^(mysonos|library)/
      if (!REGEX_PREFIX.test(command)) {
        command = `mysonos.${command}`
      }
    }
    msg[cmdPath[0]] = command

    // state: node dialog overrides msg.
    if (config.state !== '') { // payload specified in node dialog
      const dialogState = RED.util.evaluateNodeProperty(config.state, config.stateType, node)
      msg[payloadPath[0]] = dialogState
    }

    if (!Object.prototype.hasOwnProperty.call(COMMAND_TABLE_MYSONOS, command)) {
      throw new Error(`${NRCSP_ERRORPREFIX} command is invalid >>${command} `)
    }
    return COMMAND_TABLE_MYSONOS[command](node, msg, payloadPath, cmdPath, sonosPlayer)
  }

  // ========================================================================
  //
  //             COMMANDS
  //
  // ========================================================================

  /**  Export first My Sonos item matching search string.
   * @param  {object} node not used
   * @param  {object} msg incoming message
   * @param  {string} msg[payloadPath[0]] search string
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {array}  cmdPath not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} see return
   *
   * @throws all functions
   *        if getAllMySonosItemsV2 does not provide values
   *
   * Info:  content valdidation of mediaType, serviceName in findStringInMySonosTitleV1
   */
  async function exportItem (node, msg, payloadPath, cmdPath, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)

    const mySonosItems = await getAllMySonosItemsV2(sonosPlayer.baseUrl)
    if (!isTruthyAndNotEmptyString(mySonosItems)) {
      throw new Error(`${NRCSP_ERRORPREFIX} could not find any My Sonos items`)
    }
    const foundItem = await findStringInMySonosTitleV1(mySonosItems, validatedSearchString)
    const args = {}
    args[payloadPath[0]] = { uri: foundItem.uri, metadata: foundItem.metadata, queue: foundItem.queue }
    return args
  }

  /**  Queues (aka add) first My Sonos item matching search string.
   * @param  {object} node not used
   * @param  {object} msg incoming message
   * @param  {string} msg[payloadPath[0]] search string
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {array}  cmdPath default: cmd - in compatibility mode: payload
   * @param  {object} msg.filter optional, example: { processingType: "queue", mediaType: "playlist", serviceName: "all" }
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {}
   *
   * @throws all functions
   *
   * Info:  msg.filter currently undocumented feature.
   */
  // TODO: filter not enabled
  // TODO: clearQueue as parameter?
  async function queueItem (node, msg, payloadPath, cmdPath, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)

    // create filter object with processingType queue
    const filter = { processingType: 'queue' } // no streams!
    // check existens and value of media typye/serviceName
    if (isValidPropertyNotEmptyString(msg, ['filter'])) {
      if (isValidPropertyNotEmptyString(msg, ['filter', 'mediaType'])) {
        filter.mediaType = msg.filter.mediaType
      } else {
        throw new Error(`${NRCSP_ERRORPREFIX} missing media type or empty string` + JSON.stringify(msg.filter))
      }
      // check existens of service name
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
   * @param  {string} msg[payloadPath[0]] search string
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {array}  cmdPath not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {}
   *
   * @throws all functions
   *
   */
  // TODO filter still not defined
  async function streamItem (node, msg, payloadPath, cmdPath, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)
    // TODO similiar to addURI, get service provider!
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
    // TODO switch to set...  current Metadata not used!
    // this does setting the uri AND plays it!
    await sonosPlayer.setAVTransportURI(foundItem.uri)

    // change volume if is provided
    const newVolume = string2ValidInteger(msg, 'volume', 1, 99, 'volume', NRCSP_ERRORPREFIX, -1)
    if (newVolume !== -1) {
      await sonosPlayer.setVolume(msg.volume)
    }
    return {} // dont touch volume
  }

  /**  Outputs array of My Sonos items as object.
   * @param  {object} node not used
   * @param  {object} msg incoming message
   * @param  {array}  payloadPath not used
   * @param  {array}  cmdPath not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @output {object} payload  = array of my Sonos items {title, albumArt, uri, metadata, sid, upnpClass, processingType}
   * uri, metadata, sid, upnpclass: empty string are allowed
   *
   * @throws all functions
   */
  async function getMySonosItems (node, msg, payloadPath, cmdPath, sonosPlayer) {
    const mySonosItems = await getAllMySonosItemsV2(sonosPlayer.baseUrl)
    if (!isTruthyAndNotEmptyString(mySonosItems)) {
      throw new Error(`${NRCSP_ERRORPREFIX} could not find any My Sonos items`)
    }
    return { payload: mySonosItems }
  }

  /**  Outputs array of Music library items as object.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {number} [msg.size = 200] maximum number of playlists to be retrieved, integer 1 .. 1000
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {array}  cmdPath not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @output {array} payload is array of playlist objects. Empty array allowed.
   * Object: id, title, uri, ...
   *
   * @throws all functions. if total is missing or total is !== 0 and items are missing
   */
  async function getLibraryPlaylists (node, msg, payloadPath, cmdPath, sonosPlayer) {
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

  /**  Queues (aka add) first Music Libary playlist matching search string.
   * @param  {object} node used for debug message
   * @param  {object} msg incoming message
   * @param  {string} msg[payloadPath[0]] search string
   * @param  {number} [msg.size = 200] maxim number of playlists to be retrieved
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {array}  cmdPath not used
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {}
   *
   * @throws all functions
   */
  async function queueLibraryPlaylist (node, msg, payloadPath, cmdPath, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)
    const result = await getLibraryPlaylists(node, msg, payloadPath, cmdPath, sonosPlayer)
    const libraryPlaylists = result.payload
    if (libraryPlaylists.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} Cound not find any Music library playlist`)
    }
    const found = libraryPlaylists.find(item => (item.title).includes(validatedSearchString))
    if (!found) {
      throw new Error(`${NRCSP_ERRORPREFIX} Cound not find any title matching search string`)
    }
    await sonosPlayer.queue(found.uri)
    return {}
  }

  /**  Exports first Music Libary playlist matching search string.
   * @param  {object} node used for debug message
   * @param  {object} msg incoming message
   * @param  {string} msg[payloadPath[0]] search string
   * @param  {number} [msg.size = 200] maxim number of playlists to be retrieved
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {array}  cmdPath default: msg.cmd - in compatibility mode: payload
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {payload: uri metadata queue}
   *
   * @throws all functions
   */
  async function exportLibraryPlaylist (node, msg, payloadPath, cmdPath, sonosPlayer) {
    // payload title search string is required.
    const validatedSearchString = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'search string', NRCSP_ERRORPREFIX)
    const result = await getLibraryPlaylists(node, msg, payloadPath, cmdPath, sonosPlayer)
    const libraryPlaylists = result.payload
    if (libraryPlaylists.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} Cound not find any Music library playlist`)
    }
    const found = libraryPlaylists.find(item => (item.title).includes(validatedSearchString))
    if (!found) {
      throw new Error(`${NRCSP_ERRORPREFIX} Cound not find any title matching search string`)
    }
    const args = {}
    args[payloadPath[0]] = { uri: found.uri, metadata: '', queue: true }
    return args
  }

  RED.nodes.registerType('sonos-manage-mysonos', SonosManageMySonosNode)
}
