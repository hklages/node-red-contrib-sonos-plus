const {
  REGEX_IP,
  REGEX_SERIAL,
  discoverSonosPlayerBySerial,
  isValidProperty,
  isValidPropertyNotEmptyString,
  isTruthyAndNotEmptyString,
  failure,
  warning,
  success
} = require('./Helper.js')

const { getGroupMemberData, getGroupMemberDataByName, queue } = require('./Sonos-Commands.js')
const { Sonos } = require('sonos')

module.exports = function (RED) {
  'use strict'

  /**  Create Universal Node and subscribe to messages.
   * @param  {object} config current node configuration data
   */
  function SonosUniversalNode (config) {
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

    // if ip address exist use it or get it via discovery based on serialNum
    if (isValidProperty(configNode, ['ipaddress']) && REGEX_IP.test(configNode.ipaddress)) {
      node.debug('using IP address of config node')
    } else {
      // have to get ip address via disovery with serial numbers
      // this part cost time during procession and should be avoided - see warning.
      warning(node, sonosFunction, 'no ip address', 'Providing ip address is recommended')
      if (isValidProperty(configNode, ['serialnum']) && REGEX_SERIAL.test(configNode.serialnum)) {
        discoverSonosPlayerBySerial(node, configNode.serialnum, (err, newIpaddress) => {
          if (err) {
            failure(node, null, new Error('n-r-c-s-p: discovery failed'), sonosFunction)
            return
          }
          if (newIpaddress === null) {
            failure(node, null, new Error('n-r-c-s-p: could not find any player by serial'), sonosFunction)
          } else {
            // setting of nodestatus is done in following call handelIpuntMessage
            node.debug('found sonos player')
            configNode.ipaddress = newIpaddress
          }
        })
      } else {
        failure(node, null, new Error('n-r-c-s-p: invalid config node - invalid serial'), sonosFunction)
        return
      }
    }

    // clear node status
    node.status({})

    // subscribe and handle input message
    node.on('input', function (msg) {
      // TODO check wheter handling node status should be done here .then .catch
      node.debug('node - msg received')
      processInputMsg(node, msg, configNode.ipaddress)
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
    if (command === 'setplay_group') {
      setPlayGroup(node, msg, sonosPlayer)
        .then(() => success(node, msg, command))
        .catch(error => failure(node, msg, error, command))
    } else {
      warning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(command))
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /**  Set uri and play in a group - works for stream and queue.
   * @param  {object}  node current node
   * @param  {object}  msg incoming message
   * @param  {string}  msg.content content to be played
   * @param  {string}  msg.content.uri uri to be played
   * @param  {boolea}  msg.content.queue indicator has to be queued
   * @param  {string}  [msg.content.metadata] metadata in case of queue = true
   * @param  {string}  [msg.playerName] content to be played - if missing uses sonosPlayer
   * @param  {number}  [msg.volume] new volume - if missing do not touch volume
   * @param  {boolean} [msg.sameVolume] if true - if missing changes in whole group
   * @param  {object}  sonosPlayer Sonos Player - as default and anchor player
   *
   * @output unchanged
   *
   * @throws if playerName exist and is (not string or empty string)
   * if playerName or sonosPlayer cound not find in any group
   * if volume is not number/integer or out of range 1..99
   * if sameValue not boolean
   * if sameValue true and only one player in group
   * if sameValue exist but volume does not exist
   * if content.uri / queue is missing
   *
   */
  async function setPlayGroup (node, msg, sonosPlayer) {
    // validate msg.playerName.
    let usePlayerName = false // default -only if specified
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: invalid playerName,  must be string and not empty')
      } else {
        usePlayerName = true
      }
    }

    let members
    // TODO getGroupMember vereinen mit optionalem Parameter playerName!
    // TODO provide return value handling for every await
    if (usePlayerName) {
      members = await getGroupMemberDataByName(sonosPlayer, msg.playerName)
    } else {
      members = await getGroupMemberData(sonosPlayer)
    }

    // set newVolume, -1 means dont touch current volume - throw errors
    let newVolume = -1
    if (isValidProperty(msg, ['volume'])) {
      if (typeof msg.volume !== 'number') {
        throw new Error('n-r-c-s-p: invalid volume  - not number')
      }
      if (!Number.isInteger(msg.volume)) {
        throw new Error('n-r-c-s-p: invalid volume  - not integer')
      }
      if (!(msg.volume > 0 && msg.volume < 100)) {
        throw new Error('n-r-c-s-p: invalid volume  - out of range')
      }
      newVolume = msg.volume
    }

    // validate sameVolume - default is true - throw errors
    let newSameVolume = true
    if (isValidProperty(msg, ['sameVolume'])) {
      if (typeof msg.sameVolume !== 'boolean') {
        throw new Error('n-r-c-s-p: invalid sameVolume  - not boolean')
      }
      if (msg.sameVolume === false && members.length === 1) {
        throw new Error('n-r-c-s-p: invalid sameVolume because player is independent')
      }
      if (newVolume === -1 && msg.sameVolume === true) {
        throw new Error('n-r-c-s-p: sameVolume true but could not find volume')
      }
      newSameVolume = msg.sameVolume
    }

    // assuming valid content
    if (!isValidPropertyNotEmptyString(msg, ['content', 'queue'])) {
      throw new Error('n-r-c-s-p: queue identifier is missing')
    }
    if (!isValidPropertyNotEmptyString(msg, ['content', 'uri'])) {
      throw new Error('n-r-c-s-p: uri is missing')
    }
    const coordinator = new Sonos(members[0].urlHostname)
    coordinator.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`
    if (msg.content.queue) {
      await queue(coordinator, msg.content.uri, msg.content.metadata)
      await coordinator.selectQueue()
    } else {
      await coordinator.setAVTransportURI(msg.content.uri)
    }

    // set volume
    let player
    if (newVolume > -1) {
      if (newSameVolume) {
        for (let index = 0; index < members.length; index++) {
          player = new Sonos(members[index].urlHostname)
          await player.setVolume(msg.volume)
        }
      } else {
        if (usePlayerName) {
          // use by name
          for (let index = 0; index < members.length; index++) {
            if ((msg.playerName.localeCompare(members[index].playerName))) {
              player = new Sonos(members[index].urlHostname)
              player.setVolume(newVolume)
            }
          }
        } else {
          // use by ip
          // TODO playername should be made availabel - then easier to use - maybe better index!
          for (let index = 0; index < members.length; index++) {
            if (sonosPlayer.host.localeCompare(members[index].host)) {
              player = new Sonos(members[index].urlHostname)
              player.setVolume(newVolume)
            }
          }
        }
      }
    }
  }

  RED.nodes.registerType('sonos-universal', SonosUniversalNode)
}
