const {
  REGEX_SERIAL, REGEX_IP, REGEX_TIME, REGEX_RADIO_ID,
  NRCSP_ERRORPREFIX, PLAYER_WITH_TV, REGEX_ANYCHAR, REGEX_QUEUEMODES,
  discoverSonosPlayerBySerial,
  isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString, isTruthy,
  onOff2boolean, string2ValidInteger, stringValidRegex,
  failure, success
} = require('./Helper.js')

const {
  getGroupMemberDataV2, playGroupNotification, playJoinerNotification,
  createGroupSnapshot, restoreGroupSnapshot, saveQueue, getAllSonosPlaylists, sortedGroupArray,
  getGroupVolume, getGroupMute, getPlayerQueue, setGroupVolumeRelative, getRadioId, setGroupMute, getCmd, setCmd
} = require('./Sonos-Commands.js')

const { Sonos } = require('sonos')

module.exports = function (RED) {
  'use strict'

  const COMMAND_TABLE_UNIVERSAL = {
    'group.adjust.volume': groupAdjustVolume,
    'group.clear.queue': groupClearQueue,
    'group.create.snap': groupCreateSnapshot,
    'group.get.crossfade': groupGetCrossfadeMode,
    'group.get.mutestate': groupGetMute,
    'group.get.playbackstate': groupGetPlaybackstate,
    'group.get.queue': groupGetQueue,
    'group.get.sleeptimer': groupGetSleeptimer,
    'group.get.state': groupGetState,
    'group.get.trackplus': groupGetTrackPlus,
    'group.get.volume': groupGetVolume,
    'group.next.track': groupNextTrack,
    'group.pause': groupPause,
    'group.play': groupPlay,
    'group.play.export': groupPlayExport,
    'group.play.notification': groupPlayNotification,
    'group.play.queue': groupPlayQueue,
    'group.play.snap': groupPlaySnapshot,
    'group.play.streamhttp': groupPlayStreamHttp,
    'group.play.track': groupPlayTrack,
    'group.play.tunein': groupPlayTuneIn,
    'group.previous.track': groupPreviousTrack,
    'group.remove.tracks': groupRemoveTracks,
    'group.save.queue': groupSaveQueueToSonosPlaylist,
    'group.seek': groupSeek,
    'group.set.crossfade': groupSetCrossfade,
    'group.set.mutestate': groupSetMute,
    'group.set.queuemode': groupSetQueuemode,
    'group.set.sleeptimer': groupSetSleeptimer,
    'group.stop': groupStop,
    'group.toggle.playback': groupTogglePlayback,
    'household.create.stereopair': householdCreateStereoPair,
    'household.get.groups': householdGetGroups,
    'household.remove.sonosplaylist': householdRemoveSonosPlaylist,
    'household.separate.stereopair': householdSeparateStereoPair,
    'household.test.player': householdTestPlayerOnline,
    'joiner.play.notification': joinerPlayNotification,
    'player.adjust.volume': playerAdjustVolume,
    'player.get.dialoglevel': playerGetEq,
    'player.get.led': playerGetLed,
    'player.get.loudness': playerGetLoudness,
    'player.get.mutestate': playerGetMute,
    'player.get.nightmode': playerGetEq,
    'player.get.properties': playerGetProperties,
    'player.get.queue': playerGetQueue,
    'player.get.role': playerGetRole,
    'player.get.subgain': playerGetEq,
    'player.get.volume': playerGetVolume,
    'player.join.group': playerJoinGroup,
    'player.leave.group': playerLeaveGroup,
    'player.play.avtransport': playerPlayAvtransport,
    'player.set.dialoglevel': playerSetEQ,
    'player.set.led': playerSetLed,
    'player.set.loudness': playerSetLoudness,
    'player.set.mutestate': playerSetMute,
    'player.set.nightmode': playerSetEQ,
    'player.set.subgain': playerSetEQ,
    'player.set.volume': playerSetVolume
  }

  /** Create Universal node, get valid ipaddress, store nodeDialog and subscribe to messages.
   * @param  {object} config current node configuration data
   */
  function SonosUniversalNode (config) {
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

    // node dialog overrides msg Store lowercase version in command
    let command
    if (node.nrcspCommand !== 'message') { // command specified in node dialog
      command = node.nrcspCommand
    } else {
      if (!isValidPropertyNotEmptyString(msg, cmdPath)) {
        throw new Error(`${NRCSP_ERRORPREFIX} command is undefined/invalid`)
      }
      command = String(msg[cmdPath[0]])
      command = command.toLowerCase()

      // you may omitt group. prefix - so we add it here
      const REGEX_PREFIX = /^(household|group|player|joiner)/
      if (!REGEX_PREFIX.test(command)) {
        command = `group.${command}`
      }
    }
    msg.backupCmd = command // sets msg.backupCmd - is also used in playerSetEQ

    if (!Object.prototype.hasOwnProperty.call(COMMAND_TABLE_UNIVERSAL, command)) {
      throw new Error(`${NRCSP_ERRORPREFIX} command is invalid >>${command} `)
    }
    return COMMAND_TABLE_UNIVERSAL[command](node, msg, payloadPath, sonosPlayer)
  }

  // ========================================================================
  //
  //             COMMANDS
  //
  // ========================================================================

  /**  Play already set content on given group of players.
   * @param  {object}         node only used for debug and warning
   * @param  {object}         msg incoming message
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}         [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}         [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}          payloadPath not used
   * @param  {object}         sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlay (node, msg, payloadPath, sonosPlayer) {
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
   * @param  {object}         node only used for debug and warning
   * @param  {object}         msg incoming message
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}         [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}         [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}          payloadPath not used
   * @param  {object}         sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayQueue (node, msg, payloadPath, sonosPlayer) {
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
   * @param  {object}         node only used for debug and warning
   * @param  {object}         msg incoming message
   * @param  {string/number}  msg.[payloadPath[0]] position of track in queue. 1 ... queueLenght.
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}        [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}         [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}          payloadPath default: payload - in compatibility mode: topic
   * @param  {object}         sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayTrack (node, msg, payloadPath, sonosPlayer) {
    // get the playerName
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueItems = await getPlayerQueue(sonosCoordinator)
    const lastTrackInQueue = queueItems.length
    if (lastTrackInQueue === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }
    // payload position is required
    const validatedPosition = string2ValidInteger(msg, payloadPath[0], 1, lastTrackInQueue, 'position in queue', NRCSP_ERRORPREFIX)
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
   * @param  {object}   node only used for debug and warning
   * @param  {object}   msg incoming message
   * @param  {string}   msg.export content to be played
   * @param  {string}   msg.export.uri uri to be played/queued
   * @param  {boolean}  msg.export.queue indicator: has to be queued
   * @param  {string}   [msg.export.metadata] metadata in case of queue = true
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {boolean}  [msg.clearQueue] if true and export.queue = true the queue is cleared. Default is true.
   * @param  {string}   [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}    payloadPath not used
   * @param  {object}   sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws  any functions throws error and explicit throws
   */
  async function groupPlayExport (node, msg, payloadPath, sonosPlayer) {
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
    return {}
  }

  /**  Play tuneIn station. Optional set volume, use playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] TuneIn id
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean} [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *          if msg.sameVolume === false and player == standalone because non sense.
   */
  async function groupPlayTuneIn (node, msg, payloadPath, sonosPlayer) {
    // payload radio id is required
    const validatedRadioid = stringValidRegex(msg, payloadPath[0], REGEX_RADIO_ID, 'radio id', NRCSP_ERRORPREFIX)
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.playTuneinRadio(validatedRadioid)

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
   * @param  {string}  msg.[payloadPath[0]] http uri.
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean} [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayStreamHttp (node, msg, payloadPath, sonosPlayer) {
    // payload uri is required.
    const validatedUri = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'uri', NRCSP_ERRORPREFIX)

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.setAVTransportURI(validatedUri)

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
   * @param  {string}  msg.[payloadPath[0]] notification uri.
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean} [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {string}  [msg.duration] duration of notification hh:mm:ss - default is calculation, if that fails then 00:00:05
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Hint:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this group.
   */
  async function groupPlayNotification (node, msg, payloadPath, sonosPlayer) {
    // payload uri is required.
    const validatedUri = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'uri', NRCSP_ERRORPREFIX)

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const options = { // set defaults
      uri: validatedUri,
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
   * @param  {string}  msg.[payloadPath[0]] notification uri.
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {string}  [msg.duration] duration of notification hh:mm:ss - default is calculation, if that fails then 00:00:05
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Hints:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this player and the group shound be modified
   */
  async function joinerPlayNotification (node, msg, payloadPath, sonosPlayer) {
    // payload notification uri is required.
    const validatedUri = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'uri', NRCSP_ERRORPREFIX)

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    // verify that player is joiner and not a coordinator
    if (groupData.playerIndex === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} player (msg.player/node) is not a joiner`)
    }

    // msg.sameVolume is not used (only one player!)
    const options = { // set defaults
      uri: validatedUri,
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
   * @param  {object}  msg.[payloadPath[0]] snapshot - output form groupCreateSnapshot
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Assumption: payload is valid - not checked.
   */
  async function groupPlaySnapshot (node, msg, payloadPath, sonosPlayer) {
    if (isValidProperty(msg, payloadPath)) {
      if (typeof msg[payloadPath[0]] !== 'object') {
        throw new Error(`${NRCSP_ERRORPREFIX}: snapshot (msg.${payloadPath[0]}) is not object`)
      }
    } else {
      throw new Error(`${NRCSP_ERRORPREFIX}: snapshot (msg.${payloadPath[0]}) is missing`)
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
    const snap = msg[payloadPath[0]]
    await restoreGroupSnapshot(node, membersPlayerPlus, snap)
    if (snap.wasPlaying) {
      await membersPlayerPlus[0].play() // 0 stands for coordinator
    }
    return {}
  }

  /**  Player play AVTransport uri: LineIn, TV
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] extended uri x-***:
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   */
  async function playerPlayAvtransport (node, msg, payloadPath, sonosPlayer) {
    // payload uri is required: eg x-rincon-stream:RINCON_5CAAFD00223601400 for line in
    const validatedUri = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'uri', NRCSP_ERRORPREFIX)

    // validate msg.playerName, msg.volume
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.setAVTransportURI(validatedUri)
    if (validated.volume !== -1) {
      await sonosSinglePlayer.setVolume(validated.volume)
    }
    return {}
  }

  /**  Toggle playback on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupTogglePlayback (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.togglePlayback()
    return {}
  }

  /**  Pause playing in that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPause (node, msg, payloadPath, sonosPlayer) {
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
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupStop (node, msg, payloadPath, sonosPlayer) {
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
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupNextTrack (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.next()
    return {}
  }

  /**  Play previous track on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPreviousTrack (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.previous()
    return {}
  }

  /**  Adjust group volume
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg[payloadPaht[0]] +/- 1 .. 99 integer
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupAdjustVolume (node, msg, payloadPath, sonosPlayer) {
    // payload adusted volume is required
    const adjustVolume = string2ValidInteger(msg, payloadPath[0], -99, +99, 'adjust volume', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setGroupVolumeRelative(groupData.members[0].baseUrl, adjustVolume) // 0 stands for coordinator
    return {}
  }

  /**  Adjust player volume.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string/number}  msg.[payloadPath[0]] +/- 1 .. 99 integer.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerAdjustVolume (node, msg, payloadPath, sonosPlayer) {
    // payload volume is required.
    const adjustVolume = string2ValidInteger(msg, payloadPath[0], -99, +99, 'adjust volume', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.adjustVolume(adjustVolume)
    return {}
  }

  /**  Set volume for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number/string} msg.[payloadPath[0]] volume, integer 1 .. 99 integer.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetVolume (node, msg, payloadPath, sonosPlayer) {
    // payload volume is required.
    const validatedVolume = string2ValidInteger(msg, payloadPath[0], 1, +99, 'volume', NRCSP_ERRORPREFIX)
    const validatedPlayerName = stringValidRegex(msg, 'playerName', REGEX_ANYCHAR, 'player name', NRCSP_ERRORPREFIX, '')
    const groupData = await getGroupMemberDataV2(sonosPlayer, validatedPlayerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.setVolume(validatedVolume)
    return {}
  }

  /**  Set group mute state.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] on/off.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetMute (node, msg, payloadPath, sonosPlayer) {
    // payload mute state is required.
    const newState = onOff2boolean(msg, payloadPath[0], 'mute state', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setGroupMute(groupData.members[0].baseUrl, newState) // 0 stands for coordinator
    return {}
  }

  /**  Set mute for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] on/off.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetMute (node, msg, payloadPath, sonosPlayer) {
    // payload mute state is required.
    const newState = onOff2boolean(msg, payloadPath[0], 'mute state', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.setMuted(newState)
    return {}
  }

  /**  Set group queuemode - queue must being activated and must not be empty.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] queue modes.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetQueuemode (node, msg, payloadPath, sonosPlayer) {
    // payload queuemode is required.
    const newState = stringValidRegex(msg, payloadPath[0], REGEX_QUEUEMODES, 'queue mode', NRCSP_ERRORPREFIX)

    // check queue is not empty and activated
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
    await sonosCoordinator.setPlayMode(newState)
    return {}
  }

  /**  Group seek to specific time.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] hh:mm:ss time in song.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSeek (node, msg, payloadPath, sonosPlayer) {
    // payload seek time is required.
    const validTime = stringValidRegex(msg, payloadPath[0], REGEX_TIME, 'seek time', NRCSP_ERRORPREFIX)
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[0].baseUrl, 'Seek', { Target: validTime }) // 0 stands for coordinator
    return {}
  }

  /**  Set group sleep timer.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] hh:mm:ss time in song.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetSleeptimer (node, msg, payloadPath, sonosPlayer) {
    // payload sleep time is required.
    const validTime = stringValidRegex(msg, payloadPath[0], REGEX_TIME, 'timer duration', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[0].baseUrl, 'ConfigureSleepTimer', { NewSleepTimerDuration: validTime }) // 0 stands for coordinator
    return {}
  }

  /**  Set group crossfade on/off.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] on/off.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetCrossfade (node, msg, payloadPath, sonosPlayer) {
    // payload crossfade sate is required.
    let newState = onOff2boolean(msg, payloadPath[0], 'crosssfade state', NRCSP_ERRORPREFIX)
    newState = (newState ? 1 : 0)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    await setCmd(groupData.members[0].baseUrl, 'SetCrossfadeMode', { CrossfadeMode: newState }) // 0 stands for coordinator
    return {}
  }

  /**  Set player led on/off.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] on/off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetLed (node, msg, payloadPath, sonosPlayer) {
    // msg.state is required
    let newState = onOff2boolean(msg, payloadPath[0], 'led state', NRCSP_ERRORPREFIX)
    newState = newState ? 'On' : 'Off'

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed

    await sonosSinglePlayer.setLEDState(newState)
    return {}
  }

  /**  Set player loudness on/off
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] on/off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetLoudness (node, msg, payloadPath, sonosPlayer) {
    // msg.state is required
    let newState = onOff2boolean(msg, payloadPath[0], 'loudness state', NRCSP_ERRORPREFIX)
    newState = (newState ? 1 : 0)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[groupData.playerIndex].baseUrl, 'SetLoudness', { DesiredLoudness: newState })
    return {}
  }

  /**  Set player EQ type
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.backupCmd the lowercase, player.set.nightmode/subgain/dialoglevel
   * @param  {string}  msg.[payloadPath[0]] value on,off or -15 .. 15 in case of subgain
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetEQ (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl

    // verify that player has a TV mode
    const properties = await sonosSinglePlayer.deviceDescription()
    if (!isValidPropertyNotEmptyString(properties, ['modelName'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} Sonos player model name undefined`)
    }
    if (!PLAYER_WITH_TV.includes(properties.modelName)) {
      throw new Error(`${NRCSP_ERRORPREFIX} Selected player does not support TV`)
    }

    let eqType
    let eqValue

    // we use msg.backupCmd to split

    if (msg.backupCmd === 'player.set.nightmode') {
      eqType = 'NightMode'
      eqValue = onOff2boolean(msg, payloadPath[0], 'nightmode', NRCSP_ERRORPREFIX) // required
      eqValue = (eqValue ? 1 : 0)
    } else if (msg.backupCmd === 'player.set.subgain') {
      eqType = 'SubGain'
      eqValue = string2ValidInteger(msg, payloadPath[0], -15, 15, 'subgain', NRCSP_ERRORPREFIX) // required
    } else {
      eqType = 'DialogLevel'
      eqValue = onOff2boolean(msg, payloadPath[0], 'dialoglevel', NRCSP_ERRORPREFIX) // required
      eqValue = (eqValue ? 1 : 0)
    }

    const args = { EQType: eqType, DesiredValue: eqValue }
    await setCmd(groupData.members[groupData.playerIndex].baseUrl, 'SetEQ', args)
    return {}
  }

  /**  Create a snapshot of the given group of players.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {boolean} [msg.snapVolumes = false] will capture the players volumes
   * @param  {boolean} [msg.snapMutestate = false] will capture the players mutestates
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise}  {payload: snap} snap see createGroupSnapshot
   *
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupCreateSnapshot (node, msg, payloadPath, sonosPlayer) {
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
   * @param  {string}  msg.[payloadPath[0]] title of Sonos playlist.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSaveQueueToSonosPlaylist (node, msg, payloadPath, sonosPlayer) {
    // payload title search string is required.
    const validatedTitle = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'title', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await saveQueue(groupData.members[0].baseUrl, validatedTitle) // 0 stands for coordinator
    return {}
  }

  /**  Clear queue.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupClearQueue (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.flush()
    return {}
  }

  /**  Remove a number of tracks in queue.
   * @param  {object}         node only used for debug and warning
   * @param  {object}         msg incoming message
   * @param  {string/number}  msg.[payloadPath[0]] number of track in queue. 1 ... queueLenght.
   * @param  {number/string}  msg.numberOfTracks number of track 1 ... queuelenght. If missing 1.
   * @param  {string}         [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}          payloadPath default: payload - in compatibility mode: topic
   * @param  {object}         sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupRemoveTracks (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    // get the number of tracks in queue - should be > 0
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueItems = await getPlayerQueue(sonosCoordinator)
    const lastTrackInQueue = queueItems.length
    if (lastTrackInQueue === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }

    // payload track position is required.
    const validatedPosition = string2ValidInteger(msg, payloadPath[0], 1, lastTrackInQueue, 'position in queue', NRCSP_ERRORPREFIX)
    const validatedNumberofTracks = string2ValidInteger(msg, 'numberOfTracks', 1, lastTrackInQueue, 'number of tracks', NRCSP_ERRORPREFIX, 1)
    await sonosCoordinator.removeTracksFromQueue(validatedPosition, validatedNumberofTracks)
    return {}
  }

  /**  Remove Sonos playlist with given title. (impact on My Sonos and also Sonos playlist list)
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] title of Sonos playlist.
   * @param  {boolean} [msg.ignoreNotExists] if missing assume true
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdRemoveSonosPlaylist (node, msg, payloadPath, sonosPlayer) {
    // payload title search string is required.
    const validatedTitle = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'title', NRCSP_ERRORPREFIX)

    let ignoreNotExists = true
    if (isValidProperty(msg, ['ignoreNotExists'])) {
      if (typeof msg.volume !== 'boolean') {
        throw new Error(`${NRCSP_ERRORPREFIX}: msg.ignoreNotExists is not boolean`)
      }
      ignoreNotExists = msg.ignoreNotExist
    }

    // using the default player of this node as all
    const playLists = await getAllSonosPlaylists(sonosPlayer.baseUrl)

    if (!isTruthy(playLists)) {
      throw new Error(`${NRCSP_ERRORPREFIX}: Sonos playlist list is invalid`)
    }
    // find title in playlist - exact - return id
    let id = ''
    for (var i = 0; i < playLists.length; i++) {
      if (playLists[i].title === validatedTitle) {
        id = playLists[i].id.replace('SQ:', '')
      }
    }
    if (id === '') { // not found
      if (!ignoreNotExists) {
        throw new Error(`${NRCSP_ERRORPREFIX} No Sonos playlist title matching search string.`)
      }
    } else {
      await sonosPlayer.deletePlaylist(id)
    }
    return {}
  }

  /**  Join a group.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] SONOS name of any player in the group
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * Details: if coordinator: will leave old group and join new group.
   * If already in that group - it will just continue.
   * if coordinator of that group - no action and continue
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerJoinGroup (node, msg, payloadPath, sonosPlayer) {
    // payload a playername in group is required
    const validatedGroupPlayerName = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'group player name', NRCSP_ERRORPREFIX)

    // get coordinator uri/rincon of the target group
    const groupDataToJoin = await getGroupMemberDataV2(sonosPlayer, validatedGroupPlayerName)
    const coordinatorRincon = `x-rincon:${groupDataToJoin.members[0].uuid}`

    // get the ip address of joiner
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupDataJoiner = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    if (groupDataJoiner.members[groupDataJoiner.playerIndex].sonosName !== groupDataToJoin.members[0].sonosName) {
      const sonosSinglePlayer = new Sonos(groupDataJoiner.members[groupDataJoiner.playerIndex].urlHostname)
      // baseUrl not needed
      await sonosSinglePlayer.setAVTransportURI({ uri: coordinatorRincon, onlySetUri: true })
    } // else: do nothing - either playerName is already coordinator

    return {}
  }

  /**  Leave a group - means become a standalone player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * Details: if coordinator => will leave group (stop playing), another will take over coordinator role
   * if standalone - no change
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerLeaveGroup (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.leaveGroup()
    return {}
  }

  /**  Create a stereo pair of players. Right one will be hidden! Is only support for some type of SONOS player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] - left player, will be visible
   * @param  {string}  msg.playerNameRight - right player, will become invisible
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Caution: In setCmd it should be left: playerLeftBaseUrl
   *
   */
  async function householdCreateStereoPair (node, msg, payloadPath, sonosPlayer) {
    // both player are requried
    const playerLeft = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'player name left', NRCSP_ERRORPREFIX)
    const playerRight = stringValidRegex(msg, 'playerNameRight', REGEX_ANYCHAR, 'player name right', NRCSP_ERRORPREFIX)

    // verify that playerNames are valid and get the uuid
    const allGroupsData = await sonosPlayer.getAllGroups()
    let playerRightUuid = ''
    let playerLeftUuid = ''
    let playerLeftBaseUrl
    if (!isTruthyAndNotEmptyString(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data undefined`)
    }
    if (!Array.isArray(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data is not array`)
    }
    // allGroupsData is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, baseUrl, coordinater (uuid)
    // ZoneGroupMembers is an array of all members with properties ip address and more
    let name
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
        name = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName
        if (name === playerRight) {
          playerRightUuid = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].UUID
        }
        if (name === playerLeft) {
          playerLeftUuid = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].UUID
          const playerUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
          playerLeftBaseUrl = `http://${playerUrl.host}`
        }
      }
    }
    if (playerLeftUuid === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name left was not found`)
    }
    if (playerRightUuid === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name right was not found`)
    }
    await setCmd(playerLeftBaseUrl, 'CreateStereoPair', { ChannelMapSet: `${playerLeftUuid}:LF,LF;${playerRightUuid}:RF,RF` })
    return {}
  }

  /**  Seperate a stereo pair of players. Right player will become visible again.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] - left player, will be visible
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   */
  async function householdSeparateStereoPair (node, msg, payloadPath, sonosPlayer) {
    // player left is required
    const playerLeft = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'player name left', NRCSP_ERRORPREFIX)

    // verify that playerNames are valid and get the uuid
    const allGroupsData = await sonosPlayer.getAllGroups()
    let playerLeftUuid = ''
    let playerLeftBaseUrl
    let playerRightUuid = ''
    if (!isTruthyAndNotEmptyString(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data undefined`)
    }
    if (!Array.isArray(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data is not array`)
    }
    // allGroupsData is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, baseUrl, coordinater (uuid)
    // ZoneGroupMembers is an array of all members with properties ip address and more
    let name
    let playerUuid
    let playerChannelMap
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
        name = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName
        if (name === playerLeft) {
          // Both player have same name. Get the left one
          playerUuid = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].UUID
          playerChannelMap = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ChannelMapSet
          if (playerChannelMap.startsWith(playerUuid)) {
            playerLeftUuid = playerUuid
            const playerUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
            playerLeftBaseUrl = `http://${playerUrl.host}`
            // TODO check exist ;
            playerRightUuid = playerChannelMap.split(';')[1]
            playerRightUuid = playerRightUuid.replace(':RF,RF', '')
          }
        }
      }
    }
    if (playerLeftUuid === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name left was not found`)
    }
    if (playerRightUuid === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name right was not found`)
    }
    await setCmd(playerLeftBaseUrl, 'SeparateStereoPair', { ChannelMapSet: `${playerLeftUuid}:LF,LF;${playerRightUuid}:RF,RF` })
    return {}
  }

  /**  Get household groups
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   * @param  {array}   payloadPath not used
   *
   * @return {promise} array of all group array of members :-)
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdGetGroups (node, msg, payloadPath, sonosPlayer) {
    const allGroupsData = await sonosPlayer.getAllGroups()
    const allGroupsArray = []
    let group
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      group = await sortedGroupArray(allGroupsData, groupIndex)
      allGroupsArray.push(group)
    }
    return { payload: allGroupsArray }
  }

  /**  Get state (see return) of that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { see return }
   * state: { STOPPED: 'stopped', PLAYING: 'playing', PAUSED_PLAYBACK: 'paused', TRANSITIONING: 'transitioning', NO_MEDIA_PRESENT: 'no_media' }
   * queue mode: 'NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'
   * First is the SONOS response, that is translated by node-sonos.
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetState (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const playbackstate = await sonosCoordinator.getCurrentState()
    const muteState = await getGroupMute(sonosCoordinator.baseUrl)
    const volume = await getGroupVolume(sonosCoordinator.baseUrl)

    // get current media data and extract queueActivated
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
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { payload: state, cmd: msg.payload }
   * state: { STOPPED: 'stopped', PLAYING: 'playing', PAUSED_PLAYBACK: 'paused', TRANSITIONING: 'transitioning', NO_MEDIA_PRESENT: 'no_media' }
   * First is the SONOS response, that is translated by node-sonos.
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetPlaybackstate (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    const playbackstate = await sonosCoordinator.getCurrentState()
    return { payload: playbackstate }
  }

  /**  Get group volume.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @output {promise}  { payload: groupVolume}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetVolume (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const volume = await getGroupVolume(groupData.members[0].baseUrl) // 0 stands for coordinator
    return { payload: volume }
  }

  /**  Get volume of given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @output {payload: volume } range 0 .. 100
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetVolume (node, msg, payloadPath, sonosPlayer) {
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
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: muteState} on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetMute (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const muteState = await getGroupMute(groupData.members[0].baseUrl) // 0 stands for coordinator
    return { payload: muteState.toLowerCase() }
  }

  /**  Get mute state for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: muteState} on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetMute (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    const state = await sonosSinglePlayer.getMuted()
    return { payload: (state ? 'on' : 'off') }
  }

  /**  Get group crossfade mode.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: crossfade mode} on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetCrossfadeMode (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const state = await getCmd(groupData.members[0].baseUrl, 'GetCrossfadeMode') // 0 stands for coordinator
    return { payload: (state === '1' ? 'on' : 'off') }
  }

  /**  Get group sleeptimer.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: crossfade mode} hh:mm:ss
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetSleeptimer (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sleeptimer = await getCmd(groupData.members[0].baseUrl, 'GetRemainingSleepTimerDuration') // 0 stands for coordinator
    return { payload: (sleeptimer === '' ? 'no time set' : sleeptimer) }
  }

  /**  Get the role and name of a player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload to role of player as string.
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetRole (node, msg, payloadPath, sonosPlayer) {
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
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload = array of queue items as object
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetQueue (node, msg, payloadPath, sonosPlayer) {
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
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload = array of queue items as object
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetQueue (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    const queueItems = await getPlayerQueue(sonosSinglePlayer)
    return { payload: queueItems }
  }

  /**  Get player LED state.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update payload the LED state on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetLed (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    const ledState = await sonosSinglePlayer.getLEDState()
    if (!isTruthyAndNotEmptyString(ledState)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player response is undefined`)
    }
    return { payload: ledState.toLowerCase() }
  }

  /**  Get player properties.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload the properties object
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetProperties (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    const properties = await sonosSinglePlayer.deviceDescription()
    properties.uuid = properties.UDN.substring('uuid:'.length)
    properties.playerName = properties.roomName
    if (!isTruthyAndNotEmptyString(properties)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player response is undefined`)
    }
    return { payload: properties }
  }

  /**  Get player loudness.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload the Loudness state LED state on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetLoudness (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const loudness = await getCmd(groupData.members[groupData.playerIndex].baseUrl, 'GetLoudness')
    if (!isTruthyAndNotEmptyString(loudness)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player response is undefined`)
    }
    return { payload: (loudness === '1' ? 'on' : 'off') }
  }

  /**  Get player EQ data.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload the Loudness state LED state on/off
   *
   * @throws any functions throws error and explicit throws
   *
   * EQ data are only available for specific players.
   */
  async function playerGetEq (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl

    // verify that player has a TV mode
    const properties = await sonosSinglePlayer.deviceDescription()
    if (!isValidPropertyNotEmptyString(properties, ['modelName'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} Sonos player model name undefined`)
    }
    if (!PLAYER_WITH_TV.includes(properties.modelName)) {
      throw new Error(`${NRCSP_ERRORPREFIX} Selected player does not support TV`)
    }

    let eqType
    if (msg.payload === 'player.get.nightmode') {
      eqType = 'NightMode'
    } else if (msg.payload === 'player.get.subgain') {
      eqType = 'SubGain'
    } else {
      eqType = 'DialogLevel'
    }
    let eqData = await getCmd(sonosPlayer.baseUrl, `GetEQ-${eqType}`)
    if (!isTruthyAndNotEmptyString(eqData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player response is undefined`)
    }
    if (eqType !== 'SubGain') {
      eqData = (eqData === '1' ? 'on' : 'off')
    }

    return { payload: eqData }
  }

  /**  Household test player connection
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] SONOS player name, required!!!!
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos playerault as anchor player
   *
   * @return {promise} true | false
   *
   * Caution: sonosPlayer can not be used here as default for input.
   * It should be a "always on always available" player.
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdTestPlayerOnline (node, msg, payloadPath, sonosPlayer) {
    // player name is required
    if (!isValidProperty(msg, payloadPath)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player name (msg.${payloadPath[0]}) is missing/invalid`)
    }
    const playerToBeTested = msg[payloadPath[0]]
    if (typeof playerToBeTested !== 'string' || playerToBeTested === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name (msg.${payloadPath[0]}) is not string or empty`)
    }
    const allGroupsData = await sonosPlayer.getAllGroups()
    if (!isTruthyAndNotEmptyString(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data undefined`)
    }
    if (!Array.isArray(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data is not array`)
    }

    // find our player in groups output
    // allGroupsData is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, baseUrl, coordinater (uuid)
    // ZoneGroupMembers is an array of all members with properties ip address and more
    let name
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
        name = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName
        if (name === playerToBeTested) {
          return { payload: true }
        }
      }
    }
    return { payload: false }
  }

  /**  Get group track media position info.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: media: {object}, trackInfo: {object}, positionInfo: {object}, queueActivated: true/false
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetTrackPlus (node, msg, payloadPath, sonosPlayer) {
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
    const radioId = getRadioId(uri)

    // get current position data
    const positionData = await sonosCoordinator.avTransportService().GetPositionInfo()
    if (!isTruthyAndNotEmptyString(positionData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current position data is invalid`)
    }
    return {
      payload: {
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
  }

  // ========================================================================
  //
  //             HELPER
  //
  // ========================================================================

  /**  Validates group properties msg.playerName, msg.volume, msg.sameVolume, msg.clearQueue
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
  async function validatedGroupProperties (msg, pkgPrefix, excludeVolume) {
    // if missing set to ''.
    const newPlayerName = stringValidRegex(msg, 'playerName', REGEX_ANYCHAR, 'player name', NRCSP_ERRORPREFIX, '')

    // if missing set to -1.
    const newVolume = string2ValidInteger(msg, 'volume', 1, 99, 'volume', NRCSP_ERRORPREFIX, -1)

    // if missing set to true - throws errors if invalid
    let newSameVolume = true
    if (isValidProperty(msg, ['sameVolume'])) {
      if (typeof msg.sameVolume !== 'boolean') {
        throw new Error(`${pkgPrefix}: sameVolume (msg.sameVolume) is not boolean`)
      }
      if (newVolume === -1 && msg.sameVolume === true) {
        throw new Error(`${pkgPrefix}: sameVolume (msg.sameVolume) is true but msg.volume is not specified`)
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
