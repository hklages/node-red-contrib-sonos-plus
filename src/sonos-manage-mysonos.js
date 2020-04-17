const {
  REGEX_IP,
  REGEX_SERIAL,
  failure,
  warning,
  discoverSonosPlayerBySerial,
  isValidProperty,
  isValidPropertyNotEmptyString,
  isTruthyAndNotEmptyString,
  success
} = require('./Helper.js')

const { getAllMySonosItems, findStringInMySonosTitle, findStringInMySonosTitleV1, queue } = require('./Sonos-Commands.js')
const { Sonos } = require('sonos')

module.exports = function (RED) {
  'use strict'

  /**  Create Manage Radio Node and subscribe to messages.
   * @param  {object} config current node configuration data
   */
  function SonosManageMySonosNode (config) {
    RED.nodes.createNode(this, config)
    const sonosFunction = 'setup subscribe'

    const node = this
    const configNode = RED.nodes.getNode(config.confignode)

    // check during creation of node!
    if (!(
      (isValidProperty(configNode, ['ipaddress']) && REGEX_IP.test(configNode.ipaddress)) ||
      (isValidProperty(configNode, ['serialnum']) && REGEX_SERIAL.test(configNode.serialnum)))) {
      failure(node, null, new Error('n-r-c-s-p: invalid config node - missing ip or serial number'), sonosFunction)
      return
    }

    // clear node status
    node.status({})

    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received')

      // if ip address exist use it or get it via discovery based on serialNum
      if (isValidProperty(configNode, ['ipaddress']) && REGEX_IP.test(configNode.ipaddress)) {
        node.debug('using IP address of config node')
        processInputMsg(node, msg, configNode.ipaddress)
      } else {
        // have to get ip address via disovery with serial numbers
        // this part cost time during procession and should be avoided - see warning.
        if (isValidProperty(configNode, ['serialnum']) && REGEX_SERIAL.test(configNode.serialnum)) {
          discoverSonosPlayerBySerial(node, configNode.serialnum, (err, ipAddress) => {
            if (err) {
              failure(node, msg, new Error('n-r-c-s-p: discovery failed'), sonosFunction)
              return
            }
            if (ipAddress === null) {
              failure(node, msg, new Error('n-r-c-s-p: could not find any player by serial'), sonosFunction)
            } else {
              // setting of nodestatus is done in following call handelIpuntMessage
              node.debug('found sonos player')
              processInputMsg(node, msg, ipAddress)
            }
          })
        } else {
          failure(node, msg, new Error('n-r-c-s-p: invalid config node - invalid serial'), sonosFunction)
        }
      }
    })
  }

  // ------------------------------------------------------------------------------------

  /**  Validate sonos player and input message then dispatch further.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {string} ipaddress IP address of sonos player
   */
  function processInputMsg (node, msg, ipaddress) {
    const sonosFunction = 'handle input msg'
    const sonosPlayer = new Sonos(ipaddress)

    // set baseUrl
    if (!isTruthyAndNotEmptyString(sonosPlayer)) {
      failure(node, msg, new Error('n-r-c-s-p: undefined sonos player'), sonosFunction)
      return
    }
    if (!isValidPropertyNotEmptyString(sonosPlayer, ['host']) ||
      !isValidPropertyNotEmptyString(sonosPlayer, ['port'])) {
      failure(node, msg, new Error('n-r-c-s-p: missing ip or port'), sonosFunction)
      return
    }
    sonosPlayer.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`

    // Check msg.payload. Store lowercase version in command
    if (!isValidPropertyNotEmptyString(msg, ['payload'])) {
      failure(node, msg, new Error('n-r-c-s-p: undefined payload', sonosFunction))
      return
    }

    // dispatch (dont add msg.topic because may not exist and is not checked)
    let command = String(msg.payload)
    command = command.toLowerCase()

    // dispatch
    if (command === 'get_items') {
      getMySonos(node, msg, sonosPlayer)
    } else if (command === 'get.items') {
      getMySonos(node, msg, sonosPlayer)
    } else if (command === 'queue') {
      queueItem(node, msg, sonosPlayer)
    } else if (command === 'stream') {
      stream(node, msg, sonosPlayer)
    } else if (command === 'export.item') {
      exportItem(node, msg, sonosPlayer)
    } else {
      warning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(command))
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /**  Outputs array of My Sonos items as object.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer Sonos Player
   *
   * @output {object} msg.payload  = array of my Sonos items with title, albumArt,uri, metaData, sid, upnpClass, processingType
   * uri, metadata, sid, upnpclass: empty string are allowed
   *
   * @throws n-r-c-s-p error in case of empty My Sonos
   */
  function getMySonos (node, msg, sonosPlayer) {
    const sonosFunction = 'get My Sonos items'

    getAllMySonosItems(sonosPlayer.baseUrl)
      .then(items => {
        if (!isTruthyAndNotEmptyString(items)) {
          throw new Error('n-r-c-s-p: could not find any My Sonos items')
        }
        msg.payload = items
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /**  QueueItem (aka add) first My Sonos item - matching search string and filter - to SONOS queue.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {string} msg.topic search string
   * @param  {object} msg.filter optional, example: { processingType: "queue", mediaType: "playlist", serviceName: "all" }
   * @param  {object} sonosPlayer Sonos Player
   *
   * @output {object} msg unmodified / stopped in case of error
   *
   * @throws nothing!
   *
   * Info:  content valdidation of mediaType, serviceName in findStringInMySonosTitle
   */
  function queueItem (node, msg, sonosPlayer) {
    const sonosFunction = 'queue my sonos item'

    // validate msg.topic
    if (!isValidPropertyNotEmptyString(msg, ['topic'])) {
      failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction)
      return
    }

    // create filter object with processingType queue
    const filter = { processingType: 'queue' } // no streams!
    // check existens and value of media typye/serviceName
    if (isValidPropertyNotEmptyString(msg, ['filter'])) {
      if (isValidPropertyNotEmptyString(msg, ['filter', 'mediaType'])) {
        filter.mediaType = msg.filter.mediaType
      } else {
        failure(node, msg, new Error('n-r-c-s-p: missing media type or empty string' + JSON.stringify(msg.filter)), sonosFunction)
        return
      }
      // check existens of service name
      if (isValidPropertyNotEmptyString(msg, ['filter', 'serviceName'])) {
        filter.serviceName = msg.filter.serviceName
      } else {
        failure(node, msg, new Error('n-r-c-s-p: missing service name or empty string. result msg.filter>>' + JSON.stringify(msg.filter)), sonosFunction)
        return
      }
    } else {
      // default - no filter
      filter.serviceName = 'all'
      filter.mediaType = 'all'
    }
    node.debug('filter value >>>' + JSON.stringify(filter))

    getAllMySonosItems(sonosPlayer.baseUrl)
      .then(items => {
        if (!isTruthyAndNotEmptyString(items)) {
          throw new Error('n-r-c-s-p: could not find any My Sonos items')
        }
        // if not found throws error
        return findStringInMySonosTitle(items, msg.topic, filter)
      })
      .then(found => {
        return queue(sonosPlayer, found.uri, found.metaData)
      })
      .then(() => {
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Stream (aka play) first radio/stream in My Sonos streams matching search string in msg.topic.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {string} msg.topic search string for title
   * @param  {object} sonosPlayer Sonos Player
   * @output {object} msg unmodified / stopped in case of error
   */
  function stream (node, msg, sonosPlayer) {
    const sonosFunction = 'play my sonos stream'

    // validate msg.topic.
    if (!isValidPropertyNotEmptyString(msg, ['topic'])) {
      failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction)
      return
    }
    // TODO similiar to addURI, get service provider!
    const filter = {
      processingType: 'stream',
      mediaType: 'all',
      serviceName: 'all'
    } // only streams

    getAllMySonosItems(sonosPlayer.baseUrl)
      .then(items => {
        if (!isTruthyAndNotEmptyString(items)) {
          throw new Error('n-r-c-s-p: could not find any My Sonos items')
        }
        // if not found throws error
        return findStringInMySonosTitle(items, msg.topic, filter)
      })
      .then(found => {
        // TODO switch to set...  current Metadata not used!
        // this does setting the uri AND plays it!
        return sonosPlayer.setAVTransportURI(found.uri)
      })
      .then(() => {
        // optionally change volume
        if (isValidPropertyNotEmptyString(msg, ['volume'])) {
          const newVolume = parseInt(msg.volume)
          if (Number.isInteger(newVolume)) {
            if (newVolume > 0 && newVolume < 100) {
              // play and change volume
              node.debug('msg.volume is in range 1...99: ' + newVolume)
              return sonosPlayer.setVolume(msg.volume)
            } else {
              node.debug('msg.volume is not in range: ' + newVolume)
              throw new Error('n-r-c-s-p: msg.volume is out of range 1...99: ' + newVolume)
            }
          } else {
            node.debug('msg.volume is not number')
            throw new Error('n-r-c-s-p: msg.volume is not a number: ' + JSON.stringify(msg.volume))
          }
        } else {
          return true // dont touch volume
        }
      })
      .then(() => {
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /**  Export first My Sonos item - matching search string and outputs results
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {string} msg.topic search string
   * @param  {object} sonosPlayer Sonos Player
   *
   * @output {object} msg.payload = play.export
   * @output {string} msg.export.uri
   * @output {string} msg.export.metadata
   * @output {boolean} msg.export.queue
   *
   * @throws nothing!
   *
   * Info:  content valdidation of mediaType, serviceName in findStringInMySonosTitle
   */
  function exportItem (node, msg, sonosPlayer) {
    const sonosFunction = 'get my sonos'

    // validate msg.topic
    if (!isValidPropertyNotEmptyString(msg, ['topic'])) {
      failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction)
      return
    }

    getAllMySonosItems(sonosPlayer.baseUrl)
      .then(items => {
        if (!isTruthyAndNotEmptyString(items)) {
          throw new Error('n-r-c-s-p: could not find any My Sonos items')
        }
        // if not found throws error
        return findStringInMySonosTitleV1(items, msg.topic)
      })
      .then(found => {
        msg.payload = 'play.export'
        msg.export = { uri: found.uri, metadata: found.metaData, queue: found.queue }
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  RED.nodes.registerType('sonos-manage-mysonos', SonosManageMySonosNode)
}
