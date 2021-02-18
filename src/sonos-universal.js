/**
 * All functions provided by Universal node. 
 * Universal node: all except commands related to groups and player.
 *
 * @module Universal
 *
 * @author Henning Klages
 *
 * @since 2021-02-15
 */

'use strict'

const {
  REGEX_SERIAL, REGEX_IP, REGEX_TIME, REGEX_TIME_DELTA, REGEX_RADIO_ID, REGEX_QUEUEMODES,
  PACKAGE_PREFIX, PLAYER_WITH_TV, REGEX_ANYCHAR, REGEX_HTTP, REGEX_CSV,
  TIMEOUT_DISCOVERY, TIMEOUT_HTTP_REQUEST, REQUESTED_COUNT_PLAYLISTS, REQUESTED_COUNT_QUEUE
} = require('./Globals.js')

const { discoverSonosPlayerBySerial } = require('./Discovery.js')

// TODO move to Sonos-Commands.Ts and ExtensionTs
const { getRadioId, getMusicServiceId, getMusicServiceName, executeActionV6,

} = require('./Sonos-Commands.js')

const { getGroupCurrent: xGetGroupCurrent, getGroupsAll: xGetGroupsAll,
  createGroupSnapshot: xCreateGroupSnapshot, restoreGroupSnapshot: xRestoreGroupSnapshot,
  getSonosPlaylists: xGetSonosPlaylists, playGroupNotification: xPlayGroupNotification,
  playJoinerNotification: xPlayJoinerNotification
} = require('./Sonos-CommandsTs.js')

const { getDeviceProperties: xGetDeviceProperties, isSonosPlayer: xIsSonosPlayer,
  getMutestate: xGetMutestate, getPlaybackstate: xGetPlaybackstate, getSonosQueue: xGetSonosQueue,
  getVolume: xGetVolume, setMutestate: xSetMutestate, setVolume: xSetVolume,
  setAvTransport: xSetAvTransport, play: xPlay
} = require('./Sonos-Extensions.js')

// TODO move to HelperTs
const {
  isOnOff, validToInteger, validRegex, failure, success
} = require('./Helper.js')

const {
  isTruthy: xIsTruthy, isTruthyPropertyStringNotEmpty: xIsTruthyPropertyStringNotEmpty,
  isTruthyProperty: xIsTruthyProperty
} = require('./HelperTs.js')

// TODO replace sonos by @svrooij/sonos
const { Sonos } = require('sonos')
const { SonosDevice } = require('@svrooij/sonos/lib')

const debug = require('debug')(`${PACKAGE_PREFIX}Universal`)

module.exports = function (RED) {
  
  // Function lexical order, ascending
  const COMMAND_TABLE_UNIVERSAL = {
    'coordinator.delegate': coordinatorDelegateCoordination,
    'group.adjust.volume': groupAdjustVolume,
    'group.cancel.sleeptimer': groupCancelSleeptimer,
    'group.clear.queue': groupClearQueue,
    'group.create.snap': groupCreateSnapshot,
    'group.create.volumesnap': groupCreateVolumeSnapshot,
    'group.get.actions': groupGetTransportActions,
    'group.get.crossfade': groupGetCrossfadeMode,
    'group.get.members': groupGetMembers,
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
    'group.play.streamhttp': groupPlayStreamHttpV2,
    'group.play.track': groupPlayTrack,
    'group.play.tunein': groupPlayTuneIn,
    'group.previous.track': groupPreviousTrack,
    'group.queue.uri': groupQueueUri,
    'group.queue.urispotify': groupQueueUriFromSpotify,
    'group.remove.tracks': groupRemoveTracks,
    'group.save.queue': groupSaveQueueToSonosPlaylist,
    'group.seek': groupSeek,
    'group.seek.delta': groupSeekDelta,
    'group.set.crossfade': groupSetCrossfade,
    'group.set.mutestate': groupSetMute,
    'group.set.queuemode': groupSetQueuemode,
    'group.set.sleeptimer': groupSetSleeptimer,
    'group.set.volume': groupSetVolume,
    'group.stop': groupStop,
    'group.toggle.playback': groupTogglePlayback,
    'household.create.group': householdCreateGroup,
    'household.create.stereopair': householdCreateStereoPair,
    'household.get.groups': householdGetGroups,
    'household.get.sonosplaylists': householdGetSonosPlaylists,
    'household.remove.sonosplaylist': householdRemoveSonosPlaylist,
    'household.separate.group': householdSeparateGroup,
    'household.separate.stereopair': householdSeparateStereoPair,
    'household.test.player': householdTestPlayerOnline,
    'joiner.play.notification': joinerPlayNotification,
    'player.adjust.volume': playerAdjustVolume,
    'player.become.standalone': playerBecomeStandalone,
    'player.get.bass': playerGetBass,
    'player.get.dialoglevel': playerGetEq,
    'player.get.led': playerGetLed,
    'player.get.loudness': playerGetLoudness,
    'player.get.mutestate': playerGetMute,
    'player.get.nightmode': playerGetEq,
    'player.get.properties': playerGetProperties,
    'player.get.queue': playerGetQueue,
    'player.get.role': playerGetRole,
    'player.get.subgain': playerGetEq,
    'player.get.treble': playerGetTreble,
    'player.get.volume': playerGetVolume,
    'player.join.group': playerJoinGroup,
    'player.leave.group': playerLeaveGroup,
    'player.play.avtransport': playerPlayAvtransport,
    'player.play.tv': playerPlayTv,
    'player.set.bass': playerSetBass,
    'player.set.dialoglevel': playerSetEQ,
    'player.set.led': playerSetLed,
    'player.set.loudness': playerSetLoudness,
    'player.set.mutestate': playerSetMute,
    'player.set.nightmode': playerSetEQ,
    'player.set.subgain': playerSetEQ,
    'player.set.treble': playerSetTreble,
    'player.set.volume': playerSetVolume,
    'player.execute.action': playerExecuteActionV6
  }

  /**
   * Create Universal node, store nodeDialog, valid ip address and subscribe to messages.
   * @param {object} config current node configuration data
   */
  function SonosUniversalNode (config) {
    const thisFunction = 'create and subscribe'
    RED.nodes.createNode(this, config)
    const node = this
    node.status({}) // Clear node status
    
    // Ip address overruling serialnumber - at least one must be valid
    const configNode = RED.nodes.getNode(config.confignode)
    if (xIsTruthyPropertyStringNotEmpty(configNode, ['ipaddress']) 
      && REGEX_IP.test(configNode.ipaddress)) {
      // Using config ip address to define the default SONOS player
      const port = 1400 // assuming this port
      const playerUrlObject = new URL(`http://${configNode.ipaddress}:${port}`)
      xIsSonosPlayer(playerUrlObject, TIMEOUT_HTTP_REQUEST)
        .then((isSonos) => {
          if (isSonos) {
            node.on('input', (msg) => {
              node.debug('node - msg received')
              processInputMsg(node, config, msg, playerUrlObject.hostname)
                .then((msgUpdate) => {
                  Object.assign(msg, msgUpdate) // Defines the output message
                  success(node, msg, msg.nrcspCmd)
                })
                .catch((error) => {
                  let thisFunction = 'processing input msg'
                  if (msg.nrcspCmd && typeof msg.nrcspCmd === 'string') {
                    thisFunction = msg.nrcspCmd
                  }
                  failure(node, msg, error, thisFunction)
                })
            })
            node.status({ fill: 'green', shape: 'dot', text: 'ok:ready for message' })      
          } else {
            node.status({ fill: 'red', shape: 'dot', text: 'error: given ip not reachable' })      
          }
        })
        .catch((err) => {
          debug('xIsSonos failed >>%s', JSON.stringify(err, Object.getOwnPropertyNames(err)))
          node.status({ fill: 'red', shape: 'dot', text: 'error: xIsSonos went wrong' })
        })
      
    } else if (xIsTruthyPropertyStringNotEmpty(configNode, ['serialnum'])
      && REGEX_SERIAL.test(configNode.serialnum)) {
      // start discovery
      discoverSonosPlayerBySerial(configNode.serialnum, TIMEOUT_DISCOVERY)
        .then((discoveredHost) => {
          debug('found ip address >>%s', discoveredHost)
          const validHost = discoveredHost
          node.on('input', (msg) => {
            node.debug('node - msg received')
            processInputMsg(node, config, msg, validHost)
              .then((msgUpdate) => {
                Object.assign(msg, msgUpdate) // Defines the output message
                success(node, msg, msg.nrcspCmd)
              })
              .catch((error) => {
                let thisFunction = 'processing input msg'
                if (msg.nrcspCmd && typeof msg.nrcspCmd === 'string') {
                  thisFunction = msg.nrcspCmd
                }
                failure(node, msg, error, thisFunction)
              })
          })
          node.status({ fill: 'green', shape: 'dot', text: 'ok:subscribed' })
        })
        .catch((err) => {
          // discovery failed - most likely because could not find any matching player
          debug('discovery failed >>%s', JSON.stringify(err, Object.getOwnPropertyNames(err)))
          failure(node, null, 'could not discover player by serial', thisFunction)
          return
        })
   
    } else {
      failure(node, null,
        new Error(`${PACKAGE_PREFIX} both ip address/serial number are invalid`), thisFunction)
      return
    }
  }

  /**
   * Validate sonos player object, command and dispatch further.
   * @param {object} node current node
   * @param {object} config current node configuration
   * @param {string} config.command the command from node dialog
   * @param {string} config.state the state from node dialog
   * @param {object} msg incoming message
   * @param {string} urlHost IP address of SONOS player such as 192.168.178.37
   *
   * Creates also msg.nrcspCmd because in compatibility mode all get commands 
   * overwrite msg.payload (the command).
   *
   * @returns {promise} All commands have to return a promise - object
   * example: returning {} means msg is not modified
   * example: returning { msg.payload= true } means 
   *  the original msg.payload will be modified and set to true.
   */
  async function processInputMsg (node, config, msg, urlHost) {
    
    const tsPlayer = new SonosDevice(urlHost)
    if (!xIsTruthy(tsPlayer)) {
      throw new Error(`${PACKAGE_PREFIX} tsPlayer is undefined`)
    }
    if (!(xIsTruthyPropertyStringNotEmpty(tsPlayer, ['host'])
      && xIsTruthyProperty(tsPlayer, ['port']))) {
      throw new Error(`${PACKAGE_PREFIX} tsPlayer ip address or port is missing `)
    }
    tsPlayer.urlObject = new URL(`http://${tsPlayer.host}:${tsPlayer.port}`)
    
    // Command, required: node dialog overrules msg, store lowercase version in command
    let command
    if (config.command !== 'message') { // Command specified in node dialog
      command = config.command
    } else {
      if (!xIsTruthyPropertyStringNotEmpty(msg, ['topic'])) {
        throw new Error(`${PACKAGE_PREFIX} command is undefined/invalid`)
      }
      command = String(msg.topic)
      command = command.toLowerCase()

      // You may omit group. prefix - so we add it here
      const REGEX_PREFIX = /^(household|group|player|joiner)/
      if (!REGEX_PREFIX.test(command)) {
        command = `group.${command}`
      }
    }
    msg.nrcspCmd = command // Store command as get commands will overrides msg.payload
    msg.topic = command // Sets topic - is only used in playerSetEQ, playerGetEQ

    // State: node dialog overrules msg.
    let state
    if (config.state) { // Payload specified in node dialog
      state = RED.util.evaluateNodeProperty(config.state, config.stateType, node)
      if (typeof state === 'string') {
        if (state !== '') {
          msg.payload = state
        }
      } else if (typeof state === 'number') {
        if (state !== '') {
          msg.payload = state
        }
      } else if (typeof state === 'boolean') {
        msg.topic = state
      }
    }

    if (!Object.prototype.hasOwnProperty.call(COMMAND_TABLE_UNIVERSAL,
      command)) {
      throw new Error(`${PACKAGE_PREFIX} command is invalid >>${command} `)
    }
    
    // eslint-disable-next-line max-len
    return COMMAND_TABLE_UNIVERSAL[command](node, msg, nodesonosPlayer, tsPlayer)
  }

  //
  //                                          COMMANDS
  //...............................................................................................
  
  /**
   *  Coordinator delegate coordination of group. New player must be in same group!
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload new coordinator name - must be in same group and different
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  // eslint-disable-next-line max-len
  async function coordinatorDelegateCoordination (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload new player name is required.
    const validPlayerName = validRegex(msg, 'payload', REGEX_ANYCHAR, 'player name', PACKAGE_PREFIX)
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    // Player must be coordinator to be able to delegate
    if (groupData.playerIndex !== 0) {
      throw new Error(`${PACKAGE_PREFIX} Player is not coordinator`)
    }

    // Check PlayerName is in group and not same as old coordinator
    const indexNewCoordinator = groupData.members.findIndex((p) => {
      return (p.playerName === validPlayerName)
    })
    if (indexNewCoordinator === -1) {
      throw new Error(`${PACKAGE_PREFIX} Could not find player name in current group`)
    }
    if (indexNewCoordinator === 0) {
      throw new Error(`${PACKAGE_PREFIX} New coordinator must be different from current`)
    }

    await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/MediaRenderer/AVTransport/Control', 'DelegateGroupCoordinationTo',
      { 'InstanceID': 0,
        'NewCoordinator': groupData.members[indexNewCoordinator].uuid,
        'RejoinGroup': true })

    return {}
  }

  /**
   *  Adjust group volume and outputs new volume.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {(string|number)} msg.payload -100 to + 100, integer
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {Promise<String>} Returns the new group volume after adjustment as property newVolume.
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupAdjustVolume (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload adjusted volume is required
    const adjustVolume = validToInteger(msg, 'payload', -100, +100, 'adjust volume', PACKAGE_PREFIX)
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const newVolume = await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/GroupRenderingControl/Control', 'SetRelativeGroupVolume',
      { 'InstanceID': 0, 'Adjustment': adjustVolume })

    return { newVolume } // caution newVolume property!
  }

  /**
   *  Clear queue.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupClearQueue (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname) // coordinator at 0
    tsCoordinator.urlObject = groupData.members[0].urlObject
    await tsCoordinator.AVTransportService.RemoveAllTracksFromQueue()
    
    return {}
  }

  /**
   *  Create a snapshot of the given group of players.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {boolean} [msg.snapVolumes = false] will capture the players volumes
   * @param {boolean} [msg.snapMutestates = false] will capture the players mutestates
   * @param {string} [msg.playerName=using tssPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {payload: snap} snap see xCreateGroupSnapshot
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupCreateSnapshot (node, msg, nodesonosPlayer, tsPlayer) {
    debug('entering method groupCreateSnapshot')
    // Validate msg properties
    const options = { 'snapVolumes': false, 'snapMutestates': false } // Default
    if (xIsTruthyProperty(msg, ['snapVolumes'])) {
      if (typeof msg.snapVolumes !== 'boolean') {
        throw new Error(`${PACKAGE_PREFIX}: snapVolumes (msg.snapVolumes) is not boolean`)
      }
      options.snapVolumes = msg.snapVolumes
    }
    if (xIsTruthyProperty(msg, ['snapMutestates'])) {
      if (typeof msg.snapVolumes !== 'boolean') {
        throw new Error(`${PACKAGE_PREFIX}: snapMutestates (msg.snapMutestates) is not boolean`)
      }
      options.snapMutestates = msg.snapMutestates
    }

    // Validate msg.playerName - error are thrown
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const payload = await xCreateGroupSnapshot(groupData.members, options)
    
    return { payload }
  }

  /**
   *  Group create volume snap shot (used for adjust group volume)
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  // eslint-disable-next-line max-len
  async function groupCreateVolumeSnapshot (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/GroupRenderingControl/Control', 'SnapshotGroupVolume',
      { 'InstanceID': 0 }) 

    return {}
  }

  /**
   *  Cancel group sleep timer.
   * @param {object} node not used
   * @param {object} msg incoming message.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupCancelSleeptimer (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/AVTransport/Control', 'ConfigureSleepTimer',
      { 'InstanceID': 0, 'NewSleepTimerDuration': '' })
    
    return {}
  }

  /**
   *  Get group transport actions.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {payload: transportActions}
   *
   * @throws any functions throws error and explicit throws
   */
  // eslint-disable-next-line max-len
  async function groupGetTransportActions (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const payload = await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/AVTransport/Control', 'GetCurrentTransportActions',
      { 'InstanceID': 0 })

    return { payload }
  }

  /**
   *  Get group crossfade mode.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {payload: crossfade mode} on|off
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetCrossfadeMode (node, msg, sonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const state = await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/AVTransport/Control', 'GetCrossfadeMode',
      { 'InstanceID': 0 })

    return { 'payload': (state === '1' ? 'on' : 'off') }
  }

  /**
   *  Get array of group member - this group.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {Promise<GroupMember[]>} with key payload!
   *
   * @throws {error} from methods validatedGroupProperties, getGroupsCurrent
   */
  async function groupGetMembers (node, msg, sonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)

    return { 'payload': groupData.members }
  }

  /**
   *  Get group mute.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise<string>} on|off
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetMute (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const state = await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/GroupRenderingControl/Control', 'GetGroupMute',
      { 'InstanceID': 0 })

    return { 'payload': state === '1' ? 'on' : 'off' }
  }

  /**
   *  Get the playback state of that group, the specified player belongs to.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise<string>} state
   * state: { 'stopped', 'playing', 'paused_playback', 'transitioning', 'no_media_present' }
   
   * regression: no_media instead of no_media_present, paused instead of paused_playback
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetPlaybackstate (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new Sonos(groupData.members[0].urlObject.hostname) 
    tsCoordinator.urlObject = groupData.members[0].urlObject
    const payload = xGetPlaybackstate(tsCoordinator.urlObject)

    return { payload }
  }

  /**
   *  Get group SONOS queue - the SONOS queue of the coordinator.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise<object>} object to update msg. msg.payload = array of queue items as object
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetQueue (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname) 
    tsCoordinator.urlObject = groupData.members[0].urlObject
    const payload = await xGetSonosQueue(tsCoordinator, REQUESTED_COUNT_QUEUE) 
    
    return { payload }
  }

  /**
   *  Get group sleeptimer.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {payload: crossfade mode} hh:mm:ss
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetSleeptimer (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const sleep = await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/AVTransport/Control', 'GetRemainingSleepTimerDuration',
      { 'InstanceID': 0 })

    if (!xIsTruthyProperty(sleep, ['RemainingSleepTimerDuration'])) {
      throw new Error(`${PACKAGE_PREFIX}: RemainingSleepTimerDuration is invalid`)
    }
    // eslint-disable-next-line max-len
    const payload = (sleep.RemainingSleepTimerDuration === '' ? 'none' : sleep.RemainingSleepTimerDuration) 
    
    return { payload }    
  }

  /**
   *  Get state (see return) of that group, the specified player belongs to.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject- as default
   *
   * @returns {promise} { see return }
   * state: 'stopped' | 'playing' | 'paused_playback' | 'transitioning' | 'no_media_present' }
   * queue mode: 'NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 
   *  'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetState (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
  
    const playbackstate = await xGetPlaybackstate(tsCoordinator.urlObject)

    const state = await executeActionV6(groupData.members[0].urlObject,
      '/MediaRenderer/GroupRenderingControl/Control', 'GetGroupMute',
      { 'InstanceID': 0 })
    const muteState = (state === '1' ? 'on' : 'off')
    
    const volume = await executeActionV6(groupData.members[0].urlObject,
      '/MediaRenderer/GroupRenderingControl/Control', 'GetGroupVolume',
      { 'InstanceID': 0 })
    
    // Get current media data and extract queueActivated
    const mediaData = await tsCoordinator.AVTransportService.GetMediaInfo()
    if (!xIsTruthy(mediaData)) {
      throw new Error(`${PACKAGE_PREFIX} current MediaInfo is invalid`)
    }
    let uri = '' // Set as default if not available
    if (xIsTruthyPropertyStringNotEmpty(mediaData, ['CurrentURI'])) {
      uri = mediaData.CurrentURI
    }
    const queueActivated = uri.startsWith('x-rincon-queue')
    const tvActivated = uri.startsWith('x-sonos-htastream')

    // Queue mode is in parameter PlayMode
    const transportSettings = await executeActionV6(tsCoordinator.urlObject,
      '/MediaRenderer/AVTransport/Control', 'GetTransportSettings',
      { 'InstanceID': 0 })
    if (!xIsTruthyPropertyStringNotEmpty(transportSettings, ['PlayMode'])) {
      throw new Error(`${PACKAGE_PREFIX}: PlayMode is invalid/missing/not string`)
    }
    const queueMode = transportSettings.PlayMode

    return {
      'payload': {
        playbackstate,
        'coordinatorName': groupData.members[0].playerName, // 0 stands for coordinator
        volume,
        muteState,
        tvActivated,
        queueActivated,
        queueMode,
        'members': groupData.members,
        'size': groupData.members.length,
        'id': groupData.groupId
      }
    }
  }

  /**
   *  Get group track, media and position info.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {payload: media: {object}, trackInfo: {object}, 
   *  positionInfo: {object}, queueActivated: true/false
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetTrackPlus (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject

    // Get current media data and extract queueActivated, radioId
    const mediaData = await tsCoordinator.AVTransportService.GetMediaInfo()
    if (!xIsTruthy(mediaData)) {
      throw new Error(`${PACKAGE_PREFIX} current media data is invalid`)
    }
    let uri = ''
    if (xIsTruthyPropertyStringNotEmpty(mediaData, ['CurrentURI'])) {
      uri = mediaData.CurrentURI
    }
    const queueActivated = uri.startsWith('x-rincon-queue')
    const radioId = getRadioId(uri)

    let serviceId = getMusicServiceId(uri)

    // Get station uri for all "x-sonosapi-stream"
    let stationArtUri = ''
    if (uri.startsWith('x-sonosapi-stream')) {
      stationArtUri = `${tsCoordinator.urlObject.origin}/getaa?s=1&u=${uri}`
    }

    // Get current position data
    const positionData = await tsCoordinator.AVTransportService.GetPositionInfo()
    if (!xIsTruthy(positionData)) {
      throw new Error(`${PACKAGE_PREFIX} current position data is invalid`)
    }

    if (xIsTruthyPropertyStringNotEmpty(positionData, ['TrackURI'])) {
      const trackUri = positionData.TrackURI
      if (serviceId === '') {
        serviceId = getMusicServiceId(trackUri)
      }
    }
    const serviceName = getMusicServiceName(serviceId)

    let artist = ''
    let title = ''
    if (!xIsTruthyPropertyStringNotEmpty(positionData, ['TrackMetaData', 'Artist'])) {
      // Missing artist: TuneIn provides artist and title in Title field
      if (!xIsTruthyPropertyStringNotEmpty(positionData, ['TrackMetaData', 'Title'])) {
        debug('Warning: no artist, no title %s', JSON.stringify(positionData.TrackMetaData))
      } else if (positionData.TrackMetaData.Title.indexOf(' - ') > 0) {
        debug('split data to artist and title')
        artist = positionData.TrackMetaData.Title.split(' - ')[0] 
        title = positionData.TrackMetaData.Title.split(' - ')[1]
      } else {
        debug('Warning: invalid combination artist title receive')
        title = positionData.TrackMetaData.Title
      }
    } else {
      artist = positionData.TrackMetaData.Artist
      if (!xIsTruthyPropertyStringNotEmpty(positionData, ['TrackMetaData', 'Title'])) {
        // Title unknown
      } else {
        debug('got artist and title')
        title = positionData.TrackMetaData.Title
      }
    }

    let album = ''
    if (xIsTruthyPropertyStringNotEmpty(positionData, ['TrackMetaData', 'Album'])) {
      album = positionData.TrackMetaData.Album
    }
    let artUri = ''
    if (xIsTruthyPropertyStringNotEmpty(positionData, ['TrackMetaData', 'AlbumArtUri'])) {
      artUri = positionData.TrackMetaData.AlbumArtUri
      if (typeof artUri === 'string' && artUri.startsWith('/getaa')) {
        artUri = tsCoordinator.urlObject.origin + artUri
      }
    }
    return {
      'payload': {
        artist,
        album,
        title,
        artUri,
        mediaData,
        queueActivated,
        radioId,
        serviceId,
        serviceName,
        stationArtUri,
        positionData
      }
    }
  }

  /**
   *  Get group volume.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise<string>} volume
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetVolume (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const payload = await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/GroupRenderingControl/Control', 'GetGroupVolume',
      { 'InstanceID': 0 })

    return { payload }
  }

  /**
   *  Play next track on given group of players.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupNextTrack (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.Next()
    
    return {}
  }

  /**
   *  Pause playing in that group, the specified player belongs to.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPause (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.Pause()
    
    return {}
  }

  /**
   *  Starts playing content. Content must have been set before.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {number} [msg.sameVolume=true] shall all players play at same volume level. 
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlay (node, msg, nodesonosPlayer, tsPlayer) {
    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${PACKAGE_PREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject // to be on the save side
    await tsCoordinator.Play()

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let index = 0; index < groupData.members.length; index++) {
          await xSetVolume(groupData.members[index].urlObject, validated.volume)
        }
      } else { // set only one player
        await xSetVolume(groupData.members[groupData.playerIndex].urlObject, validated.volume)
      }
    }

    return {}
  }

  /**
   *  Play data being exported form My Sonos (uri/metadata) on a given group of players
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload content to be played
   * @param {string} msg.payload.uri uri to be played/queued
   * @param {boolean} msg.payload.queue indicator: has to be queued
   * @param {string} [msg.payload..metadata] metadata in case of queue = true
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {boolean} [msg.sameVolume=true] shall all players play at same volume level.
   * @param {boolean} [msg.clearQueue=true] if true and export.queue = true the queue is cleared.
   * @param {string} [msg.playerName=using nodesonosPlayer] SONOS-Playername
   * @param {object} nodesonosPlayer player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws  any functions throws error and explicit throws
   */
  async function groupPlayExport (node, msg, nodesonosPlayer, tsPlayer) {
    // Simple validation of export and activation

    const exportData = msg.payload
    if (!xIsTruthyPropertyStringNotEmpty(exportData, ['uri'])) {
      throw new Error(`${PACKAGE_PREFIX} uri is missing`)
    }
    if (!xIsTruthyProperty(exportData, ['queue'])) {
      throw new Error(`${PACKAGE_PREFIX} queue identifier is missing`)
    }

    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${PACKAGE_PREFIX} msg.sameVolume is nonsense: player is standalone`)
    }

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject

    if (exportData.queue) {
      if (validated.clearQueue) {
        await tsCoordinator.AVTransportService.RemoveAllTracksFromQueue()
      }
      await tsCoordinator.AVTransportService.AddURIToQueue({
        InstanceID: 0,
        EnqueuedURI: exportData.uri,
        EnqueuedURIMetaData: exportData.metadata,
        DesiredFirstTrackNumberEnqueued: 0,
        EnqueueAsNext: true
      })
      await tsCoordinator.SwitchToQueue()
      
    } else {
      await tsCoordinator.AVTransportService.SetAVTransportURI({
        InstanceID: 0,
        CurrentURI: exportData.uri,
        CurrentURIMetaData: exportData.metadata
      })
    }

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let index = 0; index < groupData.members.length; index++) {
          await xSetVolume(groupData.members[index].urlObject, validated.volume)
        }
      } else { // set only one player
        await xSetVolume(groupData.members[groupData.playerIndex].urlObject, validated.volume)
      }
    }
    await tsCoordinator.Play()
    return {}
  }

  /**
   *  Play notification on a given group of players. Group topology will not being touched.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload notification uri.
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {boolean} [msg.sameVolume=true] shall all players play at same volume level. 
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {string} [msg.duration] duration of notification hh:mm:ss 
   *  - default is calculation, if that fails then 00:00:05
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Hint:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this group.
   */
  async function groupPlayNotification (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload uri is required.
    const validatedUri = validRegex(msg, 'payload', REGEX_ANYCHAR, 'uri', PACKAGE_PREFIX)

    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)

    const options = { // Set defaults
      'uri': validatedUri,
      'volume': validated.volume,
      'sameVolume': validated.sameVolume,
      'automaticDuration': true,
      'duration': '00:00:05' // In case automaticDuration does not work - 5 seconds
    }

    // Update options.duration - get info from SONOS
    if (xIsTruthyProperty(msg, ['duration'])) {
      if (typeof msg.duration !== 'string') {
        throw new Error(`${PACKAGE_PREFIX} duration (msg.duration) is not a string`)
      }
      if (!REGEX_TIME.test(msg.duration)) {
        throw new Error(`${PACKAGE_PREFIX} duration (msg.duration) is not format hh:mm:ss`)
      }
      options.duration = msg.duration
      options.automaticDuration = false
    }

    const tsPlayerArray = []
    
    for (let index = 0; index < groupData.members.length; index++) {
      const tsNewPlayer = new SonosDevice(groupData.members[index].urlObject.hostname)
      tsNewPlayer.urlObject = groupData.members[index].urlObject
      tsPlayerArray.push(tsNewPlayer)
    }
    await xPlayGroupNotification(tsPlayerArray, options)
    
    return {}
  }

  /**
   *  Play none empty queue.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {number} [msg.sameVolume=true] shall all players play at same volume level. 
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayQueue (node, msg, nodesonosPlayer, tsPlayer) {
    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${PACKAGE_PREFIX} msg.sameVolume is nonsense: player is standalone`)
    }

    const coordinatorIndex = 0
    const tsCoordinator = new SonosDevice(groupData.members[coordinatorIndex].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[coordinatorIndex].urlObject
    const queueData = await xGetSonosQueue(tsCoordinator, 10)
    if (queueData.length === 0) {
      // Queue is empty
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }

    tsCoordinator.urlObject = groupData.members[0].urlObject
    await tsCoordinator.SwitchToQueue()

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let index = 0; index < groupData.members.length; index++) {
          await xSetVolume(groupData.members[index].urlObject, validated.volume)
        }
      } else { // set only one player
        await xSetVolume(groupData.members[groupData.playerIndex].urlObject, validated.volume)
      }
    }

    return {}
  }

  /**
   *  Play a given snapshot on the given group of players.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload snapshot - output form groupCreateSnapshot
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlaySnapshot (node, msg, nodesonosPlayer, tsPlayer) {
    if (xIsTruthyProperty(msg, ['payload'])) {
      if (typeof msg.payload !== 'object') {
        throw new Error(`${PACKAGE_PREFIX}: snapshot (msg.payload) is not object`)
      }
    } else {
      throw new Error(`${PACKAGE_PREFIX}: snapshot (msg.payload) is missing`)
    }
    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)

    const snapshot = msg.payload
    // compare current group with group data from snap
    if (groupData.members.length !== snapshot.membersData.length) {
      throw new Error(`${PACKAGE_PREFIX}: snapshot/current group have different size`)
    }
    if (groupData.members[0].playerName !== snapshot.membersData[0].playerName) {
      throw new Error(`${PACKAGE_PREFIX}: snapshot/current group have different coordinator`)
    }
    // check all other member except 0 = coordinator
    let foundIndex
    for (let index = 1; index < groupData.members.length; index++) {
      foundIndex = snapshot.membersData.findIndex((item) =>
        (item.playerName === groupData.members[index].playerName))
      if (foundIndex < 0) {
        throw new Error(`${PACKAGE_PREFIX}: snapshot/current group members are different`)
      }
    }
  
    await xRestoreGroupSnapshot(snapshot)
    
    return {}
  }

  /**
   *  Plays stream using http such as http://www.fritz.de/live.m3u, https://live.radioarabella.de
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload uri start with http(s):// 
   * @param {(number|string)} [msg.volume=unchanged] new volume
   * @param {boolean} [msg.sameVolume=true] force all players to play at same volume level.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {Promise<boolean>} always true
   * 
   * @throws {error} if msg.sameValue true and standalone player
   * @throws {error} NRCSP error validatedGroupProperties, getGroupCurrent, validRegex
   * @throws {error} from node-sonos setAVTransportURI and setPlayerVolume
   */
  async function groupPlayStreamHttpV2 (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload uri is required.
    let validatedUri = validRegex(msg, 'payload', REGEX_HTTP, 'uri', PACKAGE_PREFIX)

    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${PACKAGE_PREFIX} msg.sameVolume is nonsense: player is standalone`)
    }

    validatedUri = `x-rincon-mp3radio://${validatedUri}`
    const coordinatorUrl = groupData.members[0].urlObject
    await executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
      { 'InstanceID': 0, 'CurrentURI': validatedUri, 'CurrentURIMetaData': '' })
    await executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'Play',
      { 'InstanceID': 0, 'Speed': '1' })

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let index = 0; index < groupData.members.length; index++) {
          await xSetVolume(groupData.members[index].urlObject, validated.volume)
        }
      } else { // set only one player
        await xSetVolume(groupData.members[groupData.playerIndex].urlObject, validated.volume)
      }
    }
    
    return {}
  }

  /**
   *  Play a specific track in queue. Queue must not be empty.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string/number} msg.payload position of track in queue. 1 ... queue length.
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {boolean} [msg.sameVolume=true] shall all players play at same volume level.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayTrack (node, msg, nodesonosPlayer, tsPlayer) {
    // Get the playerName
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)

    const coordinatorIndex = 0
    const tsCoordinator = new SonosDevice(groupData.members[coordinatorIndex].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[coordinatorIndex].urlObject
    const queueItems = await xGetSonosQueue(tsCoordinator, REQUESTED_COUNT_QUEUE)
    const lastTrackInQueue = queueItems.length
    if (lastTrackInQueue === 0) {
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }
    // Payload position is required
    
    const validatedPosition = validToInteger(msg, 'payload', 1, lastTrackInQueue,
      'position in queue', PACKAGE_PREFIX)
    await tsCoordinator.SwitchToQueue()
    await tsCoordinator.SeekTrack(validatedPosition)
    
    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let index = 0; index < groupData.members.length; index++) {
          await xSetVolume(groupData.members[index].urlObject, validated.volume)
        }
      } else { // set only one player
        await xSetVolume(groupData.members[groupData.playerIndex].urlObject, validated.volume)
      }
    }
    await tsCoordinator.Play()
    return {}
  }

  /**
   *  Play tuneIn station. Optional set volume, use playerName.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload TuneIn id
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {boolean} [msg.sameVolume=true] shall all players play at same volume level. 
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupCurrent
   *          if msg.sameVolume === false and player == standalone because non sense.
   */
  async function groupPlayTuneIn (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload radio id is required
    const validatedRadioId = validRegex(msg, 'payload', REGEX_RADIO_ID, 'radio id',
      PACKAGE_PREFIX)
    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${PACKAGE_PREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
    await tsCoordinator.SetAVTransportURI(`radio:${validatedRadioId}`)

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let index = 0; index < groupData.members.length; index++) {
          await xSetVolume(groupData.members[index].urlObject, validated.volume)
        }
      } else { // set only one player
        await xSetVolume(groupData.members[groupData.playerIndex].urlObject, validated.volume)
      }
    }
    
    return {}
  }

  /**
   *  Play previous track on given group of players.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPreviousTrack (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.Previous()

    return {}
  }

  /**
   *  Queue uri.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string/number}msg.payload valid uri
   * @param {string} [msg.playerName=using nodesonosPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupQueueUri (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload uri is required.
    const validatedUri = validRegex(msg, 'payload', REGEX_ANYCHAR, 'uri', PACKAGE_PREFIX)
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
    await tsCoordinator.AddUriToQueue(validatedUri)
    return {}
  }

  /**
   *  Queue spotify uri on given group queue.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string/number} msg.payload valid uri from spotify
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * Valid examples
   * spotify:track:5AdoS3gS47x40nBNlNmPQ8
   * spotify:album:1TSZDcvlPtAnekTaItI3qO
   * spotify:artistTopTracks:1dfeR4HaWDbWqFHLkxsg1d
   * spotify:user:spotify:playlist:37i9dQZEVXbMDoHDwVN2tF'
   *
   * Caution: Currently only support European region '2311' (US = 3079?)
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  // eslint-disable-next-line max-len
  async function groupQueueUriFromSpotify (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload uri is required.
    const validatedUri = validRegex(msg, 'payload', REGEX_ANYCHAR, 'spotify uri', PACKAGE_PREFIX)
    if (!(validatedUri.startsWith('spotify:track:')
      || validatedUri.startsWith('spotify:album:')
      || validatedUri.startsWith('spotify:artistTopTracks:')
      || validatedUri.startsWith('spotify:user:spotify:playlist:'))) {
      throw new Error(`${PACKAGE_PREFIX} not supported type of spotify uri`)
    }

    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
    await tsCoordinator.AddUriToQueue(validatedUri)
    return {}
  }

  /**
   *  Remove a number of tracks in queue.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string/number} msg.payload number of track in queue. 1 ... queue length.
   * @param {number/string} [msg.numberOfTracks=1] number of track 1 ... queue length.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupRemoveTracks (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)

    // Get the number of tracks in queue - should be > 0
    const coordinatorIndex = 0
    const tsCoordinator = new SonosDevice(groupData.members[coordinatorIndex].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[coordinatorIndex].urlObject
    const queueItems = await xGetSonosQueue(tsCoordinator, REQUESTED_COUNT_QUEUE)
    const lastTrackInQueue = queueItems.length
    if (lastTrackInQueue === 0) {
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }

    // Payload track position is required.
    const validatedPosition = validToInteger(msg, 'payload', 1, lastTrackInQueue,
      'position in queue', PACKAGE_PREFIX)
    const validatedNumberOfTracks = validToInteger(msg, 'numberOfTracks', 1,
      lastTrackInQueue, 'number of tracks', PACKAGE_PREFIX, 1)
    const args = {
      'InstanceID': 1,
      'StartingIndex': validatedPosition,
      'NumberOfTracks': validatedNumberOfTracks,
      'ObjectID': ''
    }
    await tsCoordinator.RemoveTrackRangeFromQueue(args)
    
    return {}
  }

  /**
   *  Save SONOS queue to Sonos playlist.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload title of Sonos playlist.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  // eslint-disable-next-line max-len
  async function groupSaveQueueToSonosPlaylist (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload title search string is required.
    const validatedTitle = validRegex(msg, 'payload', REGEX_ANYCHAR, 'title', PACKAGE_PREFIX)

    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)

    const coordinatorIndex = 0
    const tsCoordinator = new SonosDevice(groupData.members[coordinatorIndex].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[coordinatorIndex].urlObject
    const queueItems = await xGetSonosQueue(tsCoordinator, REQUESTED_COUNT_QUEUE)
    if (queueItems.length === 0) {
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }
    await executeActionV6(groupData.members[coordinatorIndex].urlObject, 
      '/MediaRenderer/AVTransport/Control', 'SaveQueue',
      { 'InstanceID': 0, 'Title': validatedTitle, 'ObjectID': '' }) 
    
    return {}
  }

  /**
   *  Group seek to specific time.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload hh:mm:ss time in song.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSeek (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload seek time is required.
    const validTime = validRegex(msg, 'payload', REGEX_TIME, 'seek time', PACKAGE_PREFIX)
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/AVTransport/Control', 'Seek',
      { 'InstanceID': 0, 'Target': validTime, 'Unit': 'REL_TIME' })
    
    return {}
  }

  /**
   *  Group seek with delta time to specific time.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload +/- hh:mm:ss time in song.
   * @param {string} [msg.playerName=using nodesonosPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSeekDelta (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload seek time is required.
    const validTime = validRegex(msg, 'payload', REGEX_TIME_DELTA, 'relative seek time',
      PACKAGE_PREFIX)
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/AVTransport/Control', 'Seek',
      { 'InstanceID': 0, 'Target': validTime, 'Unit': 'TIME_DELTA' })

    return {}
  }

  /**
   *  Set group crossfade on|off.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off.
   * @param {string} [msg.playerName=using nodesonosPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetCrossfade (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload crossfade sate is required.
    const newState = isOnOff(msg, 'payload', 'crosssfade state', PACKAGE_PREFIX)
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/AVTransport/Control', 'SetCrossfadeMode',
      { 'InstanceID': 0, 'CrossfadeMode': newState })

    return {}
  }

  /**
   *  Set group mute state.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetMute (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload mute state is required.
    const newState = isOnOff(msg, 'payload', 'mute state', PACKAGE_PREFIX)
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[0].urlObject, // coordinator at 0
      '/MediaRenderer/GroupRenderingControl/Control', 'SetGroupMute',
      { 'InstanceID': 0, 'DesiredMute': newState })

    return {}
  }

  /**
   *  Set group queuemode - queue must being activated and must not be empty.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload queue modes - may be mixed case
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetQueuemode (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload queuemode is required.
    const newState = validRegex(msg, 'payload', REGEX_QUEUEMODES, 'queue mode', PACKAGE_PREFIX)

    // Check queue is not empty and activated
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)

    const coordinatorIndex = 0
    const tsCoordinator = new SonosDevice(groupData.members[coordinatorIndex].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[coordinatorIndex].urlObject
    const queueItems = await xGetSonosQueue(tsCoordinator, REQUESTED_COUNT_QUEUE)
    if (queueItems.length === 0) {
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }
    const mediaData = await tsCoordinator.AVTransportService.GetMediaInfo()
    if (!xIsTruthy(mediaData)) {
      throw new Error(`${PACKAGE_PREFIX} current media data is invalid`)
    }
    if (!xIsTruthyPropertyStringNotEmpty(mediaData, ['CurrentURI'])) {
      throw new Error(`${PACKAGE_PREFIX} CurrentUri is invalid`)
    }
    const uri = mediaData.CurrentURI
    if (!uri.startsWith('x-rincon-queue')) {
      throw new Error(`${PACKAGE_PREFIX} queue is not activated`)
    }

    // SONOS only accepts uppercase!
    await executeActionV6(groupData.members[0].urlObject,  // coordinator is at 0
      '/MediaRenderer/AVTransport/Control', 'SetPlayMode',
      { 'InstanceID': 0, 'NewPlayMode': newState.toUpperCase() })

    return {}
  }

  /**
   *  Set group sleep timer.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload hh:mm:ss time in song.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetSleeptimer (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload sleep time is required.
    const validTime = validRegex(msg, 'payload', REGEX_TIME, 'timer duration',
      PACKAGE_PREFIX)

    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[0].urlObject,  // coordinator is at 0
      '/MediaRenderer/AVTransport/Control', 'ConfigureSleepTimer',
      { 'InstanceID': 0, 'NewSleepTimerDuration': validTime })

    return {}
  }

  /**
   *  Group set volume.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string/number} msg.payload new volume
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error
   */
  async function groupSetVolume (node, msg, nodesonosPlayer, tsPlayer) {
    const newVolume = validToInteger(msg, 'payload', -100, +100, 'new volume', PACKAGE_PREFIX)
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[0].urlObject,  // coordinator is at 0
      '/MediaRenderer/GroupRenderingControl/Control', 'SetGroupVolume',
      { 'InstanceID': 0, 'DesiredVolume': newVolume })

    return {}
  }

  /**
   *  Stop playing in that group, the specified player belongs to.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupStop (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
    await tsCoordinator.Stop()
    
    return {}
  }

  /**
   *  Toggle playback on given group of players.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using nodesonosPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupTogglePlayback (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
    await tsCoordinator.TogglePlayback()

    return {}
  }

  /**
   *  Create a new group in household.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload csv list of playerNames, first will become coordinator
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} array of all group array of members :-)
   *
   * @throws any functions throws error and explicit throws
   */

  // Algorithm: If the new coordinator is already the coordinator in a existing group, 
  // then just take that group and remove (first)/ add (second) the needed players.
  // else make the new coordinator stand alone and add all needed players.
  
  async function householdCreateGroup (node, msg, nodesonosPlayer, tsPlayer) {
    const validatedPlayerList = validRegex(msg, 'payload', REGEX_CSV,
      'player list', PACKAGE_PREFIX)
    const newGroupPlayerArray = validatedPlayerList.split(',')

    // Verify all are unique
    const uniqueArray = newGroupPlayerArray.filter((x, i, a) => a.indexOf(x) === i)
    if (uniqueArray.length < newGroupPlayerArray.length) {
      throw new Error(`${PACKAGE_PREFIX} List includes a player multiple times`)
    }

    // Get groups with members and convert multi dimensional array to simple array 
    // where objects have new property groupIndex, memberIndex
    const allGroupsData = await xGetGroupsAll(tsPlayer)
    if (!xIsTruthy(allGroupsData)) {
      throw new Error(`${PACKAGE_PREFIX} all groups data undefined`)
    }
    let player
    let visible
    const householdPlayerList = []
    for (let iGroup = 0; iGroup < allGroupsData.length; iGroup++) {
      for (let iMember = 0; iMember < allGroupsData[iGroup].length; iMember++) {
        visible = !allGroupsData[iGroup][iMember].invisible
        if (visible) {
          player = {
            playerName: allGroupsData[iGroup][iMember].playerName,
            urlObject: allGroupsData[iGroup][iMember].urlObject,
            uuid: allGroupsData[iGroup][iMember].uuid,
            isCoordinator: (iMember === 0),
            groupIndex: iGroup
          }
          householdPlayerList.push(player)
        }
      }
    }

    // Validate all player names in newGroupPlayerArray and get index of new coordinator
    let indexInList
    let iNewCoordinator
    for (let i = 0; i < newGroupPlayerArray.length; i++) {
      indexInList = householdPlayerList.findIndex((p) => p.playerName === newGroupPlayerArray[i])

      if (indexInList === -1) {
        throw new Error(`${PACKAGE_PREFIX} Could not find player: ${newGroupPlayerArray[i]}`)
      }
      if (i === 0) {
        iNewCoordinator = indexInList
      }
    }
    const coordinatorRincon = `x-rincon:${householdPlayerList[iNewCoordinator].uuid}`

    // Is new coordinator already the coordinator in its group? Then use this group and adjust
    if (householdPlayerList[iNewCoordinator].isCoordinator) { // Means is a coordinator
      // Modify this group (remove those not needed and add some)
      let found
      for (let i = 0; i < householdPlayerList.length; i++) {
        // Should this player be in group?
        found = newGroupPlayerArray.indexOf(householdPlayerList[i].playerName)
        if (found === -1) {
          // Remove if in new coordinator group
          if (
            householdPlayerList[i].groupIndex === householdPlayerList[iNewCoordinator].groupIndex) {
            // Leave group, no check - always returns true
            await executeActionV6(householdPlayerList[i].urlObject,
              '/MediaRenderer/AVTransport/Control', 'BecomeCoordinatorOfStandaloneGroup',
              { 'InstanceID': 0 })
          }
        } else if (
          householdPlayerList[i].groupIndex !== householdPlayerList[iNewCoordinator].groupIndex) {
          // No check - always returns true. Using SetAVTransportURI as AddMember does not work
          await executeActionV6(householdPlayerList[i].urlObject,
            '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
            { 'InstanceID': 0, 'CurrentURI': coordinatorRincon, 'CurrentURIMetaData': '' })
        }
      }
    } else {
      await executeActionV6(householdPlayerList[iNewCoordinator].urlObject,
        '/MediaRenderer/AVTransport/Control', 'BecomeCoordinatorOfStandaloneGroup',
        { 'InstanceID': 0 })
      
      // Because it takes time to BecomeCoordinator
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](500) 
      let indexPlayer

      for (let i = 1; i < newGroupPlayerArray.length; i++) { // Start with 1
        indexPlayer = householdPlayerList.findIndex((p) => p.playerName === newGroupPlayerArray[i])
        // No check - always returns true. Using SetAVTransportURI as AddMember does not work
        await executeActionV6(householdPlayerList[indexPlayer].urlObject,
          '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
          { 'InstanceID': 0, 'CurrentURI': coordinatorRincon, 'CurrentURIMetaData': '' })
      }
    }

    return {}
  }

  /**
   *  Create a stereo pair of players. Right one will be hidden! 
   * Is only supported for some type of SONOS player.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload - left player, will keep visible
   * @param {string} msg.playerNameRight - right player, will become invisible
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Caution: In executeAction it should be left: playerLeftBaseUrl
   *
   */
  // eslint-disable-next-line max-len
  async function householdCreateStereoPair (node, msg, nodesonosPlayer, tsPlayer) {
    // Both player are required
    const playerLeft = validRegex(msg, 'payload', REGEX_ANYCHAR, 'player name left',
      PACKAGE_PREFIX)
    const playerRight = validRegex(msg, 'playerNameRight', REGEX_ANYCHAR, 'player name right',
      PACKAGE_PREFIX)

    // Verify that playerNames are valid and get the uuid
    const allGroupsData = await xGetGroupsAll(tsPlayer)
    if (!xIsTruthy(allGroupsData)) {
      throw new Error(`${PACKAGE_PREFIX} all groups data undefined`)
    }
    let playerLeftUuid = ''
    let playerRightUuid = ''
    let name
    let playerLeftUrl // type JavaScript URL
    for (let iGroup = 0; iGroup < allGroupsData.length; iGroup++) {
      for (let iMember = 0; iMember < allGroupsData[iGroup].length; iMember++) {
        name = allGroupsData[iGroup][iMember].playerName
        if (name === playerRight) {
          playerRightUuid = allGroupsData[iGroup][iMember].uuid
        }
        if (name === playerLeft) {
          playerLeftUuid = allGroupsData[iGroup][iMember].uuid
          playerLeftUrl = allGroupsData[iGroup][iMember].urlObject
        }
      }
    }
    if (playerLeftUuid === '') {
      throw new Error(`${PACKAGE_PREFIX} player name left was not found`)
    }
    if (playerRightUuid === '') {
      throw new Error(`${PACKAGE_PREFIX} player name right was not found`)
    }

    // No check - always returns true
    await executeActionV6(playerLeftUrl,
      '/DeviceProperties/Control', 'CreateStereoPair',
      { 'ChannelMapSet': `${playerLeftUuid}:LF,LF;${playerRightUuid}:RF,RF` })

    return {}
  }

  /**
   *  Get household groups. Ignore hidden player.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise<Array<Array>>} array of all group array of members
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdGetGroups (node, msg, nodesonosPlayer, tsPlayer) {
    const payload = await xGetGroupsAll(tsPlayer)

    return { payload }
  }

  /**
   *  Get SONOS playlists (limited 200, ObjectID SQ)
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {object} tsPlayer sonos-ts player
   *
   * @returns {promise<Array>} All sonos playlists as array of objects
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdGetSonosPlaylists (node, msg, nodesonosPlayer, tsPlayer) {
    const payload = await xGetSonosPlaylists(tsPlayer, REQUESTED_COUNT_PLAYLISTS)

    return { payload }
  }

  /**
   *  Remove Sonos playlist with given title. (impact on My Sonos and also Sonos playlist list)
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload title of Sonos playlist.
   * @param {boolean} [msg.ignoreNotExists] if missing assume true
   * @param {object} tsPlayer sonos-ts player
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdRemoveSonosPlaylist (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload title search string is required.
    const validatedTitle = validRegex(msg, 'payload', REGEX_ANYCHAR, 'title',
      PACKAGE_PREFIX)

    let ignoreNotExists = true
    if (xIsTruthyProperty(msg, ['ignoreNotExists'])) {
      if (typeof msg.ignoreNotExists !== 'boolean') {
        throw new Error(`${PACKAGE_PREFIX}: msg.ignoreNotExists is not boolean`)
      }
      ignoreNotExists = msg.ignoreNotExist
    }

    // Using the default player of this node
    const sonosPlaylists = await xGetSonosPlaylists(tsPlayer)
    // Find title in playlist - exact - return id
    let id = ''
    for (let i = 0; i < sonosPlaylists.length; i++) {
      if (sonosPlaylists[i].title === validatedTitle) {
        id = sonosPlaylists[i].id
      }
    }
    if (id === '') { // Not found
      if (!ignoreNotExists) {
        throw new Error(`${PACKAGE_PREFIX} No Sonos playlist title matching search string.`)
      }
    } else {
      await tsPlayer.ContentDirectoryService.DestroyObject({ 'ObjectID': id })
    }

    return {}
  }

  /**
   *  Separate group in household.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdSeparateGroup (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    for (let i = 1; i < groupData.members.length; i++) { // Start with 1 - coordinator is last
      groupData.members[i]
      // No check - always returns true
      await executeActionV6(groupData.members[i].urlObject,
        '/MediaRenderer/AVTransport/Control', 'BecomeCoordinatorOfStandaloneGroup',
        { 'InstanceID': 0 })
    }

    return {}
  }

  /**
   *  Separate a stereo pair of players. Right player will become visible again.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload - left SONOS-Playername, is visible
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   */
  // eslint-disable-next-line max-len
  async function householdSeparateStereoPair (node, msg, nodesonosPlayer, tsPlayer) {
    // Player left is required
    const playerLeft = validRegex(msg, 'payload', REGEX_ANYCHAR, 'player name left',
      PACKAGE_PREFIX)

    // Verify that playerNames are valid and get the uuid
    const allGroupsData = await xGetGroupsAll(tsPlayer)
    if (!xIsTruthy(allGroupsData)) {
      throw new Error(`${PACKAGE_PREFIX} all groups data undefined`)
    }

    let playerLeftUuid = ''
    let playerRightUuid = ''
    let playerChannelMap
    let playerUuid
    let name
    let playerLeftUrl // type JavaScript URL
    for (let iGroup = 0; iGroup < allGroupsData.length; iGroup++) {
      for (let iMember = 0; iMember < allGroupsData[iGroup].length; iMember++) {
        name = allGroupsData[iGroup][iMember].playerName
        if (name === playerLeft) {
          // Both player have same name. Get the left one
          playerUuid = allGroupsData[iGroup][iMember].uuid
          // such as RINCON_000E58FE3AEA01400:LF,LF;RINCON_B8E9375831C001400:RF,RF
          playerChannelMap = allGroupsData[iGroup][iMember].channelMapSet
          if (playerChannelMap.startsWith(playerUuid)) {
            playerLeftUuid = playerUuid
            playerLeftUrl = allGroupsData[iGroup][iMember].urlObject
            if (!playerChannelMap.includes(';')) {
              throw new Error(`${PACKAGE_PREFIX} channelmap is in error - right uuid`)
            }
            // extract right UUID
            playerRightUuid = playerChannelMap.split(';')[1]
            playerRightUuid = playerRightUuid.replace(':RF,RF', '')
          }
        }
      }
    }
    if (playerLeftUuid === '') {
      throw new Error(`${PACKAGE_PREFIX} player name left was not found`)
    }
    if (playerRightUuid === '') {
      throw new Error(`${PACKAGE_PREFIX} player name right was not found`)
    }

    // No check - always returns true
    await executeActionV6(playerLeftUrl,
      '/DeviceProperties/Control', 'SeparateStereoPair',
      { 'ChannelMapSet': `${playerLeftUuid}:LF,LF;${playerRightUuid}:RF,RF` })

    return {}
  }

  /**
   *  Household test player connection
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload SONOS player name, required!!!!
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} true | false
   *
   * Caution: sonosPlayer can not be used here as default for input.
   * It should be a "always on always available" player.
   *
   * @throws any functions throws error and explicit throws
   */
  // eslint-disable-next-line max-len
  async function householdTestPlayerOnline (node, msg, nodesonosPlayer, tsPlayer) {
    // Player name is required
    if (!xIsTruthyProperty(msg, ['payload'])) {
      throw new Error(`${PACKAGE_PREFIX} player name (msg.${msg.payload}) is missing/invalid`)
    }
    const playerToBeTested = msg.payload
    if (typeof playerToBeTested !== 'string' || playerToBeTested === '') {
      throw new Error(`${PACKAGE_PREFIX} player name (msg.${msg.payload}) is not string or empty`)
    }

    const allGroupsData = await xGetGroupsAll(tsPlayer)
    if (!xIsTruthy(allGroupsData)) {
      throw new Error(`${PACKAGE_PREFIX} all groups data undefined`)
    }

    let name
    for (let iGroup = 0; iGroup < allGroupsData.length; iGroup++) {
      for (let iMember = 0; iMember < allGroupsData[iGroup].length; iMember++) {
        name = allGroupsData[iGroup][iMember].playerName
        if (name === playerToBeTested) {
          return { 'payload': true }
        }
      }
    }

    return { 'payload': false }
  }

  /**
   *  Play notification on a joiner (in group) specified by sonosPlayer (default) or by playerName.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload notification uri.
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {string} [msg.duration] duration of notification hh:mm:ss 
   * - default is calculation, if that fails then 00:00:05
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Hints:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this player and the group shound be modified
   */
  async function joinerPlayNotification (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload notification uri is required.
    const validatedUri = validRegex(msg, 'payload', REGEX_ANYCHAR, 'uri', PACKAGE_PREFIX)

    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)

    // Verify that player is joiner and not a coordinator
    if (groupData.playerIndex === 0) {
      throw new Error(`${PACKAGE_PREFIX} player (msg.player/node) is not a joiner`)
    }

    // Msg.sameVolume is not used (only one player!)
    const options = { // Set defaults
      'uri': validatedUri,
      'volume': validated.volume, // Means don't touch
      'automaticDuration': true,
      'duration': '00:00:05' // In case automaticDuration does not work - 5 seconds
    }

    // Update options.duration - get info from SONOS player
    if (xIsTruthyProperty(msg, ['duration'])) {
      if (typeof msg.duration !== 'string') {
        throw new Error(`${PACKAGE_PREFIX} duration (msg.duration) is not a string`)
      }
      if (!REGEX_TIME.test(msg.duration)) {
        throw new Error(`${PACKAGE_PREFIX} duration (msg.duration) is not format hh:mm:ss`)
      }
      options.duration = msg.duration
      options.automaticDuration = false
    }

    // The coordinator is being used to capture group status (playing, content, ...)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
    const tsJoiner = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    tsJoiner.urlObject = groupData.members[groupData.playerIndex].urlObject
    await xPlayJoinerNotification(tsCoordinator, tsJoiner, options)

    return {}
  }

  /**
   *  Adjust player volume.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string/number} msg.payload -100 to +100 integer.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerAdjustVolume (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload volume is required.
    const adjustVolume = validToInteger(msg, 'payload', -100, +100, 'adjust volume',
      PACKAGE_PREFIX)

    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const tsSinglePlayer = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    tsSinglePlayer.urlObject = groupData.members[groupData.playerIndex].urlObject
   
    await tsSinglePlayer.SetRelativeVolume(adjustVolume)

    return {}
  }

  /**
   *  Player become coordinator of standalone group.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerBecomeStandalone (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const tsSinglePlayer = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    tsSinglePlayer.urlObject = groupData.members[groupData.playerIndex].urlObject
    await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/MediaRenderer/AVTransport/Control', 'BecomeCoordinatorOfStandaloneGroup',
      { 'InstanceID': 0 })

    return {}
  }

  /**
   *  Get player bass.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {payload: bas} type string -10 .. 10
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetBass (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const payload = await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/MediaRenderer/RenderingControl/Control', 'GetBass',
      { 'InstanceID': 0 })

    return { payload }
  }

  /**
   *  Get player EQ data.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} object to update msg. msg.payload the Loudness state LED state on|off
   *
   * @throws any functions throws error and explicit throws
   *
   * EQ data are only available for specific players.
   */
  async function playerGetEq (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const tsSinglePlayer = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    tsSinglePlayer.urlObject = groupData.members[groupData.playerIndex].urlObject

    // Verify that player has a TV mode
    const properties = await xGetDeviceProperties(tsSinglePlayer.urlObject)
    if (!xIsTruthyPropertyStringNotEmpty(properties, ['modelName'])) {
      throw new Error(`${PACKAGE_PREFIX} Sonos player model name undefined`)
    }
    if (!PLAYER_WITH_TV.includes(properties.modelName)) {
      throw new Error(`${PACKAGE_PREFIX} Selected player does not support TV`)
    }

    let args
    // No check exist needed as command has already been checked
    if (msg.topic === 'player.get.nightmode') {
      args = { 'InstanceID': 0, 'EQType': 'NightMode' }
    } else if (msg.topic === 'player.get.subgain') {
      args = { 'InstanceID': 0, 'EQType': 'SubGain' }
    } else if (msg.topic === 'player.get.dialoglevel') {
      args = { 'InstanceID': 0, 'EQType': 'DialogLevel' }
    } else {
      // Can not happen
    }

    let payload = await executeActionV6(nodesonosPlayer.urlObject,
      '/MediaRenderer/RenderingControl/Control', 'GetEQ',
      args)

    if (!xIsTruthy(payload)) {
      throw new Error(`${PACKAGE_PREFIX} player response is undefined`)
    }
    if (args.EQType !== 'SubGain') {
      payload = (payload === '1' ? 'on' : 'off')
    }

    return { payload }
  }

  /**
   *  Get player LED state.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise<string>} payload on or off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetLed (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    // returns On or Off
    const state = await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/DeviceProperties/Control', 'GetLEDState', {})
    
    return { 'payload': state.toLowerCase() }
  }

  /**
   *  Get player loudness.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} object to update msg. msg.payload the Loudness state LED state on|off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetLoudness (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const loudness = await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/MediaRenderer/RenderingControl/Control', 'GetLoudness',
      { 'InstanceID': 0, 'Channel': 'Master' })

    return { 'payload': (loudness === '1' ? 'on' : 'off') }
  }

  /**
   *  Get mute state for given player.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {payload: muteState} on|off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetMute (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const payload = await xGetMutestate(groupData.members[groupData.playerIndex].urlObject)

    return { payload }
  }

  /**
   *  Get player properties.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} object to update msg. msg.payload the properties object
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetProperties (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const tsSinglePlayer = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    tsSinglePlayer.urlObject = groupData.members[groupData.playerIndex].urlObject
    const properties = await xGetDeviceProperties(tsSinglePlayer.urlObject)
    const payload = Object.assign({}, properties)
    payload.uuid = payload.UDN.substring('uuid:'.length)
    payload.playerName = payload.roomName

    return { payload }
  }

  /**
   *  Get the SONOS-Queue of the specified player.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} object to update msg. msg.payload = array of queue items as object
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetQueue (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const tsSinglePlayer = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    tsSinglePlayer.urlObject = groupData.members[groupData.playerIndex].urlObject
    const payload = await xGetSonosQueue(tsSinglePlayer, REQUESTED_COUNT_QUEUE)

    return { payload }
  }

  /**
   *  Get the role and name of a player.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} object to update msg. msg.payload to role of player as string.
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetRole (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    let role
    if (groupData.members.length === 1) {
      role = 'standalone'
    } else if (groupData.playerIndex === 0) {
      role = 'coordinator'
    } else {
      role = 'joiner'
    }

    return { 'payload': role, 'playerName': groupData.members[groupData.playerIndex].playerName }
  }

  /**
   *  Get player treble.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise<string>} string -10 .. 10
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetTreble (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const payload = await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/MediaRenderer/RenderingControl/Control', 'GetTreble',
      { 'InstanceID': 0 })

    return { payload }
  }

  /**
   *  Get volume of given player.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise<string>} range 0 .. 100
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetVolume (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const payload = await xGetVolume(groupData.members[groupData.playerIndex].urlObject)

    return { payload }
  }

  /**
   *  Join a group. The group is being identified in payload (or config node)
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload SONOS name of any player in the group
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * Details: if coordinator: will leave old group and join new group.
   * If already in that group - it will just continue.
   * if coordinator of that group - no action and continue
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerJoinGroup (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload a playername in group is required
    const validatedGroupPlayerName = validRegex(msg, 'payload', REGEX_ANYCHAR,
      'group player name', PACKAGE_PREFIX)

    // Get coordinator uri/rincon of the target group
    const groupDataToJoin = await xGetGroupCurrent(tsPlayer, validatedGroupPlayerName)
    const coordinatorRincon = `x-rincon:${groupDataToJoin.members[0].uuid}`

    // Get playerName and URL origin of joiner (playerName or config node)
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupDataJoiner = await xGetGroupCurrent(tsPlayer, validated.playerName)

    if (
      groupDataJoiner.members[groupDataJoiner.playerIndex].playerName
      !== groupDataToJoin.members[0].playerName) {
      // No check - always returns true. We use SetAVTransport as build in AddMember does not work
      await executeActionV6(groupDataJoiner.members[groupDataJoiner.playerIndex].urlObject,
        '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
        { 'InstanceID': 0, 'CurrentURI': coordinatorRincon, 'CurrentURIMetaData': '' })
    } // Else: do nothing - either playerName is already coordinator

    return {}
  }

  /**
   *  Leave a group - means become a standalone player.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * Details: if coordinator => will leave group (stop playing), 
   *  another will take over coordinator role
   * if standalone - no change
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerLeaveGroup (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/MediaRenderer/AVTransport/Control', 'BecomeCoordinatorOfStandaloneGroup',
      { 'InstanceID': 0 })

    return {}
  }
  
  /**
   *  Player play AVTransport uri: LineIn, TV
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload uri x-***:
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {string} [msg.playerName=using nodesonosPlayer] SONOS-Playername
   * @param {object} nodesonosPlayer player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   */
  async function playerPlayAvtransport (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload uri is required: eg x-rincon-stream:RINCON_5CAAFD00223601400 for line in
    const validatedUri = validRegex(msg, 'payload', REGEX_ANYCHAR, 'uri', PACKAGE_PREFIX)

    // Validate msg.playerName, msg.volume
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)

    const playerUrlObject = groupData.members[groupData.playerIndex].urlObject
    await xSetAvTransport(playerUrlObject, {
      CurrentURI: validatedUri,
      metadata: ''
    })

    if (validated.volume !== -1) {
      await xSetVolume(playerUrlObject, validated.volume)
    }
    await xPlay(playerUrlObject)
    return {}
  }

  /**
   *  Player play TV
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   */
  async function playerPlayTv (node, msg, nodesonosPlayer, tsPlayer) {
    // Validate msg.playerName, msg.volume
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const tsSinglePlayer = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    tsSinglePlayer.urlObject = groupData.members[groupData.playerIndex].urlObject
    // Get the device props, check whether TV is supported and extract URI target
    const deviceProps = await  xGetDeviceProperties(tsSinglePlayer.urlObject)
    // Extract services and search for controlURL = "/HTControl/Control" - means tv enabled
    const serviceList = deviceProps.serviceList.service
    const found = serviceList.findIndex((service) => {
      if (service.controlURL === '/HTControl/Control') {
        return true
      }
    })

    if (found >= 0) {
      // Extract RINCON
      const rincon = deviceProps.UDN.substring('uuid: '.length - 1)

      // No check - always returns true
      await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
        '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
        {
          'InstanceID': 0, 'CurrentURI': `x-sonos-htastream:${rincon}:spdif`,
          'CurrentURIMetaData': ''
        })

      if (validated.volume !== -1) {
        await xSetVolume(groupData.members[groupData.playerIndex].urlObject, validated.volume)
      }
    } else {
      throw new Error(`${PACKAGE_PREFIX} Sonos player is not TV enabled`)
    }

    return {}
  }

  /**
   *  Set bass.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string/number} msg.payload-10 to +10 integer.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetBass (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload volume is required.
    const newBass = validToInteger(msg, 'payload', -10, +10, 'set bass', PACKAGE_PREFIX)
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/MediaRenderer/RenderingControl/Control', 'SetBass',
      { 'InstanceID': 0, 'DesiredBass': newBass })

    return {}
  }

  /**
   *  Set player EQ type
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.topic the lowercase, player.set.nightmode/subgain/dialoglevel
   * @param {string} msg.payload value on,off or -15 .. 15 in case of subgain
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetEQ (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const tsSinglePlayer = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    tsSinglePlayer.urlObject = groupData.members[groupData.playerIndex].urlObject

    // Verify that player has a TV mode
    const properties = await xGetDeviceProperties(tsSinglePlayer.urlObject)
    if (!xIsTruthyPropertyStringNotEmpty(properties, ['modelName'])) {
      throw new Error(`${PACKAGE_PREFIX} Sonos player model name undefined`)
    }
    if (!PLAYER_WITH_TV.includes(properties.modelName)) {
      throw new Error(`${PACKAGE_PREFIX} Selected player does not support TV`)
    }

    let eqType
    let eqValue
    // No check exist needed as command has already been checked
    if (msg.topic === 'player.set.nightmode') {
      eqType = 'NightMode'
      eqValue = isOnOff(msg, 'payload', 'nightmode', PACKAGE_PREFIX) // Required
      eqValue = (eqValue ? 1 : 0)
    } else if (msg.topic === 'player.set.subgain') {
      eqType = 'SubGain'
      eqValue = validToInteger(msg, 'payload', -15, 15, 'subgain',
        PACKAGE_PREFIX) // Required
    } else if (msg.topic === 'player.set.dialoglevel') {
      eqType = 'DialogLevel'
      eqValue = isOnOff(msg, 'payload', 'dialoglevel', PACKAGE_PREFIX) // Required
      eqValue = (eqValue ? 1 : 0)
    } else {
      // Can not happen
    }
    await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/MediaRenderer/RenderingControl/Control', 'SetEQ',
      { 'InstanceID': 0, 'EQType': eqType, 'DesiredValue': eqValue })

    return {}
  }

  /**
   *  Set player led on|off.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off
   * @param {string} [msg.playerName=using tslayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetLed (node, msg, nodesonosPlayer, tsPlayer) {
    // Msg.state is required - convert to On Off
    const newState = (isOnOff(msg, 'payload', 'led state', PACKAGE_PREFIX) ? 'On' : 'Off')

    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/DeviceProperties/Control', 'SetLEDState',
      { 'DesiredLEDState': newState })

    return {}
  }

  /**
   *  Set player loudness on|off.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetLoudness (node, msg, nodesonosPlayer, tsPlayer) {
    // Msg.state is required
    const newState = isOnOff(msg, 'payload', 'loudness state', PACKAGE_PREFIX)

    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/MediaRenderer/RenderingControl/Control', 'SetLoudness',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredLoudness': newState })

    return {}
  }

  /**
   *  Set mute for given player.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetMute (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload mute state is required.
    const newState = isOnOff(msg, 'payload', 'mute state', PACKAGE_PREFIX)

    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await xSetMutestate(groupData.members[groupData.playerIndex].urlObject, newState)

    return {}
  }

  /**
   *  Player set treble.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string/number} msg.payload -10 to +10 integer.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetTreble (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload volume is required.
    const newTreble = validToInteger(msg, 'payload', -10, +10, 'set treble',
      PACKAGE_PREFIX)

    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      '/MediaRenderer/RenderingControl/Control', 'SetTreble',
      { 'InstanceID': 0, 'DesiredTreble': newTreble })

    return {}
  }

  /**
   *  Set volume for given player.
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {number/string} msg.payload, integer 0 .. 100 integer.
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetVolume (node, msg, nodesonosPlayer, tsPlayer) {
    // Payload volume is required.
    const validatedVolume = validToInteger(msg, 'payload', 0, 100, 'volume', PACKAGE_PREFIX)
    const validatedPlayerName = validRegex(msg, 'playerName', REGEX_ANYCHAR,
      'player name', PACKAGE_PREFIX, '')
    const groupData = await xGetGroupCurrent(tsPlayer, validatedPlayerName)
    await xSetVolume(groupData.members[groupData.playerIndex].urlObject, validatedVolume)

    return {}
  }

  /**
   *  Test action V5
   * @param {object} node not used
   * @param {object} msg incoming message
   * @param {string} msg.endpoint 
   * @param {string} msg.action
   * @param {object} msg.inArgs
   * @param {string} [msg.playerName=using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with urlObject - as default
   *
   * @returns {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerExecuteActionV6 (node, msg, nodesonosPlayer, tsPlayer) {
    const validated = await validatedGroupProperties(msg, PACKAGE_PREFIX)
    const groupData = await xGetGroupCurrent(tsPlayer, validated.playerName)
    const { endpoint, action, inArgs } = msg
    const payload = await executeActionV6(groupData.members[groupData.playerIndex].urlObject,
      endpoint, action, inArgs)
    
    return { payload }
  }

  //
  //                                          HELPER
  //...............................................................................................

  /**
   *  Validates group properties msg.playerName, msg.volume, msg.sameVolume, msg.clearQueue
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = ''] playerName
   * @param {string/number} [msg.volume = -1] volume. if not set don't touch original volume.
   * @param {boolean} [msg.sameVolume = true] sameVolume
   * @param {boolean} [msg.clearQueue = true] indicator for clear queue
   * @param {string} pkgPrefix package identifier
   *
   * @returns {promise} object {playerName, volume, sameVolume, flushQueue}
   * playerName is '' if missing.
   * volume is -1 if missing. Otherwise number, integer in range 0 ... 100
   * sameVolume is true if missing.
   * clearQueue is true if missing.
   *
   * @throws error for all invalid values
   */
  async function validatedGroupProperties (msg, pkgPrefix) {
    // If missing set to ''.
    const newPlayerName = validRegex(msg, 'playerName', REGEX_ANYCHAR, 'player name',
      PACKAGE_PREFIX, '')

    // If missing set to -1.
    const newVolume = validToInteger(msg, 'volume', 0, 100, 'volume', PACKAGE_PREFIX, -1)

    // If missing set to true - throws errors if invalid
    let newSameVolume = true
    if (xIsTruthyProperty(msg, ['sameVolume'])) {
      if (typeof msg.sameVolume !== 'boolean') {
        throw new Error(`${pkgPrefix}: sameVolume (msg.sameVolume) is not boolean`)
      }
      if (newVolume === -1 && msg.sameVolume === true) {
        throw new Error(
          `${pkgPrefix}: sameVolume (msg.sameVolume) is true but msg.volume is not specified`)
      }
      newSameVolume = msg.sameVolume
    }

    // If missing set to true - throws errors if invalid
    let clearQueue = true
    if (xIsTruthyProperty(msg, ['clearQueue'])) {
      if (typeof msg.flushQueue !== 'boolean') {
        throw new Error(`${pkgPrefix}: clearQueue (msg.cleanQueue) is not boolean`)
      }
      clearQueue = msg.clearQueue
    }

    return {
      'playerName': newPlayerName,
      'volume': newVolume, 'sameVolume': newSameVolume, clearQueue
    }
  }

  RED.nodes.registerType('sonos-universal', SonosUniversalNode)
}
