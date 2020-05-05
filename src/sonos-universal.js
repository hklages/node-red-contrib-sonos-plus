const {
  REGEX_SERIAL, REGEX_IP, REGEX_TIME, REGEX_2DIGITS, REGEX_2DIGITSSIGN, REGEX_RADIO_ID,
  NRCSP_ERRORPREFIX,
  discoverSonosPlayerBySerial,
  isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString, isTruthy,
  failure, success
} = require('./Helper.js')

const {
  getGroupMemberDataV2, playGroupNotification, playJoinerNotification,
  createGroupSnapshot, restoreGroupSnapshot, saveQueue, getAllSonosPlaylists,
  setGroupMute, getGroupMute, setGroupVolumeRelative, getGroupVolume, getCmd, getGroupQueue
} = require('./Sonos-Commands.js')

const { Sonos } = require('sonos')

module.exports = function (RED) {
  'use strict'

  /** Create Universal node and subscribe to messages.
   * @param  {object} config current node configuration data
   */
  function SonosUniversalNode (config) {
    RED.nodes.createNode(this, config)
    const nrcspFunction = 'create and subscribe'

    const node = this
    const configNode = RED.nodes.getNode(config.confignode)

    // ipaddress overriding serialnum - at least one must be valid
    if (isValidProperty(configNode, ['ipaddress']) && typeof configNode.ipaddress === 'string' && REGEX_IP.test(configNode.ipaddress)) {
      node.debug('config node IP address is being used')
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
            node.debug('OK found sonos player')
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
      const command = msg.payload // have to capture
      processInputMsg(node, msg, configNode.ipaddress)
        .then((msgUpdate) => {
          Object.assign(msg, msgUpdate)
          success(node, msg, command)
        })
        .catch((error) => failure(node, msg, error, 'processing msg'))
    })
  }

  /** Validate sonos player object and msg.payload then dispatch further.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {string} ipaddress IP address of sonos player
   *
   * @return {promise} Returns an object with all msg properties having to be modified
   * example: returning {} means msg is not modified
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

    // Check msg.payload. Store lowercase version in command
    if (!isValidPropertyNotEmptyString(msg, ['payload'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} command (msg.payload) is undefined/invalid`)
    }
    let command = String(msg.payload)
    command = command.toLowerCase()

    switch (command) {
      case 'play':
        return groupPlay(node, msg, sonosPlayer)
      case 'play.queue':
        return groupPlayQueue(node, msg, sonosPlayer)
      case 'play.export':
        return groupPlayExport(node, msg, sonosPlayer)
      case 'play.tunein':
        return groupPlayTuneIn(node, msg, sonosPlayer)
      case 'play.streamhttp':
        return groupPlayStreamHttp(node, msg, sonosPlayer)
      case 'play.notification':
        return groupPlayNotification(node, msg, sonosPlayer)
      case 'joiner.play.notification':
        return joinerPlayNotification(node, msg, sonosPlayer)
      case 'play.snap':
        return groupPlaySnapshot(node, msg, sonosPlayer)
      case 'next.track':
        return groupNextTrack(node, msg, sonosPlayer)
      case 'previous.track':
        return groupPreviousTrack(node, msg, sonosPlayer)
      case 'toggle.playback':
        return groupTogglePlayback(node, msg, sonosPlayer)
      case 'pause':
        return groupPause(node, msg, sonosPlayer)
      case 'stop':
        return groupStop(node, msg, sonosPlayer)
      case 'adjust.volume':
        return groupAdjustVolume(node, msg, sonosPlayer)
      case 'player.adjust.volume':
        return playerAdjustVolume(node, msg, sonosPlayer)
      case 'player.set.volume':
        return playerSetVolume(node, msg, sonosPlayer)
      case 'set.mutestate':
        return groupSetMute(node, msg, sonosPlayer)
      case 'player.set.mutestate':
        return playerSetMute(node, msg, sonosPlayer)
      case 'create.snap':
        return groupCreateSnapshot(node, msg, sonosPlayer)
      case 'save.queue':
        return groupSaveQueueToSonosPlaylist(node, msg, sonosPlayer)
      case 'clear.queue':
        return groupClearQueue(node, msg, sonosPlayer)
      case 'remove.sonosplaylist':
        return groupRemoveSonosPlaylist(node, msg, sonosPlayer)
      case 'player.join.group':
        return groupJoin(node, msg, sonosPlayer)
      case 'player.leave.group':
        return groupLeave(node, msg, sonosPlayer)
      case 'get.state':
        return groupGetState(node, msg, sonosPlayer)
      case 'get.playbackstate':
        return groupGetPlaybackstate(node, msg, sonosPlayer)
      case 'get.volume':
        return groupGetVolume(node, msg, sonosPlayer)
      case 'player.get.volume':
        return playerGetVolume(node, msg, sonosPlayer)
      case 'get.mutestate':
        return groupGetMute(node, msg, sonosPlayer)
      case 'player.get.mutestate':
        return playerGetMute(node, msg, sonosPlayer)
      case 'player.get.role':
        return playerGetRole(node, msg, sonosPlayer)
      case 'get.queue':
        return groupGetQueue(node, msg, sonosPlayer)
      case 'player.get.queue':
        return playerGetQueue(node, msg, sonosPlayer)
      case 'get.trackplus':
        return groupGetTrackPlus(node, msg, sonosPlayer)
      case 'lab':
        return lab(node, msg, sonosPlayer)
      default:
        throw new Error(`${NRCSP_ERRORPREFIX} command (msg.payload) is invalid >>${msg.payload} `)
    }
  }

  // ========================================================================
  //
  //             COMMANDS
  //
  // ========================================================================

  /**  Play already set content on given group of players. Optional set volume, use playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} means dont change msg
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *          if msg.sameVolume === false and player === standalone because non sense.
   */
  async function groupPlay (node, msg, sonosPlayer) {
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.play()

    if (validated.volume !== -1) {
      let player
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          player = new Sonos(groupData.members[index].urlHostname)
          await player.setVolume(validated.volume)
        }
      } else {
        player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        await player.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play non empty queue.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} means dont change msg
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *          if msg.sameVolume === false and player === standalone because non sense.
   *          if getQueue returns invalid response or queue is empty
   */
  async function groupPlayQueue (node, msg, sonosPlayer) {
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    const queueData = await coordinator.getQueue()

    if (!isTruthyAndNotEmptyString(queueData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} get queue response is undefined`)
    }
    if (queueData.returned === '0') {
      // queue is empty
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }
    await coordinator.selectQueue()

    if (validated.volume !== -1) {
      let player
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          player = new Sonos(groupData.members[index].urlHostname)
          await player.setVolume(validated.volume)
        }
      } else {
        player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        await player.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play data being exported form My Sonos (uri/metadata) on a gvien group of players
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.export content to be played
   * @param  {string}  msg.export.uri uri to be played/queued
   * @param  {boolea}  msg.export.queue indicator: has to be queued
   * @param  {string}  [msg.export.metadata] metadata in case of queue = true
   * @param  {number}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {boolea}  [msg.clearQueue] if true and export.queue = true the queue is cleared. Default is true.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} means dont change msg
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *          if msg.export.uri / msg.export.queue is missing
   */
  async function groupPlayExport (node, msg, sonosPlayer) {
    // simple validation of export and activation
    if (!isValidPropertyNotEmptyString(msg, ['export', 'queue'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue identifier is missing`)
    }
    if (!isValidPropertyNotEmptyString(msg, ['export', 'uri'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} uri is missing`)
    }

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }

    const coordinator = new Sonos(groupData.members[0].urlHostname)
    coordinator.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`
    if (msg.export.queue) {
      if (validated.clearQueue) {
        await coordinator.flush()
      }
      await coordinator.queue({ uri: msg.export.uri, metadata: msg.export.metadata })
      await coordinator.selectQueue()
    } else {
      await coordinator.setAVTransportURI(msg.export.uri)
    }
    if (validated.volume !== -1) {
      let player
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          player = new Sonos(groupData.members[index].urlHostname)
          await player.setVolume(validated.volume)
        }
      } else {
        player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        await player.setVolume(validated.volume)
      }
    }
    return {} // means untouched msg
  }

  /**  Play tuneIn station. Optional set volume, use playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic TuneId id
   * @param  {number}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} means dont change msg
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *          if msg.sameVolume === false and player == standalone because non sense.
   */
  async function groupPlayTuneIn (node, msg, sonosPlayer) {
    // validate msg.topic
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} TuneIn radio id (msg.topic) is undefined/invalid`)
    }
    if (typeof msg.topic !== 'string' || !REGEX_RADIO_ID.test(msg.topic)) {
      throw new Error(`${NRCSP_ERRORPREFIX} TuneIn radio id (msg.topic) has wrong syntax: ${JSON.stringify(msg.topic)}`)
    }

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.playTuneinRadio(msg.topic)

    if (validated.volume !== -1) {
      let player
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          player = new Sonos(groupData.members[index].urlHostname)
          await player.setVolume(validated.volume)
        }
      } else {
        player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        await player.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play stream from http. Optional set volume, use playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic https uri
   * @param  {number}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} means dont change msg
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *          if msg.sameVolume === false and player === tandalone because non sense.
   */
  async function groupPlayStreamHttp (node, msg, sonosPlayer) {
    // validate msg.topic
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} uri (msg.topic) is undefined/invalid`)
    }
    if (typeof msg.topic !== 'string' || !msg.topic.startsWith('http')) {
      throw new Error(`${NRCSP_ERRORPREFIX} uri (msg.topic) does not start with http`)
    }

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.setAVTransportURI(msg.topic)

    if (validated.volume !== -1) {
      let player
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          player = new Sonos(groupData.members[index].urlHostname)
          await player.setVolume(validated.volume)
        }
      } else {
        player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        await player.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play notification on a given group of players. Group topology will not being touched.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic valid notification as uri
   * @param  {number}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {string}  [msg.duration] duration of notification hh:mm:ss - default is calculation, if that fails then 00:00:05
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise}  {}
   *
   * @throws  if msg.topic is invalid or empty string
   *          all from validatedGroupProperties
   *          if msg.duration is not (string and format hh:mm:ss)
   *          all throws from playGroupNotification
   * Hint:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this group.
   */
  async function groupPlayNotification (node, msg, sonosPlayer) {
    // validate all properties and use defaults
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} uri (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string' || msg.topic.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} uri (msg.topic) is not a string or empty string`)
    }
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const options = { // set defaults
      uri: msg.topic,
      volume: validated.volume,
      sameVolume: validated.sameVolume,
      automaticDuration: true,
      duration: '00:00:05' // in case automaticDuration does not work - 5 seconds
    }

    // update options.duration - get info from SONOS
    if (isValidProperty(msg, ['duration'])) {
      if (typeof msg.duration !== 'string') {
        throw new Error(`${NRCSP_ERRORPREFIX} duration (msg.duration) is not a string`)
      }
      if (!REGEX_TIME.test(msg.duration)) {
        throw new Error(`${NRCSP_ERRORPREFIX} duration (msg.duration) is not format hh:mm:ss`)
      }
      options.duration = msg.duration
      options.automaticDuration = false
    }

    const membersPlayerPlus = []
    let sonosPlayerCreated = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosPlayerCreated = new Sonos(groupData.members[index].urlHostname)
      sonosPlayerCreated.baseUrl = groupData.members[index].baseUrl
      membersPlayerPlus.push(sonosPlayerCreated)
    }
    await playGroupNotification(node, membersPlayerPlus, options)
    return {}
  }

  /**  Play notification on a joiner (in group) specified by sonosPlayer (default) or by playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic valid notification as uri
   * @param  {number}  [msg.volume] volume - if missing do not touch volume
   * @param  {string} [msg.duration] duration of notification hh:mm:ss - default is calculation, if that fails then 00:00:05
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} {}
   *
   * @throws if given player is not a joiner aka not a coordinator
   *          if msg.topic is invalid
   *          all from validatedGroupProperties
   *          if msg.duration is not string in format hh:mm:ss
   *          all from getGroupMemberDataV2, playJoinerNotification
   *
   * Hints:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this player and the group shound be modified
   */
  async function joinerPlayNotification (node, msg, sonosPlayer) {
    // validate all properties and use defaults
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} uri (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string' || msg.topic.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} uri (msg.topic) is not a string or empty string`)
    }
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    // verify that player is joiner and not a coordinator
    if (groupData.playerIndex === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} player (msg.player/node) is not a joiner`)
    }

    // msg.sameVolume is not used (only one player!)
    const options = { // set defaults
      uri: msg.topic,
      volume: validated.volume, // means dont touch
      automaticDuration: true,
      duration: '00:00:05' // in case automaticDuration does not work - 5 seconds
    }

    // update options.duration - get info from SONOS player
    if (isValidProperty(msg, ['duration'])) {
      if (typeof msg.duration !== 'string') {
        throw new Error(`${NRCSP_ERRORPREFIX} duration (msg.duration) is not a string`)
      }
      if (!REGEX_TIME.test(msg.duration)) {
        throw new Error(`${NRCSP_ERRORPREFIX} duration (msg.duration) is not format hh:mm:ss`)
      }
      options.duration = msg.duration
      options.automaticDuration = false
    }

    // The coordinator is being used to capture group status (playing, content, ...)
    const coordinatorPlus = new Sonos(groupData.members[0].urlHostname)
    coordinatorPlus.baseUrl = groupData.members[0].baseUrl

    const joinerPlus = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    joinerPlus.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    await playJoinerNotification(node, coordinatorPlus, joinerPlus, options)
    return {}
  }

  /**  Play a given snapshot on the given group of players.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {object}  [msg.snap] snapshot - output form groupCreateSnapshot
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise}  {}
   *
   * @throws  all throws from playGroupNotification
   *          all from validatedGroupProperties
   *
   * Assumption: msg.snap is valid - not checked.
   */
  async function groupPlaySnapshot (node, msg, sonosPlayer) {
    if (isValidProperty(msg, ['snap'])) {
      if (typeof msg.snap !== 'object') {
        throw new Error(`${NRCSP_ERRORPREFIX}: snapshot (msg.snap) is not object`)
      }
    } else {
      throw new Error(`${NRCSP_ERRORPREFIX}: snapshot (msg.snap) is missing`)
    }

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const membersPlayerPlus = []
    let sonosPlayerCreated = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosPlayerCreated = new Sonos(groupData.members[index].urlHostname)
      sonosPlayerCreated.baseUrl = groupData.members[index].baseUrl
      membersPlayerPlus.push(sonosPlayerCreated)
    }
    await restoreGroupSnapshot(node, membersPlayerPlus, msg.snap)
    if (msg.snap.wasPlaying) {
      await membersPlayerPlus[0].play()
    }
    return {}
  }

  /**  Play next track on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupNextTrack (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.next()
    return {} // means untouched msg
  }

  /**  Play previous track on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupPreviousTrack (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.previous()
    return {} // means untouched msg
  }

  /**  Toggle playback on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupTogglePlayback (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.togglePlayback()
    return {} // means untouched msg
  }

  /**  Pause playing in that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
  * @return {promise}  {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupPause (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.pause()
    return {}
  }

  /**  Stop playing in that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
  * @return {promise}  {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupStop (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.stop()
    return {}
  }

  /**  Adjust group volume
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number}  msg.topic +/- 1 .. 99
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} output msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupAdjustVolume (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} volume (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string') {
      throw new Error(`${NRCSP_ERRORPREFIX} volume (msg.topic) is not string`)
    }
    // it is a string
    if (!REGEX_2DIGITSSIGN.test(msg.topic)) {
      throw new Error(`${NRCSP_ERRORPREFIX}: volume (msg.topic) is not a +/- 1 .. 99`)
    }
    const newVolume = parseInt(msg.topic)

    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setGroupVolumeRelative(groupData.members[0].baseUrl, newVolume)
    return {} // means untouched msg
  }

  /**  Adjust player volume.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number}  msg.topic +/- 1 .. 99
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} output msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function playerAdjustVolume (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} volume (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string') {
      throw new Error(`${NRCSP_ERRORPREFIX} volume (msg.topic) is not string`)
    }
    // it is a string
    if (!REGEX_2DIGITSSIGN.test(msg.topic)) {
      throw new Error(`${NRCSP_ERRORPREFIX}: volume (msg.topic) is not a +/- 1 .. 99`)
    }
    const adjustVolume = parseInt(msg.topic)

    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    await player.adjustVolume(adjustVolume)
    return {} // means untouched msg
  }

  /**  Set volume for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number}  msg.topic volume, integer 1 .. 99
   * @param  {number}  [msg.volume] volume - if missing do not touch volume
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function playerSetVolume (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    // if volume is set in msg.volume - msg.topic is ignored.
    let newVolume
    if (validated.volume === -1) {
      // volume must be integer, 1..99, volume is required field!
      if (!isValidProperty(msg, ['topic'])) {
        throw new Error(`${NRCSP_ERRORPREFIX} volume (msg.topic) is invalid`)
      }
      if (typeof msg.topic !== 'number' && typeof msg.topic !== 'string') {
        throw new Error(`${NRCSP_ERRORPREFIX} volume (msg.topic) is not string or number`)
      }
      if (typeof msg.topic === 'number') { // is poasible when using change node
        if (!Number.isInteger(msg.topic)) {
          throw new Error(`${NRCSP_ERRORPREFIX} volume (msg.topic) is not integer`)
        }
        newVolume = msg.topic
      } else {
        // must be string
        if (!REGEX_2DIGITS.test(msg.topic)) {
          throw new Error(`${NRCSP_ERRORPREFIX} volume (msg.topic) is not a single/double digit`)
        }
        newVolume = parseInt(msg.topic)
      }
      if (!(newVolume >= 1 && msg.topic <= 99)) {
        throw new Error(`${NRCSP_ERRORPREFIX} msg.topic is out of range 1 .. 99`)
      }
    } else {
      node.debug('volume from msg.topic is being ignored as msg.volume is definend')
      newVolume = validated.volume
    }

    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    await player.setVolume(newVolume)
    return {} // means untouched msg
  }

  /**  Set group mute.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number}  msg.topic On/Off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupSetMute (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} mutestate (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string') {
      throw new Error(`${NRCSP_ERRORPREFIX} mutestate (msg.topic) is not string`)
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      throw new Error(`${NRCSP_ERRORPREFIX} mutestate (msg.topic) is not On/Off`)
    }
    const newMuteState = msg.topic === 'On'

    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setGroupMute(groupData.members[0].baseUrl, newMuteState)
    return {} // means untouched msg
  }

  /**  Set mute for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic On Off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function playerSetMute (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} mutestate (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string') {
      throw new Error(`${NRCSP_ERRORPREFIX} mutestate (msg.topic) is not string`)
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      throw new Error(`${NRCSP_ERRORPREFIX} mutestate (msg.topic) is not On/Off`)
    }
    const newMuteState = msg.topic === 'On'

    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    await player.setMuted(newMuteState)
    return {} // means untouched msg
  }

  /**  Create a snapshot of the given group of players.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {boolean} [msg.snapVolumes = false] will capture the players volumes
   * @param  {boolean} [msg.snapMutestate = false] will capture the players mutestates
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise}  {payload: snap} snap see createGroupSnapshot
   *
   *
   * @throws  all throws from playGroupNotification
   *          all from validatedGroupProperties
   */
  async function groupCreateSnapshot (node, msg, sonosPlayer) {
    // validate msg properties
    const options = { snapVolumes: false, snapMutestates: false } // default
    if (isValidProperty(msg, ['snapVolumes'])) {
      if (typeof msg.snapVolumes !== 'boolean') {
        throw new Error(`${NRCSP_ERRORPREFIX}: snapVolumes indicator (msg.snapVolumes) is not boolean`)
      }
      options.snapVolumes = msg.snapVolumes
    }
    if (isValidProperty(msg, ['snapMutestates'])) {
      if (typeof msg.snapVolumes !== 'boolean') {
        throw new Error(`${NRCSP_ERRORPREFIX}: snapMutestates indicator (msg.snapMutestates) is not boolean`)
      }
      options.snapMutestates = msg.snapMutestates
    }

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const membersPlayerPlus = []
    let sonosPlayerCreated = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosPlayerCreated = new Sonos(groupData.members[index].urlHostname)
      sonosPlayerCreated.baseUrl = groupData.members[index].baseUrl
      membersPlayerPlus.push(sonosPlayerCreated)
    }
    const snap = await createGroupSnapshot(node, membersPlayerPlus, options)
    return { payload: snap }
  }

  /**  Save SONOS queue to Sonos playlist.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number}  msg.topic title of Sonos playlist
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} output msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupSaveQueueToSonosPlaylist (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} title (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string' || msg.topic.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} title (msg.topic) is not string`)
    }
    // it is a string
    const title = msg.topic
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await saveQueue(groupData.members[0].baseUrl, title)
    return {} // means untouched msg
  }

  /**  Clear queue.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupClearQueue (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    await coordinator.flush()
    return {} // means untouched msg
  }

  /**  Remove Sonos playlist with given title. (impact on My Sonos and also Sonos playlist list)
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.topic] Exact title of Sonos playlist
   * @param  {boolean} [msg.ignoreNotExists] if missing assume true
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupRemoveSonosPlaylist (node, msg, sonosPlayer) {
    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} title (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string' || msg.topic.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} title (msg.topic) is not string`)
    }
    const searchTitle = msg.topic

    let ignoreNotExists = true
    if (isValidProperty(msg, ['ignoreNotExists'])) {
      if (typeof msg.volume !== 'boolean') {
        throw new Error(`${NRCSP_ERRORPREFIX}: msg.ignoreNotExists is not boolean`)
      }
      ignoreNotExists = msg.ignoreNotExist
    }

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinatorIndex = 0
    const playLists = await getAllSonosPlaylists(groupData.members[coordinatorIndex].baseUrl)

    if (!isTruthy(playLists)) {
      throw new Error(`${NRCSP_ERRORPREFIX}: Sonos playlist list is invalid`)
    }
    // find title in playlist - exact - return id
    let id = ''
    for (var i = 0; i < playLists.length; i++) {
      if (playLists[i].title === searchTitle) {
        id = playLists[i].id.replace('SQ:', '')
      }
    }
    if (id === '') { // not found
      if (!ignoreNotExists) {
        throw new Error(`${NRCSP_ERRORPREFIX} No Sonos playlist title matching msg.topic.`)
      }
    } else {
      const coordinator = new Sonos(groupData.members[0].urlHostname)
      await coordinator.deletePlaylist(id)
    }
    return {}
  }

  /**  Join a group.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number}  msg.topic SONOS player name of group to join
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * Details: if coordinator will leave old group and join new group.
   * If already in that group - it will just continue.
   * if coordinator of that group - no action and continue
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupJoin (node, msg, sonosPlayer) {
    // msg.topic is requried, string
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} player to join name (msg.topic) is invalid/missing`)
    }
    if (typeof msg.topic !== 'string' || msg.topic.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} player to join name (msg.topic) is not string`)
    }
    const toJoinPlayerName = msg.topic

    const groupDataToJoin = await getGroupMemberDataV2(sonosPlayer, toJoinPlayerName)
    const coordinatorIndex = 0

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupDataJoiner = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    if (groupDataJoiner.members[groupDataJoiner.playerIndex].sonosName !== groupDataToJoin.members[coordinatorIndex].sonosName) {
      const player = new Sonos(groupDataJoiner.members[groupDataJoiner.playerIndex].urlHostname)
      await player.setAVTransportURI({ uri: `x-rincon:${groupDataToJoin.members[coordinatorIndex].uuid}`, onlySetUri: true })
    } // else: do nothing - either playerName is already coordinator

    return {}
  }

  /**  Leave a group - means become a standalone player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * Details: if coordinator => will leave group (stop playing), another will take over coordinator role
   * if standalone - no change
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupLeave (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    await player.leaveGroup()
    return {}
  }

  /**  Get the playback state of that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { payload: state }
   * state: { STOPPED: 'stopped', PLAYING: 'playing', PAUSED_PLAYBACK: 'paused', TRANSITIONING: 'transitioning', NO_MEDIA_PRESENT: 'no_media' }
   * First is the SONOS response, that is translated by node-sonos.
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupGetPlaybackstate (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    const plabackstate = await coordinator.getCurrentState()
    return { payload: plabackstate }
  }

  /**  Get state (see return) of that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { see return }
   * state: { STOPPED: 'stopped', PLAYING: 'playing', PAUSED_PLAYBACK: 'paused', TRANSITIONING: 'transitioning', NO_MEDIA_PRESENT: 'no_media' }
   * queue mode: 'NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'
   * First is the SONOS response, that is translated by node-sonos.
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupGetState (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    const playbackstate = await coordinator.getCurrentState()
    const coordinatorIndex = 0
    const muteState = await getGroupMute(groupData.members[coordinatorIndex].baseUrl)
    const volume = await getGroupVolume(groupData.members[coordinatorIndex].baseUrl)

    // get current media data and extract queueActivated, radioId
    const mediaData = await coordinator.avTransportService().GetMediaInfo()
    if (!isTruthyAndNotEmptyString(mediaData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current media data is invalid`)
    }
    if (!isValidPropertyNotEmptyString(mediaData, ['CurrentURI'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} CurrentUri is invalid`)
    }
    const uri = mediaData.CurrentURI
    const queueActivated = uri.startsWith('x-rincon-queue')

    // queue mode
    const queueMode = await coordinator.getPlayMode()
    if (!isTruthyAndNotEmptyString(queueMode)) {
      throw new Error(`${NRCSP_ERRORPREFIX} could not get queue mode from player`)
    }

    return {
      payload: {
        playbackstate: playbackstate,
        coordinatorName: groupData.members[0].sonosName,
        volume: volume,
        muteState: muteState,
        queueActivated: queueActivated,
        queueMode: queueMode,
        members: groupData.members,
        size: groupData.members.length,
        id: groupData.groupId,
        name: groupData.groupName
      }
    }
  }

  /**  Get group volume.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @output {promise}  { payload: groupVolume}
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupGetVolume (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const volume = await getGroupVolume(groupData.members[0].baseUrl)
    return { payload: volume }
  }

  /**  Get volume of given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @output {payload: volume } range 0 .. 100
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function playerGetVolume (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    const volume = await player.getVolume()
    return { payload: volume }
  }

  /**  Get group mute.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: muteState} On/Off
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupGetMute (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const muteState = await getGroupMute(groupData.members[0].baseUrl)
    return { payload: muteState }
  }

  /**  Get mute for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: muteState} On / Off
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function playerGetMute (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    const state = await player.getMuted()
    return { payload: (state ? 'On' : 'Off') }
  }

  /**  Get group SONOS queue - the SONOS queue of the coordinator.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload = array of queue items as object
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupGetQueue (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)
    const queueItems = await getGroupQueue(coordinator)
    return { payload: queueItems }
  }

  /**  Get the role and name of a player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload to role of player as string.
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function playerGetRole (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    let role
    if (groupData.members.length === 1) {
      role = 'standalone'
    } else {
      if (groupData.playerIndex === 0) {
        role = 'coordinator'
      } else {
        role = 'joiner'
      }
    }
    return { payload: role, playerName: groupData.members[groupData.playerIndex].sonosName }
  }

  /**  Get the SONOS queue of the specified player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload = array of queue items as object
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function playerGetQueue (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const player = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    const queueItems = await getGroupQueue(player)
    return { payload: queueItems }
  }

  /**  Get group track media position info.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: unchanged, media: {object}, trackInfo: {object}, positionInfo: {object}, queueActivated: true/false
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupGetTrackPlus (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const coordinator = new Sonos(groupData.members[0].urlHostname)

    // get currentTrack data and extract artist, title. Add baseUrl to albumArtURL.
    const trackData = await coordinator.currentTrack()
    let artist = 'unknown' // as default
    let title = 'unknown' // as default
    let albumArtURL = ''
    if (!isTruthyAndNotEmptyString(trackData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current track data is invalid`)
    }
    if (!isValidPropertyNotEmptyString(trackData, ['albumArtURI'])) {
      // TuneIn does not provide AlbumArtURL -so we continue
    } else {
      node.debug('got valid albumArtURI')
      albumArtURL = sonosPlayer.baseUrl + trackData.albumArtURI
    }
    // extract artist and title if available
    if (!isValidPropertyNotEmptyString(trackData, ['artist'])) {
      // missing artist: TuneIn provides artist and title in title field
      if (!isValidPropertyNotEmptyString(trackData, ['title'])) {
        node.debug('Warning: no artist, no title', 'received-> ' + JSON.stringify(trackData))
      } else {
        if (trackData.title.indexOf(' - ') > 0) {
          node.debug('split data to artist and title')
          artist = trackData.title.split(' - ')[0]
          title = trackData.title.split(' - ')[1]
        } else {
          node.debug('Warning: invalid combination artist title receive')
          title = trackData.title
        }
      }
    } else {
      artist = trackData.artist
      if (!isValidPropertyNotEmptyString(trackData, ['title'])) {
        // title unknown - use unknown
      } else {
        node.debug('got artist and title')
        title = trackData.title
      }
    }
    node.debug('got valid song info')

    // get current media data and extract queueActivated, radioId
    const mediaData = await coordinator.avTransportService().GetMediaInfo()
    if (!isTruthyAndNotEmptyString(mediaData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current media data is invalid`)
    }
    if (!isValidPropertyNotEmptyString(mediaData, ['CurrentURI'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} CurrentUri is invalid`)
    }
    const uri = mediaData.CurrentURI
    const queueActivated = uri.startsWith('x-rincon-queue')
    let radioId = ''
    if (uri.startsWith('x-sonosapi-stream:') && uri.includes('sid=254')) {
      const end = uri.indexOf('?sid=254')
      const start = 'x-sonosapi-stream:'.length
      radioId = uri.substring(start, end)
    }

    // get current position data
    const positionData = await coordinator.avTransportService().GetPositionInfo()
    if (!isTruthyAndNotEmptyString(positionData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current position data is invalid`)
    }

    return {
      trackData: trackData,
      artist: artist,
      title: title,
      albumArtURL: albumArtURL,
      mediaData: mediaData,
      queueActivated: queueActivated,
      radioId: radioId,
      positionData: positionData
    }
  }

  /**  Lab
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload to role of player as string.
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function lab (node, msg, sonosPlayer) {
    const response = await getCmd(sonosPlayer.baseUrl, 'GetGroupVolume')
    return { payload: response }
  }

  // ========================================================================
  //
  //             HELPER
  //
  // ========================================================================

  /**  Validates group properties msg.playerName, msg.volume, msg.sameVolume, msg.flushQueue
   * @param  {object}        msg incoming message
   * @param  {string}        [msg.playerName = ''] playerName
   * @param  {string/number} [msg.volume = -1] volume
   * @param  {boolean}       [msg.sameVolume = true] sameVolume
   * @param  {boolean}       [msg.clearQueue = true] indicator for clear queue
   * @param  {string}        pkgPrefix package identifier
   *
   * @return {promise} object {playerName, volume, sameVolume, flushQueue}
   * playerName is '' if missing.
   * volume is -1 if missing. Otherwise number, integer in range 1 .. 99
   * sameVolume is true if missing.
   * clearQueue is true if missing.
   *
   * @throws error for all invalid values
   */
  async function validatedGroupProperties (msg, pkgPrefix) {
    // if missing set to ''
    let newPlayerName = '' // default
    if (isValidProperty(msg, ['playerName'])) {
      if (typeof msg.playerName !== 'string' || msg.playerName.length === 0) {
        throw new Error(`${pkgPrefix}: player name (msg.playerName) is not string/empty string`)
      }
      newPlayerName = msg.playerName
    }

    // if missing set to -1. throws error if invalid
    let newVolume = -1
    if (isValidProperty(msg, ['volume'])) {
      if (typeof msg.volume !== 'number' && typeof msg.volume !== 'string') {
        throw new Error(`${pkgPrefix}: volume (msg.volume) is not tpye string or number`)
      }
      if (typeof msg.volume === 'number') {
        if (!Number.isInteger(msg.volume)) {
          throw new Error(`${pkgPrefix}: volume (msg.volume) is not integer`)
        }
        newVolume = msg.volume
      } else {
        // it is a string
        if (!REGEX_2DIGITS.test(msg.volume)) {
          throw new Error(`${pkgPrefix}: volume (msg.volume) is not a single/double digit`)
        }
        newVolume = parseInt(msg.volume)
      }
      if (!(newVolume >= 1 && newVolume <= 99)) {
        throw new Error(`${pkgPrefix}: volume (msg.volume) is out of range 1 .. 99`)
      }
    }

    // if missing set to true - throws errors if invalid
    let newSameVolume = true
    if (isValidProperty(msg, ['sameVolume'])) {
      if (typeof msg.sameVolume !== 'boolean') {
        throw new Error(`${pkgPrefix}: sameVolume (msg.sameVolume) is not boolean`)
      }
      if (newVolume === -1 && msg.sameVolume === true) {
        throw new Error(`${pkgPrefix}: sameVolume (msg.sameVolume) is true but but msg.volume is not specified`)
      }
      newSameVolume = msg.sameVolume
    }

    // if missing set to true - throws errors if invalid
    let clearQueue = true
    if (isValidProperty(msg, ['clearQueue'])) {
      if (typeof msg.flushQueue !== 'boolean') {
        throw new Error(`${pkgPrefix}: clearQueue (msg.cleanQueue) is not boolean`)
      }
      clearQueue = msg.clearQueue
    }

    return { playerName: newPlayerName, volume: newVolume, sameVolume: newSameVolume, clearQueue: clearQueue }
  }

  RED.nodes.registerType('sonos-universal', SonosUniversalNode)
}
