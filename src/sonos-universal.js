const {
  REGEX_IP,
  REGEX_SERIAL,
  REGEX_TIME,
  REGEX_2DIGITS,
  discoverSonosPlayerBySerial,
  isValidProperty,
  isValidPropertyNotEmptyString,
  isTruthyAndNotEmptyString,
  failure,
  warning,
  success
} = require('./Helper.js')

const { getGroupMemberDataV2, playGroupNotification, playJointerNotification, queue } = require('./Sonos-Commands.js')
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
    let command
    node.on('input', function (msg) {
      node.debug('node - msg received')
      command = msg.payload
      processInputMsg(node, msg, configNode.ipaddress)
        .then((msgUpdate) => {
          Object.assign(msg, msgUpdate)
          success(node, msg, command)
        })
        .catch(error => failure(node, msg, error, command))
    })
  }

  // ------------------------------------------------------------------------------------

  /**  Validate sonos player and msg.payload then dispatch further.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {string} ipaddress IP address of sonos player
   */
  async function processInputMsg (node, msg, ipaddress) {
    const sonosPlayer = new Sonos(ipaddress)
    // set baseUrl
    if (!isTruthyAndNotEmptyString(sonosPlayer)) {
      throw new Error('n-r-c-s-p: undefined sonos player')
    }
    if (!isValidPropertyNotEmptyString(sonosPlayer, ['host']) ||
      !isValidPropertyNotEmptyString(sonosPlayer, ['port'])) {
      throw new Error('n-r-c-s-p: missing ip or port')
    }
    sonosPlayer.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}` // usefull for my extensions

    // Check msg.payload. Store lowercase version in command
    if (!isValidPropertyNotEmptyString(msg, ['payload'])) {
      throw new Error('n-r-c-s-p: undefined payload')
    }

    // dispatch (dont add msg.topic because may not exist and is not checked)
    let command = String(msg.payload)
    command = command.toLowerCase()

    // dispatch
    if (command === 'play') {
      return groupPlay(node, msg, sonosPlayer)
    } else if (command === 'play.mysonos') {
      return groupPlayMySonos(node, msg, sonosPlayer)
    } else if (command === 'play.notification') {
      return groupPlayNotification(node, msg, sonosPlayer)
    } else if (command === 'joiner.play.notification') {
      return joinerPlayNotification(node, msg, sonosPlayer)
    } else if (command === 'player.set.volume') {
      return playerSetVolume(node, msg, sonosPlayer)
    } else if (command === 'next.track') {
      return groupNextSong(node, msg, sonosPlayer)
    } else if (command === 'previous.track') {
      return groupPreviousSong(node, msg, sonosPlayer)
    } else if (command === 'toogle.playback') {
      return groupTogglePlayback(node, msg, sonosPlayer)
    } else if (command === 'stop') {
      return groupStop(node, msg, sonosPlayer)
    } else if (command === 'get.playbackstate') {
      return groupGetState(node, msg, sonosPlayer)
    } else if (command === 'player.get.volume') {
      return playerGetVolume(node, msg, sonosPlayer)
    } else {
      warning(node, 'handle input msg', 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(command))
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /**  Play already set content on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] content to be played - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos Player - as default and anchor player
   *
   * @returns  {} means dont change msg
   *
   * @throws if playerName exist and is (not string or empty string)
   *          all from getGroupMemberDataV1
   */
  async function groupPlay (node, msg, sonosPlayer) {
    let newPlayerName = '' // default
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or empty string')
      }
      newPlayerName = msg.playerName
    }
    const groupData = await getGroupMemberDataV2(sonosPlayer, newPlayerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.play()
    return {}
  }

  /**  Set uri and play a given My Sonos item on a gvien group of players - works for stream and queue.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.content content to be played
   * @param  {string}  msg.content.uri uri to be played
   * @param  {boolea}  msg.content.queue indicator has to be queued
   * @param  {string}  [msg.content.metadata] metadata in case of queue = true
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {number}  [msg.volume] new volume - if missing do not touch volume
   * @param  {boolean} [msg.sameVolume] if true - if missing changes in whole group
   * @param  {object}  sonosPlayer Sonos Player - as default and anchor player
   *
   * @returns {promise} {} means dont change msg
   *
   * @throws  if msg.playerName exist and is (not string or empty string)
   *          if msg.playerName or sonosPlayer cound not find in any group
   *          if msg.volume is not number/integer or out of range 1..99
   *          if msg.sameValue not boolean
   *          if msg.sameValue true and only one player in group
   *          if msg.sameValue exist but volume does not exist
   *          if msg.content.uri / msg.content.queue is missing
   */
  async function groupPlayMySonos (node, msg, sonosPlayer) {
    let newPlayerName = '' // default
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or empty string')
      }
      newPlayerName = msg.playerName
    }
    const groupData = await getGroupMemberDataV2(sonosPlayer, newPlayerName)

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
      if (msg.sameVolume === false && groupData.members.length === 1) {
        throw new Error('n-r-c-s-p: invalid sameVolume because player is independent')
      }
      if (newVolume === -1 && msg.sameVolume === true) {
        throw new Error('n-r-c-s-p: sameVolume is true but no volume')
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
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    coordinator.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`
    if (msg.content.queue) {
      await queue(coordinator.baseUrl, msg.content.uri, msg.content.metadata)
      await coordinator.selectQueue()
    } else {
      await coordinator.setAVTransportURI(msg.content.uri)
    }

    // set volume
    let player
    if (newVolume > -1) {
      if (newSameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          player = new Sonos(groupData.members[index].urlHostname)
          await player.setVolume(msg.volume)
        }
      } else {
        player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        player.setVolume(newVolume)
      }
    }
    return {} // means untouched msg
  }

  /**  Play notification on a joiner (in group) specified by sonosPlayer (default) or by playerName.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic valid notification as uri
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {number}  [msg.volume] valid integer 1 .. 99 - if missing dont touch current volume
   * @param  {boolean} [msg.duration] duration of notification - default is calculation, if that fails then 00:00:05
   * @param  {object}  sonosPlayer Sonos Player
   * @output {object} msg unmodified / stopped in case of error
   *
   * @throws if given player is not a joiner aka not a coordinator
   *          if msg.topic is invalid
   *          if msg.volume is not integer in range 1 ..99
   *          if msg.duration is not string in format hh:mm:ss
   *          if msg.playerName is not a string or empty
   *          any throw from getGroupMemberDataV1, playGroupNotification
   *
   * Hints:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this player and the group shound be modified
   */
  async function joinerPlayNotification (node, msg, sonosPlayer) {
    // validate all properties and use defaults
    if (!isValidPropertyNotEmptyString(msg, ['topic'])) {
      throw new Error('n-r-c-s-p: invalid msg.topic')
    }
    const options = { // set defaults
      uri: msg.topic,
      volume: -1, // means dont touch
      automaticDuration: true,
      duration: '00:00:05' // in case automaticDuration does not work - 5 seconds
    }

    // update options.volume
    if (isValidProperty(msg, ['volume'])) {
      const tmpVolume = msg.volume
      if (typeof tmpVolume !== 'number') {
        throw new Error('n-r-c-s-p: msg.volume is not a number')
      }
      if (!Number.isInteger(tmpVolume)) {
        throw new Error('n-r-c-s-p: msg.volume is not an integer')
      }
      if (!(tmpVolume > 0 && tmpVolume < 100)) {
        throw new Error('n-r-c-s-p: msg.volume is out of range 1 .. 99')
      }
      options.volume = msg.volume
    }

    // update options.duration - get info from SONOS
    if (isValidProperty(msg, ['duration'])) {
      if (typeof msg.duration !== 'string') {
        throw new Error('n-r-c-s-p: msg.duration is not a string')
      }
      if (!REGEX_TIME.test(msg.duration)) {
        throw new Error('n-r-c-s-p: msg.duration is not format hh:mm:ss')
      }
      options.duration = msg.duration
      options.automaticDuration = false
    }

    // default player is sonosPlayer but can be overwritten by playerName
    let playerName = ''
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or empty string')
      }
      playerName = msg.playerName
    }
    /// get group data (coordinator is first) then use replacement of standard play notification
    const groupData = await getGroupMemberDataV2(sonosPlayer, playerName)
    // verify that player is joiner and not a coordinator and get ip
    if (groupData.playerIndex === 0) {
      throw new Error('n-r-c-s-p: player is not a joiner')
    }
    const membersPlayerPlus = []
    let sonosPlayerCreated = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosPlayerCreated = new Sonos(groupData.members[index].urlHostname)
      sonosPlayerCreated.baseUrl = groupData.members[index].baseUrl
      membersPlayerPlus.push(sonosPlayerCreated)
    }
    await playJointerNotification(node, membersPlayerPlus, groupData.playerIndex, options)
    return true
  }

  /**  Play notification on a given group of players. Group topology will not being touched.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic valid notification as uri
   * @param  {string}  [msg.playerName] SONOS player name - if missing use sonosPlayer
   * @param  {number}  [msg.volume] integer 1 .. 99. if missing dont touch volume
   * @param  {boolean} [msg.sameVolume = true] on all players same volume
   * @param  {boolean} [msg.duration] duration of notification - standard is calculation
   * @param  {object}  sonosPlayer Sonos Player
   * @output {object}  msg unmodified / stopped in case of error
   *
   * @throws  if msg.topic is invalid or empty string
   *          if msg.playerName is specified but not (string and not empty)
   *          if msg.volume is specified but is not a integer in ragen 1 .. 99
   *          if msg.sameVolume is specified but not boolean
   *          if msg.duration is not (string and format hh:mm:ss)
   *          all throws from playGroupNotification
   * Hint:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this group.
   */
  async function groupPlayNotification (node, msg, sonosPlayer) {
    // validate all properties and use defaults
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error('n-r-c-s-p: invalid msg.topic')
    }
    if (typeof msg.topic !== 'string' || msg.topic.length === 0) {
      throw new Error('n-r-c-s-p: msg.topic is not a string or empty string')
    }
    const options = { // set defaults
      uri: msg.topic,
      volume: -1,
      sameVolume: true,
      automaticDuration: true,
      duration: '00:00:05' // in case automaticDuration does not work - 5 seconds
    }

    // update options.volume - if missing then 40
    if (isValidProperty(msg, ['volume'])) {
      const tmpVolume = msg.volume
      if (typeof tmpVolume !== 'number') {
        throw new Error('n-r-c-s-p: msg.volume is not a number')
      }
      if (!Number.isInteger(tmpVolume)) {
        throw new Error('n-r-c-s-p: msg.volume is not an integer')
      }
      if (!(tmpVolume > 0 && tmpVolume < 100)) {
        throw new Error('n-r-c-s-p: msg.volume is out of range 1 .. 99')
      }
      options.volume = msg.volume
    }

    // update options.sameVolume - if missing then true
    if (isValidProperty(msg, ['sameVolume'])) {
      if (typeof msg.sameVolume !== 'boolean') {
        throw new Error('n-r-c-s-p: msg.sameVolume is not boolean')
      }
      options.sameVolume = msg.sameVolume
    }

    // update options.duration - get info from SONOS
    if (isValidProperty(msg, ['duration'])) {
      if (typeof msg.duration !== 'string') {
        throw new Error('n-r-c-s-p: msg.duration ist not a string')
      }
      if (!REGEX_TIME.test(msg.duration)) {
        throw new Error('n-r-c-s-p: msg.duration is not format hh:mm:ss')
      }
      options.duration = msg.duration
      options.automaticDuration = false
    }

    let playerName = ''
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or empty string')
      }
      playerName = msg.playerName
    }
    /// get group data (coordinator is first) then use replacement of standard play notification
    const groupData = await getGroupMemberDataV2(sonosPlayer, playerName)
    const membersPlayerPlus = []
    let sonosPlayerCreated = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosPlayerCreated = new Sonos(groupData.members[index].urlHostname)
      sonosPlayerCreated.baseUrl = groupData.members[index].baseUrl
      membersPlayerPlus.push(sonosPlayerCreated)
    }
    await playGroupNotification(node, membersPlayerPlus, options)
    return true
  }

  /**  Play next song on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] content to be played - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos Player - as default and anchor player
   *
   * @output msg unchanged
   *
   * @throws if playerName exist and is (not string or empty string)
   *          all from getGroupMemberDataV1
   */
  async function groupNextSong (node, msg, sonosPlayer) {
    let newPlayerName = '' // default
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or empty string')
      }
      newPlayerName = msg.playerName
    }
    const groupData = await getGroupMemberDataV2(sonosPlayer, newPlayerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.next()
    return {} // means untouched msg
  }

  /**  Play previous song on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] content to be played - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos Player - as default and anchor player
   *
   * @output msg unchanged
   *
   * @throws if playerName exist and is (not string or empty string)
   *          all from getGroupMemberDataV1
   */
  async function groupPreviousSong (node, msg, sonosPlayer) {
    let newPlayerName = '' // default
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or empty string')
      }
      newPlayerName = msg.playerName
    }
    const groupData = await getGroupMemberDataV2(sonosPlayer, newPlayerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.previous()
    return {} // means untouched msg
  }

  /**  Set volume for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number}  msg.topic volume, integer 1 .. 99
   * @param  {string}  [msg.playerName] content to be played - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos Player - as default and anchor player
   *
   * @output msg unchanged
   *
   * @throws if playerName exist and is (not string or empty string)
   *          all from getGroupMemberDataV1
   */
  async function playerSetVolume (node, msg, sonosPlayer) {
    let newPlayerName = '' // default
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or empty string')
      }
      newPlayerName = msg.playerName
    }

    // volume must be integer, 1..99
    let newVolume
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error('n-r-c-s-p: msg.topic is invalid')
    }
    if (typeof msg.topic !== 'number' && typeof msg.topic !== 'string') {
      throw new Error('n-r-c-s-p: msg.topic is not string or number')
    }
    if (typeof msg.topic === 'number') {
      if (!Number.isInteger(msg.topic)) {
        throw new Error('n-r-c-s-p: msg.topic is not integer')
      }
      newVolume = msg.topic
    } else {
      // must be string
      if (!REGEX_2DIGITS.test(msg.topic)) {
        throw new Error('n-r-c-s-p: msg.topic is not a single/double digit')
      }
      newVolume = parseInt(msg.topic)
    }
    if (!(newVolume >= 1 && msg.topic <= 99)) {
      throw new Error('n-r-c-s-p: msg.topic is out of range 1 .. 99 ')
    }

    if (newPlayerName === '') {
      await sonosPlayer.setVolume(newVolume)
    } else {
      const response = await getGroupMemberDataV2(sonosPlayer, newPlayerName)
      const player = new Sonos(response.members[response.playerIndex].urlHostname)
      await player.setVolume(newVolume)
    }
    return {} // means untouched msg
  }

  /**  Get volume of given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] content to be played - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos Player - as default and anchor player
   *
   * @output {promise}  object with volume
   *
   * @throws if playerName exist and is (not string or empty string)
   *          all from getGroupMemberDataV1
   */
  async function playerGetVolume (node, msg, sonosPlayer) {
    let newPlayerName = '' // default
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or empty string')
      }
      newPlayerName = msg.playerName
    }
    let volume
    if (newPlayerName === '') {
      volume = await sonosPlayer.getVolume()
    } else {
      const response = await getGroupMemberDataV2(sonosPlayer, newPlayerName)
      const player = new Sonos(response.members[response.playerIndex].urlHostname)
      volume = await player.getVolume()
    }
    return { payload: volume }
  }

  /**  Toggle playback on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] content to be played - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos Player - as default and anchor player
   *
   * @output msg unchanged
   *
   * @throws if playerName exist and is (not string or empty string)
   *          all from getGroupMemberDataV1
   */
  async function groupTogglePlayback (node, msg, sonosPlayer) {
    let newPlayerName = '' // default
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or empty string')
      }
      newPlayerName = msg.playerName
    }
    const groupData = await getGroupMemberDataV2(sonosPlayer, newPlayerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.togglePlayback()
    return {} // means untouched msg
  }

  /**  Stop playing in that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos Player - as default and anchor player
   *
  * @returns {promise}  object to update msg. Empty that means msg is unchanged.
   *
   * @throws if playerName exist and is (not string or empty string)
   *          all from getGroupMemberDataV1
   */
  async function groupStop (node, msg, sonosPlayer) {
    let newPlayerName = '' // default
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or not empty string')
      }
      newPlayerName = msg.playerName
    }
    const groupData = await getGroupMemberDataV2(sonosPlayer, newPlayerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.stop()
    return {}
  }

  /**  Get the status of that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos Player - as default and anchor player
   *
   * @returns {promise} object to update msg. msg.payload to status of player as string.
   *
   * @throws if playerName exist and is (not string or empty string)
   *          all from getGroupMemberDataV1
   */
  async function groupGetState (node, msg, sonosPlayer) {
    let newPlayerName = '' // default
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error('n-r-c-s-p: msg.playername is not string or empty string')
      }
      newPlayerName = msg.playerName
    }
    const groupData = await getGroupMemberDataV2(sonosPlayer, newPlayerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    const status = await coordinator.getCurrentState()
    return { payload: status }
  }

  RED.nodes.registerType('sonos-universal', SonosUniversalNode)
}
