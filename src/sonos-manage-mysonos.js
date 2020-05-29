const {
  REGEX_SERIAL, REGEX_IP, REGEX_ANYCHAR,
  NRCSP_ERRORPREFIX,
  discoverSonosPlayerBySerial,
  isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString,
  stringValidRegex,
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
    'mysonos.get.items': getMySonosItems
  }

  /**  Create My Sonos node, get valid ipaddress, store nodeDialog and subscribe to messages.
   * @param  {object} config current node configuration data
   */
  function SonosManageMySonosNode (config) {
    RED.nodes.createNode(this, config)
    const nrcspFunction = 'create and subscribe'

    const node = this
    // this is only used in processInputMessage.
    node.nrcspCompatibilty = config.compatibilityMode // defines what propoerty holds command, additional data
    node.nrcspCommand = config.command // holds the dialog command if selected

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
      processInputMsg(node, msg, configNode.ipaddress)
        .then((msgUpdate) => {
          Object.assign(msg, msgUpdate) // defines the ouput message
          success(node, msg, msg.backupCmd)
        })
        .catch((error) => failure(node, msg, error, 'processing input msg'))
    })
  }

  // ------------------------------------------------------------------------------------

  /** Validate sonos player object, command and dispatch further.
   * @param  {object}  node current node
   * @param  {string}  node.nrcspCommand the command from node dialog
   * @param  {boolean} node.nrcspCompatibilty tic from node dialog
   * @param  {object}  msg incoming message
   * @param  {string}  ipaddress IP address of sonos player
   *
   * @return {promise} All commands have to return a promise - object
   * example: returning {} means message is not modified
   * example: returning { payload: true} means the orignal msg.payload will be modified and set to true
   */
  async function processInputMsg (node, msg, ipaddress) {
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
    const cmdPath = []
    cmdPath.push(node.nrcspCompatibilty ? 'payload' : 'cmd')
    const payloadPath = []
    payloadPath.push(node.nrcspCompatibilty ? 'topic' : 'payload')

    // node dialog overrides msg, store lowercase version in command
    let command
    if (node.nrcspCommand !== 'message') { // command specified in node dialog
      command = node.nrcspCommand
    } else {
      if (!isValidPropertyNotEmptyString(msg, cmdPath)) {
        throw new Error(`${NRCSP_ERRORPREFIX} command is undefined/invalid`)
      }
      command = String(msg[cmdPath[0]])
      command = command.toLowerCase()
    }

    // you may omitt mysonos. prefix - so we add it here
    const REGEX_PREFIX = /^(mysonos|musiclibrary)/
    if (!REGEX_PREFIX.test(command)) {
      command = `mysonos.${command}`
    }
    msg.backupCmd = command // sets msg.backupCmd

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
   * @param  {object} node only used for debug and warning
   * @param  {object} msg incoming message
   * @param  {string} msg.[payloadPath[0]] search string
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {array}  cmdPath default: cmd - in compatibility mode: payload
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
    args[cmdPath[0]] = 'play.export'
    args.export = { uri: foundItem.uri, metadata: foundItem.metadata, queue: foundItem.queue }
    return args
  }

  /**  Queues (aka add) first My Sonos item matching search string.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {string} msg.[payloadPath[0]] search string
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {array}  cmdPath default: cmd - in compatibility mode: payload
   * @param  {object} msg.filter optional, example: { processingType: "queue", mediaType: "playlist", serviceName: "all" }
   * @param  {object} sonosPlayer Sonos Player
   *
   * @return {promise} {}
   *
   * @throws all functions
   *
   * Info:  content valdidation of mediaType, serviceName in findStringInMySonosTitleV1
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
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {string} msg.[payloadPath[0]] search string
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {array}  cmdPath default: cmd - in compatibility mode: payload
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

    // TODO use my standard procedure
    // change volume
    if (isValidPropertyNotEmptyString(msg, ['volume'])) {
      const newVolume = parseInt(msg.volume)
      if (Number.isInteger(newVolume)) {
        if (newVolume > 0 && newVolume < 100) {
          // play and change volume
          node.debug('msg.volume is in range 1...99: ' + newVolume)
          return sonosPlayer.setVolume(msg.volume)
        } else {
          node.debug('msg.volume is not in range: ' + newVolume)
          throw new Error(`${NRCSP_ERRORPREFIX} msg.volume is out of range 1...99: ` + newVolume)
        }
      } else {
        node.debug('msg.volume is not number')
        throw new Error(`${NRCSP_ERRORPREFIX} msg.volume is not a number: ` + JSON.stringify(msg.volume))
      }
    }
    return {} // dont touch volume
  }

  /**  Outputs array of My Sonos items as object.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
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

  RED.nodes.registerType('sonos-manage-mysonos', SonosManageMySonosNode)
}
