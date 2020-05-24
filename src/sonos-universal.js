const {
  REGEX_SERIAL, REGEX_IP, REGEX_TIME, REGEX_RADIO_ID,
  NRCSP_ERRORPREFIX, PLAYER_WITH_TV, REGEX_ANYCHAR, REGEX_PLAYMODES: REGEX_QUEUEMODES,
  discoverSonosPlayerBySerial,
  isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString, isTruthy,
  onOff2boolean, string2ValidInteger, stringValidRegex,
  failure, success
} = require('./Helper.js')

const {
  getGroupMemberDataV2, playGroupNotification, playJoinerNotification,
  createGroupSnapshot, restoreGroupSnapshot, saveQueue, getAllSonosPlaylists, sortedGroupArray,
  getGroupVolume, getGroupMute, getPlayerQueue, setGroupVolumeRelative, setGroupMute, getCmd, setCmd
} = require('./Sonos-Commands.js')

const { Sonos } = require('sonos')

module.exports = function (RED) {
  'use strict'

  const COMMAND_TABLE_UNIVERSAL = {
    // TODO find a comman base for cmdList and COMMAND_TABLE_UNIVERSAL
    'adjust.volume': groupAdjustVolume,
    'clear.queue': groupClearQueue,
    'create.snap': groupCreateSnapshot,
    'get.crossfade': groupGetCrossfadeMode,
    'get.mutestate': groupGetMute,
    'get.playbackstate': groupGetPlaybackstate,
    'get.queue': groupGetQueue,
    'get.sleeptimer': groupGetSleeptimer,
    'get.state': groupGetState,
    'get.trackplus': groupGetTrackPlus,
    'get.volume': groupGetVolume,
    'next.track': groupNextTrack,
    // eslint-disable-next-line quote-props
    'pause': groupPause,
    // eslint-disable-next-line quote-props
    'play': groupPlay,
    'play.export': groupPlayExport,
    'play.notification': groupPlayNotification,
    'play.queue': groupPlayQueue,
    'play.snap': groupPlaySnapshot,
    'play.streamhttp': groupPlayStreamHttp,
    'play.track': groupPlayTrack,
    'play.tunein': groupPlayTuneIn,
    'previous.track': groupPreviousTrack,
    'remove.tracks': groupRemoveTracks,
    // eslint-disable-next-line quote-props
    'seek': groupSeek,
    'set.crossfade': groupSetCrossfade,
    'set.mutestate': groupSetMute,
    'set.queuemode': groupSetQueuemode,
    'set.sleeptimer': groupSetSleeptimer,
    // eslint-disable-next-line quote-props
    'stop': groupStop,
    'toggle.playback': groupTogglePlayback,
    //
    // full name
    //
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
    'player.set.volume': playerSetVolume,
    'player.test.online': playerTestOnline
  }

  /** Create Universal node, get valid ipaddress, store nodeDialog and subscribe to messages.
   * @param  {object} config current node configuration data
   */
  function SonosUniversalNode (config) {
    RED.nodes.createNode(this, config)
    const nrcspFunction = 'create and subscribe'

    // ipaddress overriding serialnum - at least one must be valid
    const node = this
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

    // handle node dialog input - ensure compatibility to older sonos-plus version
    const nodeDialogData = {
      command: config.command,
      stateProperty: 'topic',
      statePath: [],
      cmdProperty: 'payload',
      cmdPath: [],
      playerName: config.playerName
    }
    if (!config.compatibilityMode) {
      nodeDialogData.stateProperty = 'payload'
      nodeDialogData.cmdProperty = 'cmd'
    }
    nodeDialogData.statePath.push(nodeDialogData.stateProperty)
    nodeDialogData.cmdPath.push(nodeDialogData.cmdProperty)

    // clear node status
    node.status({})

    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received')
      processInputMsg(node, msg, nodeDialogData, configNode.ipaddress)
        .then((msgUpdate) => {
          Object.assign(msg, msgUpdate)
          success(node, msg, msg[nodeDialogData.cmdProperty])
        })
        .catch((error) => failure(node, msg, error, 'processing msg'))
    })
  }

  /** Validate sonos player object, command and dispatch further.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} nodeDialogData holds the data form node dialog
   * @param  {string} ipaddress IP address of sonos player
   *
   * @return {promise} Returns an object with all msg properties having to be modified
   * example: returning {} means msg is not modified
   * example: returning { payload: true} means the orignal msg.payload will be modified and set to true
   * msg.cmd is set to lowercase command!
   */
  async function processInputMsg (node, msg, nodeDialogData, ipaddress) {
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

    // node dialog overrides msg. Store lowercase version in command
    let command
    if (nodeDialogData.command !== 'message') { // command specified in node dialog
      command = nodeDialogData.command
      if (isValidPropertyNotEmptyString(msg, nodeDialogData.cmdPath)) {
        throw new Error(`${NRCSP_ERRORPREFIX} node dialog and message have command - not allowed.`)
      }
    } else {
      if (!isValidPropertyNotEmptyString(msg, nodeDialogData.cmdPath)) {
        throw new Error(`${NRCSP_ERRORPREFIX} command is undefined/invalid`)
      }
      command = String(msg[nodeDialogData.cmdProperty])
      command = command.toLowerCase()
      if (!command.test(/^(household|group|player|joiner)/)) {
        command = `group.${command}`
      }
    }
    msg.cmd = command // sets msg.cmd

    if (!Object.prototype.hasOwnProperty.call(COMMAND_TABLE_UNIVERSAL, command)) {
      throw new Error(`${NRCSP_ERRORPREFIX} command is invalid >>${command} `)
    }
    return COMMAND_TABLE_UNIVERSAL[command](node, msg, nodeDialogData, sonosPlayer)
  }

  // ========================================================================
  //
  //             COMMANDS
  //
  // ========================================================================

  /**  Play already set content on given group of players.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {object}  nodeDialogData data from node dialog
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload }
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlay (node, msg, nodeDialogData, sonosPlayer) {
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    if (nodeDialogData.playerName !== '') {
      if (validated.playerName !== '') {
        throw new Error(`${NRCSP_ERRORPREFIX} node dialog and message have both playerName - not allowed.`)
      }
      validated.playerName = nodeDialogData.playerName
    }
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
   * @return {promise} { cmd: msg.payload }
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayQueue (node, msg, msgStyle, sonosPlayer) {
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
    return { cmd: msg[msgStyle.cmdName] }
  }

  /**  Play a specific track in queue. Queue must not be empty.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string/number}  msg.topic position of track in queue. 1 ... queueLenght.
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload }
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayTrack (node, msg, nodeDialogData, sonosPlayer) {
    // get the playerName
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    if (nodeDialogData.playerName !== '') {
      if (validated.playerName !== '') {
        throw new Error(`${NRCSP_ERRORPREFIX} node dialog and message have both playerName - not allowed.`)
      }
      validated.playerName = nodeDialogData.playerName
    }
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueItems = await getPlayerQueue(sonosCoordinator)
    const lastTrackInQueue = queueItems.length
    if (lastTrackInQueue === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }
    // position (state property) is required
    const validatedPosition = string2ValidInteger(msg, nodeDialogData.stateName, 1, lastTrackInQueue, 'position in queue', NRCSP_ERRORPREFIX)
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
   * @return {promise} { cmd: msg.payload }
   *
   * @throws  any functions throws error and explicit throws
   */
  async function groupPlayExport (node, msg, msgStyle, sonosPlayer) {
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
    return { cmd: msg.payload }
  }

  /**  Play tuneIn station. Optional set volume, use playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.radioid TuneId id - if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED TuneId id
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload }
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *          if msg.sameVolume === false and player == standalone because non sense.
   */
  async function groupPlayTuneIn (node, msg, msgStyle, sonosPlayer) {
    // one of msg.radioid msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['radioid']) ? 'radioid' : 'topic')
    const validatedRadioid = stringValidRegex(msg, preferedProperty, REGEX_RADIO_ID, 'radio id', NRCSP_ERRORPREFIX)

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
    return { cmd: msg.payload }
  }

  /**  Play stream from http. Optional set volume, use playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.uri https uri. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED https uri
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload }
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayStreamHttp (node, msg, msgStyle, sonosPlayer) {
    // one of msg.uri msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['uri']) ? 'uri' : 'topic')
    const validatedUri = stringValidRegex(msg, preferedProperty, REGEX_RADIO_ID, 'uri', NRCSP_ERRORPREFIX)

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
    return { cmd: msg.payload }
  }

  /**  Play notification on a given group of players. Group topology will not being touched.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.uri notification uri. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED uri
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {string}  [msg.duration] duration of notification hh:mm:ss - default is calculation, if that fails then 00:00:05
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   *
   * Hint:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this group.
   */
  async function groupPlayNotification (node, msg, msgStyle, sonosPlayer) {
    // one of msg.uri msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['uri']) ? 'uri' : 'topic')
    const validatedUri = stringValidRegex(msg, preferedProperty, REGEX_RADIO_ID, 'uri', NRCSP_ERRORPREFIX)

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
    return { cmd: msg.payload }
  }

  /**  Play notification on a joiner (in group) specified by sonosPlayer (default) or by playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.uri notification uri. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED uri
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {string} [msg.duration] duration of notification hh:mm:ss - default is calculation, if that fails then 00:00:05
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   *
   * Hints:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this player and the group shound be modified
   */
  async function joinerPlayNotification (node, msg, msgStyle, sonosPlayer) {
    // one of msg.uri msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['uri']) ? 'uri' : 'topic')
    const validatedUri = stringValidRegex(msg, preferedProperty, REGEX_ANYCHAR, 'uri', NRCSP_ERRORPREFIX)

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
    return { cmd: msg.payload }
  }

  /**  Play a given snapshot on the given group of players.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {object}  [msg.snap] snapshot - output form groupCreateSnapshot
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   *
   * Assumption: msg.snap is valid - not checked.
   */
  async function groupPlaySnapshot (node, msg, msgStyle, sonosPlayer) {
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
    return { cmd: msg.payload }
  }

  /**  Player play AVTransport uri: LineIn, TV
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.xuri notification uri.
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   *
   */
  async function playerPlayAvtransport (node, msg, msgStyle, sonosPlayer) {
    // msg.xuri is required: eg x-rincon-stream:RINCON_5CAAFD00223601400 for line in
    const validatedUri = stringValidRegex(msg, 'xuri', REGEX_ANYCHAR, 'xuri', NRCSP_ERRORPREFIX)

    // validate msg.playerName, msg.volume
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    console.log('volume >>' + JSON.stringify(validated.volume))
    await sonosSinglePlayer.setAVTransportURI(validatedUri)
    if (validated.volume !== -1) {
      await sonosSinglePlayer.setVolume(validated.volume)
    }
    return { cmd: msg.payload }
  }

  /**  Toggle playback on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupTogglePlayback (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.togglePlayback()
    return { cmd: msg.payload }
  }

  /**  Pause playing in that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPause (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.pause()
    return { cmd: msg.payload }
  }

  /**  Stop playing in that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupStop (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    await sonosCoordinator.stop()
    return { cmd: msg.payload }
  }

  /**  Play next track on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupNextTrack (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.next()
    return { cmd: msg.payload }
  }

  /**  Play previous track on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPreviousTrack (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.previous()
    return { cmd: msg.payload }
  }

  /**  Adjust group volume
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string/number}  msg.adjustVolume +/- 1 .. 99 integer. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED+/- 1 .. 99 integer
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupAdjustVolume (node, msg, msgStyle, sonosPlayer) {
    // one of msg.volume msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['adjustVolume']) ? 'adjustVolume' : 'topic')
    const adjustVolume = string2ValidInteger(msg, preferedProperty, -99, +99, 'adjust volume', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setGroupVolumeRelative(groupData.members[0].baseUrl, adjustVolume) // 0 stands for coordinator
    return { cmd: msg.payload }
  }

  /**  Adjust player volume.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string/number}  msg.adjustVolume +/- 1 .. 99 integer. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED+/- 1 .. 99 integer
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerAdjustVolume (node, msg, msgStyle, sonosPlayer) {
    // one of msg.volume msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['adjustVolume']) ? 'adjustVolume' : 'topic')
    const adjustVolume = string2ValidInteger(msg, preferedProperty, -99, +99, 'adjust volume', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.adjustVolume(adjustVolume)
    return { cmd: msg.payload }
  }

  /**  Set volume for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number/string} msg.volume volume, integer 1 .. 99 integer. if exist overrides msg.topic
   * @param  {string} DEPRECIATED msg.topic volume, integer 1 .. 99
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetVolume (node, msg, msgStyle, sonosPlayer) {
    // one of msg.volume msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['volume']) ? 'volume' : 'topic')
    const validatedVolume = string2ValidInteger(msg, preferedProperty, 1, +99, 'volume', NRCSP_ERRORPREFIX)
    const validatedPlayerName = stringValidRegex(msg, 'playerName', REGEX_ANYCHAR, 'player name', NRCSP_ERRORPREFIX, '')
    const groupData = await getGroupMemberDataV2(sonosPlayer, validatedPlayerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.setVolume(validatedVolume)
    return { cmd: msg.payload }
  }

  /**  Set group mute.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.state on/off. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED on/off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetMute (node, msg, msgStyle, sonosPlayer) {
    // one of msg.state msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['state']) ? 'state' : 'topic')
    const newState = onOff2boolean(msg, preferedProperty, 'mute state', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setGroupMute(groupData.members[0].baseUrl, newState) // 0 stands for coordinator
    return { cmd: msg.payload }
  }

  /**  Set mute for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.state on/off. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED on/off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetMute (node, msg, msgStyle, sonosPlayer) {
    // one of msg.state msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['state']) ? 'state' : 'topic')
    const newState = onOff2boolean(msg, preferedProperty, 'mute state', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.setMuted(newState)
    return { cmd: msg.payload }
  }

  /**  Set group queuemode - queue must being activated and must not be empty.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.state queue modes. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED on/off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetQueuemode (node, msg, msgStyle, sonosPlayer) {
    // one of msg.state msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['state']) ? 'state' : 'topic')
    const newState = stringValidRegex(msg, preferedProperty, REGEX_QUEUEMODES, 'queue mode', NRCSP_ERRORPREFIX)

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
    return { cmd: msg.payload }
  }

  /**  Group seek to specific time.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.time hh:mm:ss time in song. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED hh:mm:ss time in song
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSeek (node, msg, msgStyle, sonosPlayer) {
    // one of msg.time msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['time']) ? 'time' : 'topic')
    const validTime = stringValidRegex(msg, preferedProperty, REGEX_TIME, 'seek time', NRCSP_ERRORPREFIX)
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[0].baseUrl, 'Seek', { Target: validTime }) // 0 stands for coordinator
    return { cmd: msg.payload }
  }

  /**  Set group sleep timer.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.time hh:mm:ss time in song. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED hh:mm:ss time in song
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetSleeptimer (node, msg, msgStyle, sonosPlayer) {
    // one of msg.time msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['time']) ? 'time' : 'topic')
    const validTime = stringValidRegex(msg, preferedProperty, REGEX_TIME, 'timer duration', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[0].baseUrl, 'ConfigureSleepTimer', { NewSleepTimerDuration: validTime }) // 0 stands for coordinator
    return { cmd: msg.payload }
  }

  /**  Set group crossfade on/off
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.state on/off. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED on/off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetCrossfade (node, msg, msgStyle, sonosPlayer) {
    // one of msg.state msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['state']) ? 'state' : 'topic')
    let newState = onOff2boolean(msg, preferedProperty, 'crosssfade state', NRCSP_ERRORPREFIX)
    newState = (newState ? 1 : 0)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    await setCmd(groupData.members[0].baseUrl, 'SetCrossfadeMode', { CrossfadeMode: newState }) // 0 stands for coordinator
    return { cmd: msg.payload }
  }

  /**  Set player led on/off
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.state on/off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetLed (node, msg, msgStyle, sonosPlayer) {
    // msg.state is required
    let newState = onOff2boolean(msg, 'state', 'led state', NRCSP_ERRORPREFIX)
    newState = newState ? 'On' : 'Off'

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed

    await sonosSinglePlayer.setLEDState(newState)
    return { cmd: msg.payload }
  }

  /**  Set player loudness on/off
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.state on/off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetLoudness (node, msg, msgStyle, sonosPlayer) {
    // msg.state is required
    let newState = onOff2boolean(msg, 'state', 'loudness state', NRCSP_ERRORPREFIX)
    newState = (newState ? 1 : 0)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[groupData.playerIndex].baseUrl, 'SetLoudness', { DesiredLoudness: newState })
    return { cmd: msg.payload }
  }

  /**  Set player EQ type
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.payload either player.get.nightmode/subgain/dialoglevel
   * @param  {string}  msg.state value on,off or -15 .. 15 in case of subgain
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetEQ (node, msg, msgStyle, sonosPlayer) {
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
    if (msg.payload === 'player.set.nightmode') {
      eqType = 'NightMode'
      eqValue = onOff2boolean(msg, 'state', 'nightmode', NRCSP_ERRORPREFIX) // required
      eqValue = (eqValue ? 1 : 0)
    } else if (msg.payload === 'player.set.subgain') {
      eqType = 'SubGain'
      eqValue = string2ValidInteger(msg, 'state', -15, 15, 'subgain', NRCSP_ERRORPREFIX) // required
    } else {
      eqType = 'DialogLevel'
      eqValue = onOff2boolean(msg, 'state', 'dialoglevel', NRCSP_ERRORPREFIX) // required
      eqValue = (eqValue ? 1 : 0)
    }

    const args = { EQType: eqType, DesiredValue: eqValue }
    await setCmd(groupData.members[groupData.playerIndex].baseUrl, 'SetEQ', args)
    return { cmd: msg.payload }
  }

  /**  Create a snapshot of the given group of players.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {boolean} [msg.snapVolumes = false] will capture the players volumes
   * @param  {boolean} [msg.snapMutestate = false] will capture the players mutestates
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise}  {payload: snap, cmd: msg.payload} snap see createGroupSnapshot
   *
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupCreateSnapshot (node, msg, msgStyle, sonosPlayer) {
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
   * @param  {string}  msg.title title of Sonos playlist. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED title of Sonos playlist
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSaveQueueToSonosPlaylist (node, msg, msgStyle, sonosPlayer) {
    // one of msg.title msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['title']) ? 'title' : 'topic')
    const validatedTitle = stringValidRegex(msg, preferedProperty, REGEX_ANYCHAR, 'title', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await saveQueue(groupData.members[0].baseUrl, validatedTitle) // 0 stands for coordinator
    return { cmd: msg.payload }
  }

  /**  Clear queue.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupClearQueue (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.flush()
    return { cmd: msg.payload }
  }

  /**  Remove a number of tracks in queue.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string/number}  msg.track number of track in queue. 1 ... queueLenght. for a short period msg.topic is accepted.
   * @param  {string/number}  [msg.topic] DEPRECIATED number of track in queue. 1 ... queueLenght
   * @param  {number/string}  msg.numberOfTracks number of track 1 ... queuelenght. If missing 1.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload }
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupRemoveTracks (node, msg, msgStyle, sonosPlayer) {
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

    // one of msg.track msg.topic is required. if msg.track exists it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['track']) ? 'track' : 'topic')
    const validatedPosition = string2ValidInteger(msg, preferedProperty, 1, lastTrackInQueue, 'position in queue', NRCSP_ERRORPREFIX)
    const validatedNumberofTracks = string2ValidInteger(msg, 'numberOfTracks', 1, lastTrackInQueue, 'number of tracks', NRCSP_ERRORPREFIX, 1)
    await sonosCoordinator.removeTracksFromQueue(validatedPosition, validatedNumberofTracks)
    return { cmd: msg.payload }
  }

  /**  Remove Sonos playlist with given title. (impact on My Sonos and also Sonos playlist list)
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.title title of Sonos playlist. if exist overrides msg.topic
   * @param  {string}  [msg.topic] DEPRECIATED title of Sonos playlist
   * @param  {boolean} [msg.ignoreNotExists] if missing assume true
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdRemoveSonosPlaylist (node, msg, msgStyle, sonosPlayer) {
    // one of msg.titel msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['title']) ? 'title' : 'topic')
    const validatedTitle = stringValidRegex(msg, preferedProperty, REGEX_ANYCHAR, 'title', NRCSP_ERRORPREFIX)

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
      if (playLists[i].title === validatedTitle) {
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
    return { cmd: msg.payload }
  }

  /**  Join a group.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.groupplayerName SONOS name of any player in the group
   * @param  {string}  [msg.topic] DEPRECIATED SONOS name of any player in the group
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * Details: if coordinator: will leave old group and join new group.
   * If already in that group - it will just continue.
   * if coordinator of that group - no action and continue
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerJoinGroup (node, msg, msgStyle, sonosPlayer) {
    // one of msg.groupplayerName msg.topic is required. if first one exist it overrides msg.topic
    const preferedProperty = (isValidProperty(msg, ['groupplayerName']) ? 'groupplayerName' : 'topic')
    const validatedGroupPlayerName = stringValidRegex(msg, preferedProperty, REGEX_ANYCHAR, 'group player name', NRCSP_ERRORPREFIX)

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

    return { cmd: msg.payload }
  }

  /**  Leave a group - means become a standalone player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * Details: if coordinator => will leave group (stop playing), another will take over coordinator role
   * if standalone - no change
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerLeaveGroup (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.leaveGroup()
    return { cmd: msg.payload }
  }

  /**  Create a stereo pair of players. Right one will be hidden! Is only support for some type of SONOS player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.playerNameRight - will become invisible
   * @param  {string}  msg.playerNameLeft - will be visible
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   *
   * Caution: In setCmd it should be left: playerLeftBaseUrl
   *
   */
  async function householdCreateStereoPair (node, msg, msgStyle, sonosPlayer) {
    // both player are requried
    const playerRight = stringValidRegex(msg, 'playerNameRight', REGEX_ANYCHAR, 'player name right', NRCSP_ERRORPREFIX)
    const playerLeft = stringValidRegex(msg, 'playerNameLeft', REGEX_ANYCHAR, 'player name left', NRCSP_ERRORPREFIX)

    // verify that playerNames are valid and get the uuid
    const allGroupsData = await sonosPlayer.getAllGroups()
    console.log('allGroupsData >>' + JSON.stringify(allGroupsData))
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
    return { cmd: msg.payload }
  }

  /**  Seperate a stereo pair of players. Right player will become visible again.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.playerNameLeft
   * @param  {string}  msg.playerNameRight - will become visible
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { cmd: msg.payload}
   *
   * @throws any functions throws error and explicit throws
   *
   */
  async function householdSeparateStereoPair (node, msg, msgStyle, sonosPlayer) {
    // both player are requried
    const playerLeft = stringValidRegex(msg, 'playerNameLeft', REGEX_ANYCHAR, 'player name left', NRCSP_ERRORPREFIX)

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
    return { cmd: msg.payload }
  }

  /**  Get household groups
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} array of all group array of members :-)
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdGetGroups (node, msg, msgStyle, sonosPlayer) {
    const allGroupsData = await sonosPlayer.getAllGroups()
    const allGroupsArray = []
    let group
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      group = await sortedGroupArray(allGroupsData, groupIndex)
      allGroupsArray.push(group)
    }
    return { payload: allGroupsArray, cmd: msg.payload }
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
   * @throws any functions throws error and explicit throws
   */
  async function groupGetState (node, msg, msgStyle, sonosPlayer) {
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
      },
      cmd: msg.payload
    }
  }

  /**  Get the playback state of that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { payload: state, cmd: msg.payload }
   * state: { STOPPED: 'stopped', PLAYING: 'playing', PAUSED_PLAYBACK: 'paused', TRANSITIONING: 'transitioning', NO_MEDIA_PRESENT: 'no_media' }
   * First is the SONOS response, that is translated by node-sonos.
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetPlaybackstate (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    const plabackstate = await sonosCoordinator.getCurrentState()
    return { payload: plabackstate, cmd: msg.payload }
  }
  /**  Get group volume.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @output {promise}  { payload: groupVolume}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetVolume (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const volume = await getGroupVolume(groupData.members[0].baseUrl) // 0 stands for coordinator
    return { payload: volume, cmd: msg.payload }
  }

  /**  Get volume of given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @output {payload: volume } range 0 .. 100
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetVolume (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    const volume = await sonosSinglePlayer.getVolume()
    return { payload: volume, cmd: msg.payload }
  }

  /**  Get group mute.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: muteState} on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetMute (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const muteState = await getGroupMute(groupData.members[0].baseUrl) // 0 stands for coordinator
    return { payload: muteState.toLowerCase(), cmd: msg.payload }
  }

  /**  Get mute for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: muteState} on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetMute (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    const state = await sonosSinglePlayer.getMuted()
    return { payload: (state ? 'on' : 'off'), cmd: msg.payload }
  }

  /**  Get group crossfade mode.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: crossfade mode} on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetCrossfadeMode (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const muteState = await getCmd(groupData.members[0].baseUrl, 'GetCrossfadeMode') // 0 stands for coordinator
    return { payload: (muteState === '1' ? 'on' : 'off'), cmd: msg.payload }
  }

  /**  Get group sleeptimer.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: crossfade mode} hh:mm:ss
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetSleeptimer (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sleeptimer = await getCmd(groupData.members[0].baseUrl, 'GetRemainingSleepTimerDuration') // 0 stands for coordinator
    return { payload: (sleeptimer === '' ? 'no time set' : sleeptimer), cmd: msg.payload }
  }

  /**  Get the role and name of a player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload to role of player as string.
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetRole (node, msg, msgStyle, sonosPlayer) {
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
    return { payload: role, playerName: groupData.members[groupData.playerIndex].sonosName, cmd: msg.payload }
  }

  /**  Get group SONOS queue - the SONOS queue of the coordinator.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload = array of queue items as object
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetQueue (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueItems = await getPlayerQueue(sonosCoordinator)
    return { payload: queueItems, cmd: msg.payload }
  }

  /**  Get the SONOS queue of the specified player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload = array of queue items as object
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetQueue (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    const queueItems = await getPlayerQueue(sonosSinglePlayer)
    return { payload: queueItems, cmd: msg.payload }
  }

  /**  Get player LED state.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload the LED state on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetLed (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    const ledState = await sonosSinglePlayer.getLEDState()
    if (!isTruthyAndNotEmptyString(ledState)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player response is undefined`)
    }
    return { payload: ledState.toLowerCase(), cmd: msg.payload }
  }

  /**  Get player properties.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload the properties object
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetProperties (node, msg, msgStyle, sonosPlayer) {
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
    return { payload: properties, cmd: msg.payload }
  }

  /**  Get player loudness.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload the Loudness state LED state on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetLoudness (node, msg, msgStyle, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const loudness = await getCmd(groupData.members[groupData.playerIndex].baseUrl, 'GetLoudness')
    if (!isTruthyAndNotEmptyString(loudness)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player response is undefined`)
    }
    return { payload: loudness === '1' ? 'on' : 'off', cmd: msg.payload }
  }

  /**  Get player EQ data.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload the Loudness state LED state on/off
   *
   * @throws any functions throws error and explicit throws
   *
   * EQ data are only available for specific players.
   */
  async function playerGetEq (node, msg, msgStyle, sonosPlayer) {
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

    return { payload: eqData, cmd: msg.payload }
  }

  /**  Test player connection
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.playerName SONOS player name, required!!!!
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} true | false
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerTestOnline (node, msg, msgStyle, sonosPlayer) {
    // player name is required
    if (!isValidProperty(msg, ['playerName'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} player name (msg.playerName) is missing/invalid`)
    }
    if (typeof msg.playerName !== 'string' || msg.playerName === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name (msg.playerName) is not string or empty`)
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
        if (name === msg.playerName) {
          return { payload: true, cmd: msg.payload }
        }
      }
    }
    return { payload: false, cmd: msg.payload }
  }

  /**  Get group track media position info.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: media: {object}, trackInfo: {object}, positionInfo: {object}, queueActivated: true/false
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetTrackPlus (node, msg, msgStyle, sonosPlayer) {
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
    // TODO in one of next releases only output to payload!
    return {
      trackData: trackData,
      artist: artist,
      title: title,
      albumArtURL: albumArtURL,
      mediaData: mediaData,
      queueActivated: queueActivated,
      radioId: radioId,
      positionData: positionData,
      payload: {
        trackData: trackData,
        artist: artist,
        title: title,
        albumArtURL: albumArtURL,
        mediaData: mediaData,
        queueActivated: queueActivated,
        radioId: radioId,
        positionData: positionData
      },
      cmd: msg.payload
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
