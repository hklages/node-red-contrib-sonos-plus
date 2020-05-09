const {
  REGEX_SERIAL, REGEX_IP, REGEX_TIME, REGEX_2DIGITS, REGEX_3DIGITS, REGEX_2DIGITSSIGN, REGEX_RADIO_ID,
  NRCSP_ERRORPREFIX,
  discoverSonosPlayerBySerial,
  isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString, isTruthy,
  failure, success
} = require('./Helper.js')

const {
  getGroupMemberDataV2, playGroupNotification, playJoinerNotification,
  createGroupSnapshot, restoreGroupSnapshot, saveQueue, getAllSonosPlaylists,
  getGroupVolume, getGroupMute, getPlayerQueue, setGroupVolumeRelative, setGroupMute, getCmd, setCmd
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
      case 'play.track':
        return groupPlayTrack(node, msg, sonosPlayer)
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
      case 'toggle.playback':
        return groupTogglePlayback(node, msg, sonosPlayer)
      case 'pause':
        return groupPause(node, msg, sonosPlayer)
      case 'stop':
        return groupStop(node, msg, sonosPlayer)
      case 'next.track':
        return groupNextTrack(node, msg, sonosPlayer)
      case 'previous.track':
        return groupPreviousTrack(node, msg, sonosPlayer)
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
      case 'set.queuemode':
        return groupSetQueuemode(node, msg, sonosPlayer)
      case 'seek':
        return groupSeek(node, msg, sonosPlayer)
      case 'set.sleeptimer':
        return groupSetSleeptimer(node, msg, sonosPlayer)
      case 'set.crossfade':
        return groupSetCrossfade(node, msg, sonosPlayer)
      case 'create.snap':
        return groupCreateSnapshot(node, msg, sonosPlayer)
      case 'save.queue':
        return groupSaveQueueToSonosPlaylist(node, msg, sonosPlayer)
      case 'clear.queue':
        return groupClearQueue(node, msg, sonosPlayer)
      case 'remove.tracks':
        return groupRemoveTracks(node, msg, sonosPlayer)
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
      case 'get.crossfade':
        return groupGetCrossfadeMode(node, msg, sonosPlayer)
      case 'get.sleeptimer':
        return groupGetSleeptimer(node, msg, sonosPlayer)
      case 'player.get.role':
        return playerGetRole(node, msg, sonosPlayer)
      case 'get.queue':
        return groupGetQueue(node, msg, sonosPlayer)
      case 'player.get.queue':
        return playerGetQueue(node, msg, sonosPlayer)
      case 'get.trackplus':
        return groupGetTrackPlus(node, msg, sonosPlayer)
      default:
        throw new Error(`${NRCSP_ERRORPREFIX} command (msg.payload) is invalid >>${msg.payload} `)
    }
  }

  // ========================================================================
  //
  //             COMMANDS
  //
  // ========================================================================

  /**  Play already set content on given group of players.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.play()

    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play non empty queue.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} means dont change msg
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *          if msg.sameVolume === false and player === standalone because non sense.
   *          if getPlayerQueue returns invalid response or queue is empty
   */
  async function groupPlayQueue (node, msg, sonosPlayer) {
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueData = await getPlayerQueue(sonosCoordinator)
    if (queueData.length === 0) {
      // queue is empty
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }
    await sonosCoordinator.selectQueue()

    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play a specific track in queue. Queue must not be empty.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string/number}  msg.topic number of track in queue. 1 ... queueLenght
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} means dont change msg
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *          if msg.sameVolume === false and player === standalone because non sense.
   */
  async function groupPlayTrack (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueItems = getPlayerQueue(sonosCoordinator)
    const lastTrackInQueue = queueItems.length
    if (lastTrackInQueue === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }

    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} track number (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string' && typeof msg.topic !== 'number') {
      throw new Error(`${NRCSP_ERRORPREFIX} track number (msg.topic) is not string and not number`)
    }

    let validatedPosition = 0 // first track
    if (typeof msg.topic === 'number') {
      if (!Number.isInteger(msg.topic)) {
        throw new Error(`${NRCSP_ERRORPREFIX} track number (msg.topic) is not integer`)
      }
      validatedPosition = msg.topic
    } else {
      // it is string
      if (!REGEX_3DIGITS.test(msg.topic)) {
        throw new Error(`${NRCSP_ERRORPREFIX} track number (msg.topic) is not a 1 .. 3 digits`)
      }
      validatedPosition = parseInt(msg.topic)
    }
    if (validatedPosition < 1 || validatedPosition > lastTrackInQueue) {
      throw new Error(`${NRCSP_ERRORPREFIX} track number (msg.topic) is out of range`)
    }
    await sonosCoordinator.selectQueue()
    await sonosCoordinator.selectTrack(validatedPosition)

    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play data being exported form My Sonos (uri/metadata) on a gvien group of players
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.export content to be played
   * @param  {string}  msg.export.uri uri to be played/queued
   * @param  {boolean}  msg.export.queue indicator: has to be queued
   * @param  {string}  [msg.export.metadata] metadata in case of queue = true
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {boolean}  [msg.clearQueue] if true and export.queue = true the queue is cleared. Default is true.
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

    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`
    if (msg.export.queue) {
      if (validated.clearQueue) {
        await sonosCoordinator.flush()
      }
      await sonosCoordinator.queue({ uri: msg.export.uri, metadata: msg.export.metadata })
      await sonosCoordinator.selectQueue()
    } else {
      await sonosCoordinator.setAVTransportURI(msg.export.uri)
    }
    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {} // means untouched msg
  }

  /**  Play tuneIn station. Optional set volume, use playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic TuneId id
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.playTuneinRadio(msg.topic)

    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play stream from http. Optional set volume, use playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic https uri
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.setAVTransportURI(msg.topic)

    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play notification on a given group of players. Group topology will not being touched.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic valid notification as uri
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
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
    let sonosSinglePlayer = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
      sonosSinglePlayer.baseUrl = groupData.members[index].baseUrl
      membersPlayerPlus.push(sonosSinglePlayer)
    }
    await playGroupNotification(node, membersPlayerPlus, options)
    return {}
  }

  /**  Play notification on a joiner (in group) specified by sonosPlayer (default) or by playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic valid notification as uri
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl

    const sonosJoiner = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosJoiner.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    await playJoinerNotification(node, sonosCoordinator, sonosJoiner, options)
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
    let sonosSinglePlayer = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
      sonosSinglePlayer.baseUrl = groupData.members[index].baseUrl
      membersPlayerPlus.push(sonosSinglePlayer)
    }
    await restoreGroupSnapshot(node, membersPlayerPlus, msg.snap)
    if (msg.snap.wasPlaying) {
      await membersPlayerPlus[0].play() // 0 stands for coordinator
    }
    return {}
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.togglePlayback()
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.pause()
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    await sonosCoordinator.stop()
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.next()
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.previous()
    return {} // means untouched msg
  }

  /**  Adjust group volume
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic +/- 1 .. 99 integer
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
    await setGroupVolumeRelative(groupData.members[0].baseUrl, newVolume) // 0 stands for coordinator
    return {} // means untouched msg
  }

  /**  Adjust player volume.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic +/- 1 .. 99 integer
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
    const sonosSingleplayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSingleplayer.adjustVolume(adjustVolume)
    return {} // means untouched msg
  }

  /**  Set volume for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic volume, integer 1 .. 99
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
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
    const sonosSingleplayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSingleplayer.setVolume(newVolume)
    return {} // means untouched msg
  }

  /**  Set group mute.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic On/Off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupSetMute (node, msg, sonosPlayer) {
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

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setGroupMute(groupData.members[0].baseUrl, newMuteState) // 0 stands for coordinator
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

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const singlePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await singlePlayer.setMuted(newMuteState)
    return {} // means untouched msg
  }

  /**  Set group queuemode - queue must being activated and must not be empty.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic see NORMAL REPEAT_ONE REPEAT_ALL SHUFFLE
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupSetQueuemode (node, msg, sonosPlayer) {
    const playmodes = [
      'NORMAL',
      'REPEAT_ONE',
      'REPEAT_ALL',
      'SHUFFLE',
      'SHUFFLE_NOREPEAT',
      'SHUFFLE_REPEAT_ONE'
    ]
    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} queuemode (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string') {
      throw new Error(`${NRCSP_ERRORPREFIX} queuemode (msg.topic) is not string`)
    }
    const newPlaymode = msg.topic.toUpperCase()
    if (!playmodes.includes(newPlaymode)) {
      throw new Error(`${NRCSP_ERRORPREFIX} queuemode (msg.topic) is not NORMAL REPEAT_ONE ...`)
    }

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos((groupData.members[0].urlHostname))
    sonosCoordinator.baseUrl = groupData.members[0].urlHostname
    const queueItems = await getPlayerQueue(sonosCoordinator)
    if (queueItems.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }
    const mediaData = await sonosCoordinator.avTransportService().GetMediaInfo()
    if (!isTruthyAndNotEmptyString(mediaData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current media data is invalid`)
    }
    if (!isValidPropertyNotEmptyString(mediaData, ['CurrentURI'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} CurrentUri is invalid`)
    }
    const uri = mediaData.CurrentURI
    if (!uri.startsWith('x-rincon-queue')) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is not activated`)
    }
    await sonosCoordinator.setPlayMode(newPlaymode)
    return {} // means untouched msg
  }

  /**  Group seek to specific time.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic hh:mm:ss time in song
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupSeek (node, msg, sonosPlayer) {
    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} seek (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string') {
      throw new Error(`${NRCSP_ERRORPREFIX} seek (msg.topic) is not string`)
    }
    if (!REGEX_TIME.test(msg.topic)) {
      throw new Error(`${NRCSP_ERRORPREFIX} seek (msg.topic) must have format hh:mm:ss, hh < 20`)
    }
    const newValue = msg.topic

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[0].baseUrl, 'Seek', { Target: newValue }) // 0 stands for coordinator
    return {} // means untouched msg
  }

  /**  Set group sleep timer.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic format hh:mm:ss hh < 20
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupSetSleeptimer (node, msg, sonosPlayer) {
    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} sleeptimer (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string') {
      throw new Error(`${NRCSP_ERRORPREFIX} sleeptimer (msg.topic) is not string`)
    }
    if (!REGEX_TIME.test(msg.topic)) {
      throw new Error(`${NRCSP_ERRORPREFIX} sleeptimer (msg.topic) is not hh:mm:ss`)
    }

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[0].baseUrl, 'ConfigureSleepTimer', { NewSleepTimerDuration: msg.topic }) // 0 stands for coordinator
    return {} // means untouched msg
  }

  /**  Set group crossfade On Off
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic On/Off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} msg unchanged
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupSetCrossfade (node, msg, sonosPlayer) {
    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} crossfade (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string') {
      throw new Error(`${NRCSP_ERRORPREFIX} crossfade (msg.topic) is not string`)
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      throw new Error(`${NRCSP_ERRORPREFIX} crossfade (msg.topic) is not On/Off`)
    }

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const newValue = msg.topic === 'On' ? 1 : 0
    await setCmd(groupData.members[0].baseUrl, 'SetCrossfadeMode', { CrossfadeMode: newValue }) // 0 stands for coordinator
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

    const sonosPlayermembers = []
    let sonosSinglePlayer = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
      sonosSinglePlayer.baseUrl = groupData.members[index].baseUrl
      sonosPlayermembers.push(sonosSinglePlayer)
    }
    const snap = await createGroupSnapshot(node, sonosPlayermembers, options)
    return { payload: snap }
  }

  /**  Save SONOS queue to Sonos playlist.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic title of Sonos playlist
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
    await saveQueue(groupData.members[0].baseUrl, title) // 0 stands for coordinator
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.flush()
    return {} // means untouched msg
  }

  /**  Remove a number of tracks in queue.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number/string}  msg.topic start point - track position in queue. 1 ... queueLenght
   * @param  {number/string}  msg.numberOfTracks number of track 1 ... queuelenght. If missing 1.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {} means dont change msg
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *
   */
  async function groupRemoveTracks (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueItems = getPlayerQueue(sonosCoordinator)
    const lastTrackInQueue = queueItems.length
    if (lastTrackInQueue === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }

    // msg.topic is requried
    if (!isValidProperty(msg, ['topic'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} track number (msg.topic) is invalid`)
    }
    if (typeof msg.topic !== 'string' && typeof msg.topic !== 'number') {
      throw new Error(`${NRCSP_ERRORPREFIX} track number (msg.topic) is not string and not number`)
    }

    let validatedPosition = 0 // first track
    if (typeof msg.topic === 'number') {
      if (!Number.isInteger(msg.topic)) {
        throw new Error(`${NRCSP_ERRORPREFIX} track number  (msg.topic) is not integer`)
      }
      validatedPosition = msg.topic
    } else {
      // it is string
      if (!REGEX_3DIGITS.test(msg.topic)) {
        throw new Error(`${NRCSP_ERRORPREFIX} track number (msg.topic) is not a 1 .. 3 digits`)
      }
      validatedPosition = parseInt(msg.topic)
    }
    if (validatedPosition < 1 || validatedPosition > lastTrackInQueue) {
      throw new Error(`${NRCSP_ERRORPREFIX} track number (msg.topic) is out of range`)
    }

    let validatedNumberofTracks = 1
    if (isValidProperty(msg, ['numberOfTracks'])) {
      if (typeof msg.numberOfTracks !== 'number' && typeof msg.volume !== 'string') {
        throw new Error(`${NRCSP_ERRORPREFIX}: number of tracks (msg.numberOfTracks) is not tpye string or number`)
      }
      if (typeof msg.numberOfTracks === 'number') {
        if (!Number.isInteger(msg.numberOfTracks)) {
          throw new Error(`${NRCSP_ERRORPREFIX}: number of tracks (msg.numberOfTracks) is not integer`)
        }
        validatedNumberofTracks = msg.numberOfTracks
      } else {
        // it is a string
        if (!REGEX_2DIGITS.test(msg.volume)) {
          throw new Error(`${NRCSP_ERRORPREFIX}: number of tracks (msg.numberOfTracks) is not a single/double digit`)
        }
        validatedNumberofTracks = parseInt(msg.numberOfTracks)
      }
      if (!(validatedNumberofTracks >= 1 && validatedNumberofTracks <= 99)) {
        throw new Error(`${NRCSP_ERRORPREFIX}: number of tracks (msg.numberOfTracks) is out of range 1 .. 99`)
      }
    }
    await sonosCoordinator.removeTracksFromQueue(validatedPosition, validatedNumberofTracks)
    return {}
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
    const playLists = await getAllSonosPlaylists(groupData.members[0].baseUrl)

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
      const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
      // baseUrl not needed
      await sonosCoordinator.deletePlaylist(id)
    }
    return {}
  }

  /**  Join a group.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.topic SONOS player name of group to join
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
      const sonosSingleplayer = new Sonos(groupDataJoiner.members[groupDataJoiner.playerIndex].urlHostname)
      // baseUrl not needed
      await sonosSingleplayer.setAVTransportURI({ uri: `x-rincon:${groupDataToJoin.members[coordinatorIndex].uuid}`, onlySetUri: true })
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
    const sonosSingleplayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSingleplayer.leaveGroup()
    return {}
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const playbackstate = await sonosCoordinator.getCurrentState()
    const muteState = await getGroupMute(sonosCoordinator.baseUrl)
    const volume = await getGroupVolume(sonosCoordinator.baseUrl)

    // get current media data and extract queueActivated, radioId
    const mediaData = await sonosCoordinator.avTransportService().GetMediaInfo()
    if (!isTruthyAndNotEmptyString(mediaData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current media data is invalid`)
    }
    if (!isValidPropertyNotEmptyString(mediaData, ['CurrentURI'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} CurrentUri is invalid`)
    }
    const uri = mediaData.CurrentURI
    const queueActivated = uri.startsWith('x-rincon-queue')

    // queue mode
    const queueMode = await sonosCoordinator.getPlayMode()
    if (!isTruthyAndNotEmptyString(queueMode)) {
      throw new Error(`${NRCSP_ERRORPREFIX} could not get queue mode from player`)
    }

    return {
      payload: {
        playbackstate: playbackstate,
        coordinatorName: groupData.members[0].sonosName, // 0 stands for coordinator
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    const plabackstate = await sonosCoordinator.getCurrentState()
    return { payload: plabackstate }
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
    const volume = await getGroupVolume(groupData.members[0].baseUrl) // 0 stands for coordinator
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
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    const volume = await sonosSinglePlayer.getVolume()
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
    const muteState = await getGroupMute(groupData.members[0].baseUrl) // 0 stands for coordinator
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
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    const state = await sonosSinglePlayer.getMuted()
    return { payload: (state ? 'On' : 'Off') }
  }

  /**  Get group crossfade mode.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: crossfade mode} On/Off
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupGetCrossfadeMode (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const muteState = await getCmd(groupData.members[0].baseUrl, 'GetCrossfadeMode') // 0 stands for coordinator
    return { payload: (muteState === '1' ? 'On' : 'Off') }
  }

  /**  Get group sleeptimer.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: crossfade mode} hh:mm:ss
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   */
  async function groupGetSleeptimer (node, msg, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sleeptimer = await getCmd(groupData.members[0].baseUrl, 'GetRemainingSleepTimerDuration') // 0 stands for coordinator
    return { payload: (sleeptimer === '' ? 'no time set' : sleeptimer) }
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueItems = await getPlayerQueue(sonosCoordinator)
    return { payload: queueItems }
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
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    const queueItems = await getPlayerQueue(sonosSinglePlayer)
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
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed

    // get currentTrack data and extract artist, title. Add baseUrl to albumArtURL.
    const trackData = await sonosCoordinator.currentTrack()
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
          artist = trackData.title.split(' - ')[0] // 0 stands for coordinator
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
    const mediaData = await sonosCoordinator.avTransportService().GetMediaInfo()
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
    const positionData = await sonosCoordinator.avTransportService().GetPositionInfo()
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

  // ========================================================================
  //
  //             HELPER
  //
  // ========================================================================

  /**  Validates group properties msg.playerName, msg.volume, msg.sameVolume, msg.flushQueue
   * @param  {object}        msg incoming message
   * @param  {string}        [msg.playerName = ''] playerName
   * @param  {string/number} [msg.volume = -1] volume. if not set dont touch orignal volume.
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
