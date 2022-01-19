/**
 * All functions provided by Universal node. 
 * Universal node: all except commands related to groups and player.
 *
 * @module Universal
 *
 * @author Henning Klages
 *
 */

'use strict'

const { PACKAGE_PREFIX, REGEX_ANYCHAR, REGEX_CSV, REGEX_HTTP, REGEX_IP, REGEX_DNS,
  REGEX_QUEUEMODES, REGEX_RADIO_ID, REGEX_SERIAL, REGEX_TIME,
  REGEX_TIME_DELTA, TIMEOUT_DISCOVERY, TIMEOUT_HTTP_REQUEST,
  ML_REQUESTS_MAXIMUM, QUEUE_REQUESTS_MAXIMUM,
  ERROR_NOT_FOUND_BY_SERIAL
} = require('./Globals.js')

const { discoverSpecificSonosPlayerBySerial } = require('./Discovery.js')

const { createGroupSnapshot, getGroupCurrent, getGroupsAll, getSonosPlaylists, getSonosQueueV2,
  playGroupNotification, playJoinerNotification, restoreGroupSnapshot, getAlarmsAll, getMySonos,
  getMusicLibraryItemsV2
} = require('./Commands.js')

const { executeActionV7, failure, getDeviceInfo, getDeviceProperties,
  getMusicServiceId, getMusicServiceName, getRadioId, decideCreateNodeOn,
  success, validatedGroupProperties, replaceAposColon, getDeviceBatteryLevel
} = require('./Extensions.js')

const { isOnOff, isTruthy, isTruthyProperty, isTruthyPropertyStringNotEmpty, validRegex,
  validToInteger, encodeHtmlEntity
} = require('./Helper.js')

const { SonosDevice, MetaDataHelper } = require('@svrooij/sonos/lib')
const Dns = require('dns')

const dnsPromises = Dns.promises

const debug = require('debug')(`${PACKAGE_PREFIX}universal`)

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
    'group.get.queue.length': groupGetQueueLength,
    'group.get.sleeptimer': groupGetSleeptimer,
    'group.get.state': groupGetState,
    'group.get.trackplus': groupGetTrackPlus,
    'group.get.volume': groupGetVolume,
    'group.next.track': groupNextTrack,
    'group.pause': groupPause,
    'group.play': groupPlay,
    'group.play.export': groupPlayExport,
    'group.play.library.playlist': groupPlayLibraryItem,
    'group.play.library.album': groupPlayLibraryItem,
    'group.play.library.artist': groupPlayLibraryItem,
    'group.play.library.track': groupPlayLibraryItem,
    'group.play.mysonos': groupPlayMySonos,
    'group.play.notification': groupPlayNotification,
    'group.play.queue': groupPlayQueue,
    'group.play.snap': groupPlaySnapshot,
    'group.play.streamhttp': groupPlayStreamHttp,
    'group.play.track': groupPlayTrack,
    'group.play.tunein': groupPlayTuneIn,
    'group.previous.track': groupPreviousTrack,
    'group.queue.library.playlist': groupQueueLibraryItem,
    'group.queue.library.album': groupQueueLibraryItem,
    'group.queue.library.artist': groupQueueLibraryItem,
    'group.queue.library.track': groupQueueLibraryItem,
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
    'household.disable.alarm': householdDisableAlarm,
    'household.enable.alarm': householdEnableAlarm,
    'household.get.alarms': householdGetAlarms,
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
    'player.get.batterylevel': playerGetBatteryLevel,
    'player.get.buttonlockstate': playerGetButtonLockState,
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
    'player.play.avtransport': playerPlayAvtransport,
    'player.play.linein': playerPlayLineIn,
    'player.play.tv': playerPlayTv,
    'player.set.bass': playerSetBass,
    'player.set.buttonlockstate': playerSetButtonLockState,
    'player.set.dialoglevel': playerSetEQ,
    'player.set.led': playerSetLed,
    'player.set.loudness': playerSetLoudness,
    'player.set.mutestate': playerSetMute,
    'player.set.nightmode': playerSetEQ,
    'player.set.subgain': playerSetEQ,
    'player.set.treble': playerSetTreble,
    'player.set.volume': playerSetVolume,
    'player.test': playerTest,
    'player.execute.action': playerExecuteActionV7
  }

  /**
   * Create Universal node, store nodeDialog, valid ip address and subscribe to messages.
   * @param {object} config current node configuration data
   */
  function SonosUniversalNode (config) {
    debug('method:%s', 'SonosUniversalNode')
    const thisFunctionName = 'create and subscribe'
    RED.nodes.createNode(this, config)
    const node = this
    node.status({}) // Clear node status
    
    const configNode = RED.nodes.getNode(config.confignode)

    // Order of processing of the two fields ip/dns field versus serial number field:
    // 1. ipv4 address entered and syntax is valid
    // 2. DNS name entered and syntax is valid: resolve and use resolved ipv4 address
    // 3. No ipv4/DNS entered & serial entered & valid syntax: 
    //    discover ipv4 address by serial and use it   
    if (isTruthyPropertyStringNotEmpty(configNode, ['ipaddress'])) {
      
      const hostname = configNode.ipaddress // ipv4 address or dns name, syntax not validated
      let ipv4Address // pure ipv4Address, syntax validated
      
      // async wrap to make it possible to use await dnsPromise
      (async function () {
        if (REGEX_IP.test(hostname)) {
          ipv4Address = hostname // priority 1
        } else if (REGEX_DNS.test(hostname)) {
          const ipv4Array = await dnsPromises.resolve4(hostname) 
          // dnsPromise returns an array with all data
          ipv4Address = ipv4Array[0] // priority 2
        } else {
          failure(node, null,
            new Error(`${PACKAGE_PREFIX} ipv4//DNS name >>${hostname} invalid syntax`),
            thisFunctionName)
          return
        }
        // ipv4Address is a pure ipv4 address and ready to use
        const port = 1400 // assuming this port
        const playerUrlObject = new URL(`http://${ipv4Address}:${port}`)
        // If box is ticked it is checked whether that IP address is reachable (http request)
        decideCreateNodeOn(playerUrlObject, TIMEOUT_HTTP_REQUEST,
          config.avoidCheckPlayerAvailability)
          .then((createNodeOn) => {
            if (createNodeOn) {
              // subscribe and set processing function
              node.on('input', (msg) => {
                debug('msg received >>%s', 'universal node')
                processInputMsg(node, config, msg, playerUrlObject.hostname)
                // processInputMsg sets msg.nrcspCmd to current command
                  .then((msgUpdate) => {
                    Object.assign(msg, msgUpdate) // Defines the output message
                    success(node, msg, msg.nrcspCmd)
                  })
                  .catch((error) => {
                    let lastFunction = 'processInputMsg'
                    if (msg.nrcspCmd && typeof msg.nrcspCmd === 'string') {
                      lastFunction = msg.nrcspCmd
                    }
                    failure(node, msg, error, lastFunction)
                  })
              })
              debug('successfully subscribed - node.on')
              node.status({ fill: 'green', shape: 'dot', text: 'ok:ready' })
            } else {
              debug('device not reachable/rejected')
              node.status({
                fill: 'red', shape: 'dot',
                text: 'error: device not reachable/rejected'
              })
            }
          }) // then createnode
          .catch((err) => {
            debug('xIsSonos failed >>%s', JSON.stringify(err, Object.getOwnPropertyNames(err)))
            node.status({ fill: 'red', shape: 'dot', text: 'error: decideCreateNodeOn went wrong' })
          }) // catch
      })() // async function
        .catch((err) => {
          debug('Could not retrieve ipv4 >>%', JSON.stringify(err, Object.getOwnPropertyNames(err)))
          failure(node, null,
            new Error(`${PACKAGE_PREFIX} Could not retrieve ipv4 for >>${hostname}`),
            thisFunctionName)
        })
      
    } else if (isTruthyPropertyStringNotEmpty(configNode, ['serialnum'])) {
      // start discovery
      const serialNb = configNode.serialnum
      if (!REGEX_SERIAL.test(serialNb)) {
        failure(node, null,
          new Error(`${PACKAGE_PREFIX} serial number >>${serialNb} invalid syntax`),
          thisFunctionName)
        return
      }

      discoverSpecificSonosPlayerBySerial(serialNb, TIMEOUT_DISCOVERY)
        .then((discoveredHost) => {
          debug('found ip address >>%s', discoveredHost)
          const validHost = discoveredHost
          
          // subscribe and set processing function
          node.on('input', (msg) => {
            debug('msg received >>%s', 'universal node')
            processInputMsg(node, config, msg, validHost)
              // processInputMsg sets msg.nrcspCmd to current command
              .then((msgUpdate) => {
                Object.assign(msg, msgUpdate) // Defines the output message
                success(node, msg, msg.nrcspCmd)
              })
              .catch((error) => {
                let lastFunction = 'processInputMsg'
                if (msg.nrcspCmd && typeof msg.nrcspCmd === 'string') {
                  lastFunction = msg.nrcspCmd
                }
                failure(node, msg, error, lastFunction)
              })
          })
          debug('successfully subscribed - node.on')
          node.status({ fill: 'green', shape: 'dot', text: 'ok:ready' })

        })
        .catch((err) => {
          // discovery failed - most likely because could not find any matching player
          let txt = 'could not discover player by serial'
          if (err.message === ERROR_NOT_FOUND_BY_SERIAL) {
            txt = ERROR_NOT_FOUND_BY_SERIAL
          }
          debug('discovery failed >>%s', JSON.stringify(err, Object.getOwnPropertyNames(err)))
          failure(node, txt, err, thisFunctionName)
          return
        })
   
    } else {
      failure(node, null,
        new Error(`${PACKAGE_PREFIX} serial number/ipv4//DNS name are invalid`), thisFunctionName)
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
   * @param {string} urlHost host of SONOS player such as 192.168.178.37
   *
   * Creates also msg.nrcspCmd with the used command in lower case.
   * Modifies msg.payload if set in dialog or for output!
   *
   * @returns {promise} All commands have to return a promise - object
   * example: returning {} means msg is not modified (except msg.nrcspCmd)
   * example: returning { 'payload': true } means 
   *  the original msg.payload will be modified and set to true.
   */
  async function processInputMsg (node, config, msg, urlHost) {
    debug('method:%s', 'processInputMsg')
    const tsPlayer = new SonosDevice(urlHost)
    if (!isTruthy(tsPlayer)) {
      throw new Error(`${PACKAGE_PREFIX} tsPlayer is undefined`)
    }
    if (!(isTruthyPropertyStringNotEmpty(tsPlayer, ['host'])
      && isTruthyProperty(tsPlayer, ['port']))) {
      throw new Error(`${PACKAGE_PREFIX} tsPlayer ip address or port is missing `)
    }
    // needed for my extension in Extensions
    tsPlayer.urlObject = new URL(`http://${tsPlayer.host}:${tsPlayer.port}`)
    
    // Command, required: node dialog overrules msg, store lowercase version in msg.nrcspCmd
    let command
    if (config.command !== 'message') { // Command specified in node dialog
      command = config.command
    } else {
      if (!isTruthyPropertyStringNotEmpty(msg, ['topic'])) {
        throw new Error(`${PACKAGE_PREFIX} command is undefined/invalid`)
      }
      command = String(msg.topic).toLowerCase()
      // You may omit group. prefix - so we add it here
      const REGEX_PREFIX = /^(household|group|player|joiner)/
      if (!REGEX_PREFIX.test(command)) {
        command = `group.${command}`
      }
    }
    if (!Object.prototype.hasOwnProperty.call(COMMAND_TABLE_UNIVERSAL,
      command)) {
      throw new Error(`${PACKAGE_PREFIX} command is invalid >>${command} `)
    }
    msg.nrcspCmd = command // Store command, is used in playerSetEQ, playerGetEQ, groupPlayLibrary*
    
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
        msg.payload = state
      }
    }

    return COMMAND_TABLE_UNIVERSAL[msg.nrcspCmd](msg, tsPlayer)
  }

  //
  //                                          COMMANDS
  //...............................................................................................
  
  /**
   *  Coordinator delegate coordination of group. New player must be in same group!

   * @param {object} msg incoming message + msg.nrcspCmd
   * @param {string} msg.payload new coordinator name - must be in same group and different
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'Player is not coordinator', 'Could not find player name in current group'
   * 'New coordinator must be different from current'
   * @throws {error} all methods
   */
  async function coordinatorDelegateCoordination (msg, tsPlayer) {
    debug('method:%s', 'coordinatorDelegateCoordination')
    // Payload new player name is required.
    const validPlayerName = validRegex(msg, 'payload', REGEX_ANYCHAR, 'player name')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    // Player must be coordinator to be able to delegate
    if (groupData.playerIndex !== 0) {
      throw new Error(`${PACKAGE_PREFIX} Player is not coordinator`)
    }

    // Check PlayerName is in group and not same as old coordinator
    const indexNewCoordinator = groupData.members.findIndex((p) => p.playerName === validPlayerName)
    if (indexNewCoordinator === -1) {
      throw new Error(`${PACKAGE_PREFIX} Could not find player name in current group`)
    }
    if (indexNewCoordinator === 0) {
      throw new Error(`${PACKAGE_PREFIX} New coordinator must be different from current`)
    }

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    await ts1Player.AVTransportService.DelegateGroupCoordinationTo(
      { 'InstanceID': 0, 'NewCoordinator': groupData.members[indexNewCoordinator].uuid,
        'RejoinGroup': true })

    return {}
  }

  /**
   *  Adjust group volume and outputs new volume.
   * @param {object} msg incoming message
   * @param {(string|number)} msg.payload -100 to + 100, integer
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property newVolume as string, range 0 ... 100
   *
   * @throws {error} all methods
   */
  async function groupAdjustVolume (msg, tsPlayer) {
    debug('method:%s', 'groupAdjustVolume')
    // Payload adjusted volume is required
    const adjustVolume = validToInteger(msg, 'payload', -100, +100, 'adjust volume')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    const result = await tsCoordinator.GroupRenderingControlService.SetRelativeGroupVolume(
      { 'InstanceID': 0, 'Adjustment': adjustVolume })
    
    const newVolume = result.NewVolume
    return { newVolume } // caution newVolume property!
  }

  /**
   *  Cancel group sleep timer.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupCancelSleeptimer (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.AVTransportService.ConfigureSleepTimer(
      { 'InstanceID': 0, 'NewSleepTimerDuration': '' })
    
    return {}
  }

  /**
   *  Clear queue.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupClearQueue (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
    await tsCoordinator.AVTransportService.RemoveAllTracksFromQueue()
    
    return {}
  }

  /**
   *  Create a snapshot of the given group of players.
   * @param {object} msg incoming message
   * @param {boolean} [msg.snapVolumes = false] will capture the players volumes
   * @param {boolean} [msg.snapMutestates = false] will capture the players mutestates
   * @param {string} [msg.playerName = using tssPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is object see createGroupSnapshot
   *
   * @throws {error} 'snapVolumes (msg.snapVolumes) is not boolean', 
   * 'snapMutestates (msg.snapMutestates) is not boolean'
   * @throws {error} all methods
   */
  async function groupCreateSnapshot (msg, tsPlayer) {
    debug('method:%s', 'groupCreateSnapshot')
    // Validate msg properties
    const options = { 'snapVolumes': false, 'snapMutestates': false } // Default
    if (isTruthyProperty(msg, ['snapVolumes'])) {
      if (typeof msg.snapVolumes !== 'boolean') {
        throw new Error(`${PACKAGE_PREFIX}: snapVolumes (msg.snapVolumes) is not boolean`)
      }
      options.snapVolumes = msg.snapVolumes
    }
    if (isTruthyProperty(msg, ['snapMutestates'])) {
      if (typeof msg.snapVolumes !== 'boolean') {
        throw new Error(`${PACKAGE_PREFIX}: snapMutestates (msg.snapMutestates) is not boolean`)
      }
      options.snapMutestates = msg.snapMutestates
    }

    // Validate msg.playerName 
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const payload = await createGroupSnapshot(groupData.members, options)
    
    return { payload }
  }

  /**
   *  Group create volume snap shot (used for adjust group volume)
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupCreateVolumeSnapshot (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.GroupRenderingControlService.SnapshotGroupVolume(
      { 'InstanceID': 0 }) 

    return {}
  }

  /**
   *  Get group transport actions.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is string csv transportActions
   *
   * @throws {error} all methods
   */
  // eslint-disable-next-line max-len
  async function groupGetTransportActions (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    const result = await tsCoordinator.AVTransportService.GetCurrentTransportActions(
      { 'InstanceID': 0 })
    
    const payload = result.Actions
    return { payload }
  }

  /**
   *  Get group crossfade mode.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload string on|off
   *
   * @throws {error} all methods
   */
  async function groupGetCrossfadeMode (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    const result = await tsCoordinator.AVTransportService.GetCrossfadeMode(
      { 'InstanceID': 0 })
    
    const payload = (result.CrossfadeMode ? 'on' : 'off')
    return { payload }
  }

  /**
   *  Get array of group member - this group.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is GroupMember[]
   *
   * @throws {error} all methods
   */
  async function groupGetMembers (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    return { 'payload': groupData.members }
  }

  /**
   *  Get group mute.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload string on|off
   *
   * @throws {error} all methods
   */
  async function groupGetMute (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    const result = await tsCoordinator.GroupRenderingControlService.GetGroupMute(
      { 'InstanceID': 0 })
    
    const payload = (result.CurrentMute ? 'on' : 'off')
    return { payload }
  }

  /**
   *  Get the playback state of that group, the specified player belongs to.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is string state
   * state: { 'stopped', 'playing', 'paused_playback', 'transitioning', 'no_media_present' }
   * 
   * @throws {error} all methods
   */
  async function groupGetPlaybackstate (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname) 
    tsCoordinator.urlObject = groupData.members[0].urlObject
    const transportInfoObject = await tsCoordinator.AVTransportService.GetTransportInfo({
      InstanceID: 0
    })
    const payload = transportInfoObject.CurrentTransportState.toLowerCase()

    return { payload }
  }

  /**
   *  Get group SONOS queue - the SONOS queue of the coordinator.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is array of queue items as object.
   *
   * @throws {error} all methods
   */
  async function groupGetQueue (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname) 
    tsCoordinator.urlObject = groupData.members[0].urlObject
    const payload = await getSonosQueueV2(tsCoordinator, QUEUE_REQUESTS_MAXIMUM) 
    
    return { payload }
  }

  /**
   *  Get group SONOS queue length - the SONOS queue of the coordinator.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is array of queue items as object.
   *
   * @throws {error} all methods
   */
  async function groupGetQueueLength (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname) 
    tsCoordinator.urlObject = groupData.members[0].urlObject

    // Get queue length, Q:0 = SONOS-Queue // browseQueue.TotalMatches
    const browseQueue = await tsCoordinator.ContentDirectoryService.Browse({
      'ObjectID': 'Q:0', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': 1, 'SortCriteria': ''
    })
    const payload = browseQueue.TotalMatches
    
    return { payload }
  }

  /**
   *  Get group sleeptimer.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload string hh:mm:ss
   *
   * @throws {error} all methods
   */
  async function groupGetSleeptimer (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    const result = await tsCoordinator.AVTransportService.GetRemainingSleepTimerDuration(
      { 'InstanceID': 0 })

    let payload = 'none'
    if (isTruthyProperty(result, ['RemainingSleepTimerDuration'])) {
      payload = result.RemainingSleepTimerDuration
    } 
    
    return { payload }
  }

  /**
   *  Get state (see return) of that group, the specified player belongs to.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with JavaScript build-in URL urlObject- as default
   *
   * @returns {promise<object>} property payload is string state
   * 
   * state: 'stopped' | 'playing' | 'paused_playback' | 'transitioning' | 'no_media_present' }
   * queue mode: 'NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 
   *  'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'
   *
   * @throws {error} 'current MediaInfo is invalid', 'PlayMode is invalid/missing/not string'
   * @throws {error} all methods
   */
  async function groupGetState (msg, tsPlayer) {
    debug('method:%s', 'groupGetState')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
  
    const playbackstateObject = await tsCoordinator.AVTransportService.GetTransportInfo({
      InstanceID: 0
    })
    const playbackstate = playbackstateObject.CurrentTransportState.toLowerCase()
    
    let result
    result = await tsCoordinator.GroupRenderingControlService.GetGroupMute(
      { 'InstanceID': 0 })
    const muteState = (result.CurrentMute ? 'on' : 'off')
    
    result = await tsCoordinator.GroupRenderingControlService.GetGroupVolume(
      { 'InstanceID': 0 })
    const volume = result.CurrentVolume

    // Get current media data and extract queueActivated
    const mediaData = await tsCoordinator.AVTransportService.GetMediaInfo()
    if (!isTruthy(mediaData)) {
      throw new Error(`${PACKAGE_PREFIX} current MediaInfo is invalid`)
    }
    let uri = '' // Set as default if not available
    if (isTruthyPropertyStringNotEmpty(mediaData, ['CurrentURI'])) {
      uri = mediaData.CurrentURI
    }
    const queueActivated = uri.startsWith('x-rincon-queue')
    const tvActivated = uri.startsWith('x-sonos-htastream')

    // Queue mode is in parameter PlayMode
    result = await tsCoordinator.AVTransportService.GetTransportSettings(
      { 'InstanceID': 0 })
    if (!isTruthyPropertyStringNotEmpty(result, ['PlayMode'])) {
      throw new Error(`${PACKAGE_PREFIX}: PlayMode is invalid/missing/not string`)
    }
    const queueMode = result.PlayMode

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
   *  Get group media and position(track) info.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is object: media: {object}, trackInfo: {object}, 
   * positionInfo: {object}, queueActivated: true/false
   *
   * @throws {error} 'current position data is invalid', 
   * @throws {error} all methods
   */
  async function groupGetTrackPlus (msg, tsPlayer) {
    debug('method:%s', 'groupGetTrackPlus')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject

    // Get current media data and extract queueActivated, radioId
    const mediaData = await tsCoordinator.AVTransportService.GetMediaInfo()
    if (!isTruthy(mediaData)) {
      throw new Error(`${PACKAGE_PREFIX} current media data is invalid`)
    }
    let uri = ''
    if (isTruthyPropertyStringNotEmpty(mediaData, ['CurrentURI'])) {
      uri = mediaData.CurrentURI
    }
    const queueActivated = uri.startsWith('x-rincon-queue')
    const radioId = getRadioId(uri)

    let serviceId = await getMusicServiceId(uri)

    // Get station uri for all "x-sonosapi-stream"
    let stationArtUri = ''
    if (uri.startsWith('x-sonosapi-stream')) {
      stationArtUri = `${tsCoordinator.urlObject.origin}/getaa?s=1&u=${uri}`
    }

    // Get current position data
    const positionData = await tsCoordinator.AVTransportService.GetPositionInfo()
    if (!isTruthy(positionData)) {
      throw new Error(`${PACKAGE_PREFIX} current position data is invalid`)
    }

    if (isTruthyPropertyStringNotEmpty(positionData, ['TrackURI'])) {
      const trackUri = positionData.TrackURI
      if (serviceId === '') {
        serviceId = await getMusicServiceId(trackUri)
      }
    }
    const serviceName = getMusicServiceName(serviceId)

    let artist = ''
    let title = ''
    if (!isTruthyPropertyStringNotEmpty(positionData, ['TrackMetaData', 'Artist'])) {
      // Missing artist: TuneIn provides artist and title in Title field
      if (!isTruthyPropertyStringNotEmpty(positionData, ['TrackMetaData', 'Title'])) {
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
      if (!isTruthyPropertyStringNotEmpty(positionData, ['TrackMetaData', 'Title'])) {
        // Title unknown
      } else {
        debug('got artist and title')
        title = positionData.TrackMetaData.Title
      }
    }

    let album = ''
    if (isTruthyPropertyStringNotEmpty(positionData, ['TrackMetaData', 'Album'])) {
      album = positionData.TrackMetaData.Album
    }
    let artUri = ''
    if (isTruthyPropertyStringNotEmpty(positionData, ['TrackMetaData', 'AlbumArtUri'])) {
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
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is string range 0 100
   *
   * @throws {error} all methods
   */
  async function groupGetVolume (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    const result = await tsCoordinator.GroupRenderingControlService.GetGroupVolume(
      { 'InstanceID': 0 })
    
    const payload = result.CurrentVolume
    return { payload }
  }

  /**
   *  Play next track in that group.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupNextTrack (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.Next()
    
    return {}
  }

  /**
   *  Pause playing in that group, the specified player belongs to.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupPause (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.Pause()
    
    return {}
  }

  /**
   *  Starts playing content. Content must have been set before.
   * @param {object} msg incoming message
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {number} [msg.sameVolume=true] shall all players play at same volume level. 
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'msg.sameVolume is nonsense: player is standalone'
   * @throws {error} all methods
   */
  async function groupPlay (msg, tsPlayer) {
    debug('method:%s', 'groupPlay')
    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${PACKAGE_PREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject // to be on the save side
    await tsCoordinator.Play()

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let i = 0; i < groupData.members.length; i++) {
          const tsPlayer = new SonosDevice(groupData.members[i].urlObject.hostname)
          await tsPlayer.SetVolume(validated.volume)
        }
      } else { // set only one player
        const tsPlayer = new SonosDevice(
          groupData.members[groupData.playerIndex].urlObject.hostname)
        await tsPlayer.SetVolume(validated.volume)
      }
    }

    return {}
  }

  /**
   *  Play playlist, album, artist, track from Music Library on 
   *  group (combination of export, play.export)
   * @param {object} msg incoming message
   * @param {string} msg.payload search string, part of item title
   * @param {string} msg.nrcspCmd identify the item type
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {boolean} [msg.sameVolume=true] shall all players play at same volume level.
   * @param {boolean} [msg.clearQueue=true] if true and export.queue = true the queue is cleared.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer node-sonos player with urlObject - as default
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'msg.sameVolume is nonsense: player is standalone'
   * @throws {error} all methods
   */
  async function groupPlayLibraryItem (msg, tsPlayer) {
    debug('method:%s', 'groupPlayLibraryItem')

    const validSearch
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string')

    let type = ''
    if (msg.nrcspCmd === 'group.play.library.playlist') {
      type = 'A:PLAYLISTS:'
    } else if (msg.nrcspCmd === 'group.play.library.album') {
      type = 'A:ALBUM:'
    } else if (msg.nrcspCmd === 'group.play.library.artist') {
      type = 'A:ARTIST:'
    } else if (msg.nrcspCmd === 'group.play.library.track') {
      type = 'A:TRACKS:'
    } else {
      // Can not happen
    }
    
    const list = await getMusicLibraryItemsV2(type, validSearch, ML_REQUESTS_MAXIMUM, tsPlayer)
    if (list.length === 0) {
      throw new Error(`${PACKAGE_PREFIX} no matching item found`)
    }
    const exportData = {
      'uri': replaceAposColon(list[0].uri),
      'metadata': list[0].uri, 
      'queue': true
    }
    // hand over to play.export

    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${PACKAGE_PREFIX} msg.sameVolume is nonsense: player is standalone`)
    }

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject

    if (validated.clearQueue) {
      await tsCoordinator.AVTransportService.RemoveAllTracksFromQueue()
    }
    await tsCoordinator.AVTransportService.AddURIToQueue({
      InstanceID: 0, EnqueuedURI: exportData.uri, EnqueuedURIMetaData: exportData.metadata,
      DesiredFirstTrackNumberEnqueued: 0, EnqueueAsNext: true
    })
    await tsCoordinator.SwitchToQueue()
      
    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let i = 0; i < groupData.members.length; i++) {
          const tsPlayer = new SonosDevice(groupData.members[i].urlObject.hostname)
          await tsPlayer.SetVolume(validated.volume)
        }
      } else { // set only one player
        const tsPlayer = new SonosDevice(
          groupData.members[groupData.playerIndex].urlObject.hostname)
        await tsPlayer.SetVolume(validated.volume)
      }
    }
    await tsCoordinator.Play()
    return {}
  }

  /**
   *  Play title from My Sonos on group (combination of export.item, play.export)
   * @param {object} msg incoming message
   * @param {string} msg.payload search string, part of title in My Sonos
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {boolean} [msg.sameVolume=true] shall all players play at same volume level.
   * @param {boolean} [msg.clearQueue=true] if true and export.queue = true the queue is cleared.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer node-sonos player with urlObject - as default
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'msg.sameVolume is nonsense: player is standalone'
   * @throws {error} all methods
   */
  async function groupPlayMySonos (msg, tsPlayer) {
    debug('method:%s', 'groupPlayMySonos')

    const validSearch
      = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string')

    const mySonosItems = await getMySonos(tsPlayer)
    if (!isTruthy(mySonosItems)) {
      throw new Error(`${PACKAGE_PREFIX} could not find any My Sonos items`)
    }
    
    // find in title property (findIndex returns -1 if not found)
    const foundIndex = mySonosItems.findIndex((item) => {
      return (item.title.includes(validSearch))
    })
    if (foundIndex === -1) {
      throw new Error(`${PACKAGE_PREFIX} no title matching search string >>${validSearch}`)
    }
    const exportData = {
      'uri': mySonosItems[foundIndex].uri,
      'metadata': mySonosItems[foundIndex].metadata,
      'queue': (mySonosItems[foundIndex].processingType === 'queue')
    }
    // hand over to play.export

    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
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
        InstanceID: 0, EnqueuedURI: exportData.uri, EnqueuedURIMetaData: exportData.metadata,
        DesiredFirstTrackNumberEnqueued: 0, EnqueueAsNext: true
      })
      await tsCoordinator.SwitchToQueue()
      
    } else {
      await tsCoordinator.AVTransportService.SetAVTransportURI({
        InstanceID: 0, CurrentURI: exportData.uri, CurrentURIMetaData: exportData.metadata
      })
    }

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let i = 0; i < groupData.members.length; i++) {
          const tsPlayer = new SonosDevice(groupData.members[i].urlObject.hostname)
          await tsPlayer.SetVolume(validated.volume)
        }
      } else { // set only one player
        const tsPlayer = new SonosDevice(
          groupData.members[groupData.playerIndex].urlObject.hostname)
        await tsPlayer.SetVolume(validated.volume)
      }
    }
    await tsCoordinator.Play()
    return {}
  }
  /**
   *  Play data being exported form My Sonos (uri/metadata) on a current group
   * @param {object} msg incoming message
   * @param {string} msg.payload content to be played
   * @param {string} msg.payload.uri uri to be played/queued (not changed)
   * @param {boolean} msg.payload.queue indicator: has to be queued
   * @param {string} [msg.payload..metadata] metadata (not changed)
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {boolean} [msg.sameVolume=true] shall all players play at same volume level.
   * @param {boolean} [msg.clearQueue=true] if true and export.queue = true the queue is cleared.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer node-sonos player with urlObject - as default
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'uri is missing', 'queue identifier is missing', 
   * 'msg.sameVolume is nonsense: player is standalone'
   * @throws {error} all methods
   */
  async function groupPlayExport (msg, tsPlayer) {
    debug('method:%s', 'groupPlayExport')
    // Simple validation of export and activation
    const exportData = msg.payload
    if (!isTruthyPropertyStringNotEmpty(exportData, ['uri'])) {
      throw new Error(`${PACKAGE_PREFIX} uri is missing`)
    }
    if (!isTruthyProperty(exportData, ['queue'])) {
      throw new Error(`${PACKAGE_PREFIX} queue identifier is missing`)
    }

    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
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
        InstanceID: 0, EnqueuedURI: exportData.uri, EnqueuedURIMetaData: exportData.metadata,
        DesiredFirstTrackNumberEnqueued: 0, EnqueueAsNext: true
      })
      await tsCoordinator.SwitchToQueue()
      
    } else {
      await tsCoordinator.AVTransportService.SetAVTransportURI({
        InstanceID: 0, CurrentURI: exportData.uri, CurrentURIMetaData: exportData.metadata
      })
    }

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let i = 0; i < groupData.members.length; i++) {
          const tsPlayer = new SonosDevice(groupData.members[i].urlObject.hostname)
          await tsPlayer.SetVolume(validated.volume)
        }
      } else { // set only one player
        const tsPlayer = new SonosDevice(
          groupData.members[groupData.playerIndex].urlObject.hostname)
        await tsPlayer.SetVolume(validated.volume)
      }
    }
    await tsCoordinator.Play()
    return {}
  }

  /**
   *  Play notification on current group. Group topology will not being touched.
   * @param {object} msg incoming message
   * @param {string} msg.payload notification uri.
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {boolean} [msg.sameVolume=true] shall all players play at same volume level. 
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {string} [msg.duration] duration of notification hh:mm:ss 
   * - default is calculation, if that fails then 00:00:05
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'duration (msg.duration) is not a string', 
   * 'duration (msg.duration) is not format hh:mm:ss'
   * @throws {error} all methods
   *
   * Hint:
   * While playing a notification (start .. to end + 2 seconds)
   * there should not be send another request to this group.
   */
  async function groupPlayNotification (msg, tsPlayer) {
    debug('method:%s', 'groupPlayNotification')
    // Payload uri is required.
    const validatedUri = validRegex(msg, 'payload', REGEX_ANYCHAR, 'uri')

    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const options = { // Set defaults
      'uri': validatedUri,
      'volume': validated.volume,
      'sameVolume': validated.sameVolume,
      'automaticDuration': true,
      'duration': '00:00:05' // In case automaticDuration does not work - 5 seconds
    }

    // Update options.duration - get info from SONOS
    if (isTruthyProperty(msg, ['duration'])) {
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
    await playGroupNotification(tsPlayerArray, options)
    
    return {}
  }

  /**
   *  Play none empty queue (group coordinator)
   * @param {object} msg incoming message
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {number} [msg.sameVolume=true] shall all players play at same volume level. 
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'msg.sameVolume is nonsense: player is standalone', 'queue is empty'
   * @throws {error} all methods
   */
  async function groupPlayQueue (msg, tsPlayer) {
    debug('method:%s', 'groupPlayQueue')
    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${PACKAGE_PREFIX} msg.sameVolume is nonsense: player is standalone`)
    }

    const coordinatorIndex = 0
    const tsCoordinator = new SonosDevice(groupData.members[coordinatorIndex].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[coordinatorIndex].urlObject

    // Is queue empty? Q:0 = SONOS-Queue // browseQueue.TotalMatches
    const browseQueue = await tsCoordinator.ContentDirectoryService.Browse({
      'ObjectID': 'Q:0', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': 1, 'SortCriteria': ''
    })
    if (browseQueue.TotalMatches === 0) {
      // Queue is empty
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }

    tsCoordinator.urlObject = groupData.members[0].urlObject
    await tsCoordinator.SwitchToQueue()

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let i = 0; i < groupData.members.length; i++) {
          const tsPlayer = new SonosDevice(groupData.members[i].urlObject.hostname)
          await tsPlayer.SetVolume(validated.volume)
        }
      } else { // set only one player
        const tsPlayer = new SonosDevice(
          groupData.members[groupData.playerIndex].urlObject.hostname)
        await tsPlayer.SetVolume(validated.volume)
      }
    }

    await tsCoordinator.Play()

    return {}
  }

  /**
   *  Play a given snapshot on the given group of players.
   * @param {object} msg incoming message
   * @param {string} msg.payload snapshot - output form groupCreateSnapshot
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'snapshot (msg.payload) is not object', 'snapshot (msg.payload) is missing'
   * 'snapshot/current group have different coordinator', 
   * 'snapshot/current group have different size', 'snapshot/current group members are different'
   * @throws {error} all methods
   */
  async function groupPlaySnapshot (msg, tsPlayer) {
    debug('method:%s', 'groupPlaySnapshot')
    if (isTruthyProperty(msg, ['payload'])) {
      if (typeof msg.payload !== 'object') {
        throw new Error(`${PACKAGE_PREFIX}: snapshot (msg.payload) is not object`)
      }
    } else {
      throw new Error(`${PACKAGE_PREFIX}: snapshot (msg.payload) is missing`)
    }
    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

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
    for (let i = 1; i < groupData.members.length; i++) {
      foundIndex = snapshot.membersData.findIndex(
        (item) => (item.playerName === groupData.members[i].playerName))
      if (foundIndex === -1) {
        throw new Error(`${PACKAGE_PREFIX}: snapshot/current group members are different`)
      }
    }
    await restoreGroupSnapshot(snapshot)
    if (snapshot.wasPlaying) {
      const tsPlayer = new SonosDevice(groupData.members[0].urlObject.hostname)
      await tsPlayer.Play()
    }
    
    return {}
  }

  /**
   *  Play stream using http such as http://www.fritz.de/live.m3u, https://live.radioarabella.de
   * @param {object} msg incoming message
   * @param {string} msg.payload uri start with http(s):// 
   * @param {string} [msg.info = ''] text be used as title of URI
   *  @param {string} [msg.artUri = ''] uri to art, used as cover logo
   * @param {(number|string)} [msg.volume = unchanged] new volume
   * @param {boolean} [msg.sameVolume = true] force all players to play at same volume level.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   * 
   * @throws {error} 'msg.sameVolume is nonsense: player is standalone'
   * @throws {error} all methods
   */
  async function groupPlayStreamHttp (msg, tsPlayer) {
    debug('method:%s', 'groupPlayStreamHttp')
    // msg.payload uri is required.
    let validatedUri = validRegex(msg, 'payload', REGEX_HTTP, 'uri')

    //validate optional msg.info, msg.artUri
    const track = { 'Title': '', 'AlbumArtUri': '' }
    if (isTruthyPropertyStringNotEmpty(msg, ['info'])) {
      track.Title = msg.info
    }
    if (isTruthyPropertyStringNotEmpty(msg, ['artUri'])) {
      track.AlbumArtUri = msg.artUri
    }
    const metadata =  await encodeHtmlEntity(await MetaDataHelper.TrackToMetaData(track, false))

    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${PACKAGE_PREFIX} msg.sameVolume is nonsense: player is standalone`)
    }

    validatedUri = `x-rincon-mp3radio://${validatedUri}`

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.AVTransportService.SetAVTransportURI(
      { 'InstanceID': 0, 'CurrentURI': validatedUri, 'CurrentURIMetaData': metadata })
    
    await tsCoordinator.Play()

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let i = 0; i < groupData.members.length; i++) {
          const tsPlayer = new SonosDevice(groupData.members[i].urlObject.hostname)
          await tsPlayer.SetVolume(validated.volume)
        }
      } else { // set only one player
        const tsPlayer = new SonosDevice(
          groupData.members[groupData.playerIndex].urlObject.hostname)
        await tsPlayer.SetVolume(validated.volume)
      }
    }
    
    return {}
  }

  /**
   *  Play a specific track in queue. Queue must not be empty.
   * @param {object} msg incoming message
   * @param {string/number} msg.payload position of track in queue. 1 ... queue length.
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {boolean} [msg.sameVolume =true] shall all players play at same volume level.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'queue is empty'
   * @throws {error} all methods
   */
  async function groupPlayTrack (msg, tsPlayer) {
    debug('method:%s', 'groupPlayTrack')
    // Get the playerName
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    // validate queue is not empty
    const coordinatorIndex = 0
    const tsCoordinator = new SonosDevice(groupData.members[coordinatorIndex].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[coordinatorIndex].urlObject

    // Queue sie empty? Q:0 = SONOS-Queue // browseQueue.TotalMatches
    const browseQueue = await tsCoordinator.ContentDirectoryService.Browse({
      'ObjectID': 'Q:0', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': 1, 'SortCriteria': ''
    })
    if (browseQueue.TotalMatches === 0) {
      // Queue is empty
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }
    const lastTrackInQueue = browseQueue.TotalMatches
    if (lastTrackInQueue === 0) {
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }
    
    // Payload position is required
    const validatedPosition = validToInteger(msg, 'payload', 1, lastTrackInQueue,
      'position in queue')
    await tsCoordinator.SwitchToQueue()
    await tsCoordinator.SeekTrack(validatedPosition)
    
    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let i = 0; i < groupData.members.length; i++) {
          const tsPlayer = new SonosDevice(groupData.members[i].urlObject.hostname)
          await tsPlayer.SetVolume(validated.volume)
        }
      } else { // set only one player
        const tsPlayer = new SonosDevice(
          groupData.members[groupData.playerIndex].urlObject.hostname)
        await tsPlayer.SetVolume(validated.volume)
      }
    }
    await tsCoordinator.Play()
    return {}
  }

  /**
   *  Play tuneIn station. Optional set volume, use playerName.
   * @param {object} msg incoming message
   * @param {string} msg.payload TuneIn id
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {boolean} [msg.sameVolume = true] shall all players play at same volume level. 
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'msg.sameVolume is nonsense: player is standalone'
   * @throws {error} all methods
   */
  async function groupPlayTuneIn (msg, tsPlayer) {
    debug('method:%s', 'groupPlayTuneIn')
    // Payload radio id is required
    const validatedRadioId = validRegex(msg, 'payload', REGEX_RADIO_ID, 'radio id')
    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${PACKAGE_PREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
    await tsCoordinator.SetAVTransportURI(`radio:${validatedRadioId}`)

    if (validated.volume !== -1) {
      if (validated.sameVolume) { // set all player
        for (let i = 0; i < groupData.members.length; i++) {
          const tsPlayer = new SonosDevice(groupData.members[i].urlObject.hostname)
          await tsPlayer.SetVolume(validated.volume)
        }
      } else { // set only one player
        const tsPlayer = new SonosDevice(
          groupData.members[groupData.playerIndex].urlObject.hostname)
        await tsPlayer.SetVolume(validated.volume)
      }
    }
    tsCoordinator.Play()
    
    return {}
  }

  /**
   *  Play previous track on given group of players.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupPreviousTrack (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.Previous()

    return {}
  }

  /**
   *  Queue first matching playlist, album, artist, track from Music Library 
   * @param {object} msg incoming message
   * @param {string} msg.payload search string, part of item title
   * @param {string} msg.nrcspCmd identify the item type
   * @param {boolean} [msg.clearQueue=true] if true and export.queue = true the queue is cleared.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer node-sonos player with urlObject - as default
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'msg.sameVolume is nonsense: player is standalone'
   * @throws {error} 'no matching item found'
   * @throws {error} all methods
   */
  async function groupQueueLibraryItem (msg, tsPlayer) {
    debug('method:%s', 'groupQueueLibraryItem')

    // payload title search string is required.
    const validSearch = validRegex(msg, 'payload', REGEX_ANYCHAR, 'search string')

    let type = ''
    if (msg.nrcspCmd === 'group.queue.library.playlist') {
      type = 'A:PLAYLISTS:'
    } else if (msg.nrcspCmd === 'group.queue.library.album') {
      type = 'A:ALBUM:'
    } else if (msg.nrcspCmd === 'group.queue.library.artist') {
      type = 'A:ARTIST:'
    } else if (msg.nrcspCmd === 'group.queue.library.track') {
      type = 'A:TRACKS:'
    } else {
      // Can not happen
    }
    
    const list = await getMusicLibraryItemsV2(type, validSearch, ML_REQUESTS_MAXIMUM, tsPlayer)
    // select the first item returned
    if (list.length === 0) {
      throw new Error(`${PACKAGE_PREFIX} no matching item found`)
    }
    const firstItem = {
      'uri': replaceAposColon(list[0].uri), 
      'metadata': list[0].metadata
    }

    // Validate msg.playerName -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject

    // Queue
    if (validated.clearQueue) {
      await tsCoordinator.AVTransportService.RemoveAllTracksFromQueue()
    }
    const result = await tsCoordinator.AVTransportService.AddURIToQueue({
      InstanceID: 0, EnqueuedURI: firstItem.uri, EnqueuedURIMetaData: firstItem.metadata,
      DesiredFirstTrackNumberEnqueued: 0, EnqueueAsNext: true
    })
      
    return {
      'newQueueLength': result.NewQueueLength,
      'firstTrackNumberEnqueued': result.FirstTrackNumberEnqueued
    }
  }

  /**
   *  Queue uri.
   * @param {object} msg incoming message
   * @param {string/number}msg.payload valid uri
   * @param {string} [msg.playerName = using nodesonosPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupQueueUri (msg, tsPlayer) {
    // Payload uri is required.
    const validatedUri = validRegex(msg, 'payload', REGEX_ANYCHAR, 'uri')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
    // position in queue = 0 (at the end), enqueue next true (only effective in shuffle mode)
    const result = await tsCoordinator.AddUriToQueue(validatedUri, 0, true)

    return {
      'newQueueLength': result.NewQueueLength,
      'firstTrackNumberEnqueued': result.FirstTrackNumberEnqueued
    }
  }

  /**
   *  Queue spotify uri on given group queue.
   * @param {object} msg incoming message
   * @param {string/number} msg.payload valid uri from spotify
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * Valid examples
   * spotify:track:5AdoS3gS47x40nBNlNmPQ8
   * spotify:album:1TSZDcvlPtAnekTaItI3qO
   * spotify:artistTopTracks:1dfeR4HaWDbWqFHLkxsg1d
   * spotify:user:spotify:playlist:37i9dQZEVXbMDoHDwVN2tF
   *
   * Caution: Currently only support European region '2311' (US = 3079)
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'not supported type of spotify uri'
   * @throws {error} all methods
   */
  async function groupQueueUriFromSpotify (msg, tsPlayer) {
    // Payload uri is required.
    const validatedUri = validRegex(msg, 'payload', REGEX_ANYCHAR, 'spotify uri')
    if (!(validatedUri.startsWith('spotify:track:')
      || validatedUri.startsWith('spotify:album:')
      || validatedUri.startsWith('spotify:artistTopTracks:')
      || validatedUri.startsWith('spotify:playlist:')
      || validatedUri.startsWith('spotify:user:spotify:playlist:'))) {
      throw new Error(`${PACKAGE_PREFIX} not supported type of spotify uri`)
    }

    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[0].urlObject
    // position in queue = 0 (at the end), enqueue next true (only effective in shuffle mode)
    const result = await tsCoordinator.AddUriToQueue(validatedUri, 0, true)

    return {
      'newQueueLength': result.NewQueueLength,
      'firstTrackNumberEnqueued': result.FirstTrackNumberEnqueued
    }
  }

  /**
   *  Remove a number of tracks in queue (queue must be non empty)
   * @param {object} msg incoming message
   * @param {string/number} msg.payload number of track in queue. 1 ... queue length.
   * @param {number/string} [msg.numberOfTracks=1] number of track 1 ... queue length.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'queue is empty'
   * @throws {error} all methods
   */
  async function groupRemoveTracks (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    // Get the number of tracks in queue - should be > 0
    const coordinatorIndex = 0
    const tsCoordinator = new SonosDevice(groupData.members[coordinatorIndex].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[coordinatorIndex].urlObject

    // Get size of queue. Q:0 = SONOS-Queue // browseQueue.TotalMatches
    const browseQueue = await tsCoordinator.ContentDirectoryService.Browse({
      'ObjectID': 'Q:0', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': 1, 'SortCriteria': ''
    })
    const lastTrackInQueue = browseQueue.TotalMatches
    if (lastTrackInQueue === 0) {
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }

    // Payload track position is required.
    const validatedPosition = validToInteger(msg, 'payload', 1, lastTrackInQueue,
      'position in queue')
    const validatedNumberOfTracks = validToInteger(msg, 'numberOfTracks', 1,
      lastTrackInQueue, 'number of tracks', 1)
    if ((validatedNumberOfTracks + validatedPosition) >= lastTrackInQueue) {
      throw new Error(`${PACKAGE_PREFIX} position + amount of tracks is out of range`)
    }
    await tsCoordinator.AVTransportService.RemoveTrackRangeFromQueue({
      'InstanceID': 0,
      'StartingIndex': validatedPosition,
      'NumberOfTracks': validatedNumberOfTracks,
      'UpdateID': ''
    })
    
    return {}
  }

  /**
   *  Save SONOS queue to Sonos playlist.
   * @param {object} msg incoming message
   * @param {string} msg.payload title of Sonos playlist.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {}
   *
   * @throws {error} 'queue is empty'
   * @throws {error} all methods
   */
  // eslint-disable-next-line max-len
  async function groupSaveQueueToSonosPlaylist (msg, tsPlayer) {
    // Payload title search string is required.
    const validatedTitle = validRegex(msg, 'payload', REGEX_ANYCHAR, 'title')

    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const coordinatorIndex = 0
    const tsCoordinator = new SonosDevice(groupData.members[coordinatorIndex].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[coordinatorIndex].urlObject

    // Is queue empty? Q:0 = SONOS-Queue // browseQueue.TotalMatches
    const browseQueue = await tsCoordinator.ContentDirectoryService.Browse({
      'ObjectID': 'Q:0', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': 1, 'SortCriteria': ''
    })
    if (browseQueue.TotalMatches === 0) {
      // Queue is empty
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }

    if (browseQueue.TotalMatches === 0) {
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }
    await tsCoordinator.AVTransportService.SaveQueue(
      { 'InstanceID': 0, 'Title': validatedTitle, 'ObjectID': '' }) 
    
    return {}
  }

  /**
   *  Group seek to specific time.
   * @param {object} msg incoming message
   * @param {string} msg.payload hh:mm:ss time in song.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupSeek (msg, tsPlayer) {
    // Payload seek time is required.
    const validTime = validRegex(msg, 'payload', REGEX_TIME, 'seek time')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.AVTransportService.Seek(
      { 'InstanceID': 0, 'Target': validTime, 'Unit': 'REL_TIME' })
    
    return {}
  }

  /**
   *  Group seek with delta time to specific time.

   * @param {object} msg incoming message
   * @param {string} msg.payload +/- hh:mm:ss time in song.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupSeekDelta (msg, tsPlayer) {
    // Payload seek time is required.
    const validTime = validRegex(msg, 'payload', REGEX_TIME_DELTA, 'relative seek time')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.AVTransportService.Seek(
      { 'InstanceID': 0, 'Target': validTime, 'Unit': 'TIME_DELTA' })

    return {}
  }

  /**
   *  Set group crossfade on|off.
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupSetCrossfade (msg, tsPlayer) {
    // Payload crossfade sate is required.
    const newState = isOnOff(msg, 'payload', 'crosssfade state')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.AVTransportService.SetCrossfadeMode(
      { 'InstanceID': 0, 'CrossfadeMode': newState })

    return {}
  }

  /**
   *  Set group mute state.
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupSetMute (msg, tsPlayer) {
    // Payload mute state is required.
    const newState = isOnOff(msg, 'payload', 'mute state')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.GroupRenderingControlService.SetGroupMute(
      { 'InstanceID': 0, 'DesiredMute': newState })

    return {}
  }

  /**
   *  Set group queuemode - queue must being activated and must not be empty.
   * @param {object} msg incoming message
   * @param {string} msg.payload queue modes - may be mixed case
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'queue is empty', 'current media data is invalid', 'queue is not activated'
   * @throws {error} all methods
   */
  async function groupSetQueuemode (msg, tsPlayer) {
    // Payload queuemode is required.
    const newState = validRegex(msg, 'payload', REGEX_QUEUEMODES, 'queue mode')

    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    
    // Check queue is not empty and activated
    const coordinatorIndex = 0
    const tsCoordinator = new SonosDevice(groupData.members[coordinatorIndex].urlObject.hostname)
    tsCoordinator.urlObject = groupData.members[coordinatorIndex].urlObject

    // Is queue empty? Q:0 = SONOS-Queue // browseQueue.TotalMatches
    const browseQueue = await tsCoordinator.ContentDirectoryService.Browse({
      'ObjectID': 'Q:0', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': 1, 'SortCriteria': ''
    })
    if (browseQueue.TotalMatches === 0) {
      // Queue is empty
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }
    if (browseQueue.TotalMatches === 0) {
      throw new Error(`${PACKAGE_PREFIX} queue is empty`)
    }

    // check queue is activated
    const mediaData = await tsCoordinator.AVTransportService.GetMediaInfo()
    if (!isTruthy(mediaData)) {
      throw new Error(`${PACKAGE_PREFIX} current media data is invalid`)
    }
    if (!isTruthyPropertyStringNotEmpty(mediaData, ['CurrentURI'])) {
      throw new Error(`${PACKAGE_PREFIX} CurrentUri is invalid`)
    }
    const uri = mediaData.CurrentURI
    if (!uri.startsWith('x-rincon-queue')) {
      throw new Error(`${PACKAGE_PREFIX} queue is not activated`)
    }

    // SONOS only accepts uppercase!
    await tsCoordinator.AVTransportService.SetPlayMode(
      { 'InstanceID': 0, 'NewPlayMode': newState.toUpperCase() })

    return {}
  }

  /**
   *  Set group sleep timer.
   * @param {object} msg incoming message
   * @param {string} msg.payload hh:mm:ss time in song.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupSetSleeptimer (msg, tsPlayer) {
    // Payload sleep time is required.
    const validTime = validRegex(msg, 'payload', REGEX_TIME, 'timer duration')

    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.AVTransportService.ConfigureSleepTimer(
      { 'InstanceID': 0, 'NewSleepTimerDuration': validTime })

    return {}
  }

  /**
   *  Group set volume.
   * @param {object} msg incoming message
   * @param {string/number} msg.payload new volume
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupSetVolume (msg, tsPlayer) {
    const newVolume = validToInteger(msg, 'payload', -100, +100, 'new volume')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.GroupRenderingControlService.SetGroupVolume(
      { 'InstanceID': 0, 'DesiredVolume': newVolume })

    return {}
  }

  /**
   *  Stop playing in that group, the specified player belongs to.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupStop (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.Stop()
    
    return {}
  }

  /**
   *  Toggle playback on given group of players.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function groupTogglePlayback (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const tsCoordinator = new SonosDevice(groupData.members[0].urlObject.hostname)
    await tsCoordinator.TogglePlayback()

    return {}
  }

  /**
   *  Create a new group in household.
   * @param {object} msg incoming message
   * @param {string} msg.payload csv list of playerNames, first will become coordinator
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'List includes a player multiple times', 'all groups data undefined',
   * 'Could not find player *'
   * @throws {error} all methods
   */

  // Algorithm: If the new coordinator is already the coordinator in a existing group, 
  // then just take that group and remove (first)/ add (second) the needed players.
  // else make the new coordinator stand alone and add all needed players.
  
  async function householdCreateGroup (msg, tsPlayer) {
    const validatedPlayerList = validRegex(msg, 'payload', REGEX_CSV, 'player list')
    const newGroupPlayerArray = validatedPlayerList.split(',')

    // Verify all are unique
    const uniqueArray = newGroupPlayerArray.filter((x, i, a) => a.indexOf(x) === i)
    if (uniqueArray.length < newGroupPlayerArray.length) {
      throw new Error(`${PACKAGE_PREFIX} List includes a player multiple times`)
    }

    // Get groups with members and convert multi dimensional array to simple array 
    // where objects have new property groupIndex, memberIndex
    const allGroupsData = await getGroupsAll(tsPlayer)
    if (!isTruthy(allGroupsData)) {
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
            await executeActionV7(householdPlayerList[i].urlObject,
              '/MediaRenderer/AVTransport/Control', 'BecomeCoordinatorOfStandaloneGroup',
              { 'InstanceID': 0 })
          }
        } else if (
          householdPlayerList[i].groupIndex !== householdPlayerList[iNewCoordinator].groupIndex) {
          // No check - always returns true. Using SetAVTransportURI as AddMember does not work
          await executeActionV7(householdPlayerList[i].urlObject,
            '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
            { 'InstanceID': 0, 'CurrentURI': coordinatorRincon, 'CurrentURIMetaData': '' })
        }
      }
    } else {
      await executeActionV7(householdPlayerList[iNewCoordinator].urlObject,
        '/MediaRenderer/AVTransport/Control', 'BecomeCoordinatorOfStandaloneGroup',
        { 'InstanceID': 0 })
      
      // Because it takes time to BecomeCoordinator
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](500) 
      let indexPlayer

      for (let i = 1; i < newGroupPlayerArray.length; i++) { // Start with 1
        indexPlayer = householdPlayerList.findIndex((p) => p.playerName === newGroupPlayerArray[i])
        // No check - always returns true. Using SetAVTransportURI as AddMember does not work
        await executeActionV7(householdPlayerList[indexPlayer].urlObject,
          '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
          { 'InstanceID': 0, 'CurrentURI': coordinatorRincon, 'CurrentURIMetaData': '' })
      }
    }

    return {}
  }

  /**
   *  Create a stereo pair of players. Right one will be hidden! 
   * Is only supported for some type of SONOS player.
   * @param {object} msg incoming message
   * @param {string} msg.payload - left player, will keep visible
   * @param {string} msg.playerNameRight - right player, will become invisible
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'all groups data undefined', 'player name left was not found', 
   * 'player name right was not found'
   * @throws {error} all methods
   *
   * Caution: In executeAction it should be left: playerLeftBaseUrl
   *
   */
  // eslint-disable-next-line max-len
  async function householdCreateStereoPair (msg, tsPlayer) {
    // Both player are required
    const playerLeft = validRegex(msg, 'payload', REGEX_ANYCHAR, 'player name left')
    const playerRight = validRegex(msg, 'playerNameRight', REGEX_ANYCHAR, 'player name right')

    // Verify that playerNames are valid and get the uuid
    const allGroupsData = await getGroupsAll(tsPlayer)
    if (!isTruthy(allGroupsData)) {
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
    await executeActionV7(playerLeftUrl,
      '/DeviceProperties/Control', 'CreateStereoPair',
      { 'ChannelMapSet': `${playerLeftUuid}:LF,LF;${playerRightUuid}:RF,RF` })

    return {}
  }

  /**
   *  Disable alarm in household.
   * @param {object} msg incoming message
   * @param {string/number} msg.payload alarm id, integer, not negative
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function householdDisableAlarm (msg, tsPlayer) {
    // Payload alarm id is required.
    const validAlarmId = validToInteger(msg, 'payload', 0, 10000, 'enable alarm')
    await tsPlayer.AlarmClockService.PatchAlarm({ ID: validAlarmId, Enabled: false })   
    
    return {}
  }

  /**
   *  Enable alarm in household.
   * @param {object} msg incoming message
   * @param {string/number} msg.payload alarm id, integer, not negative
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function householdEnableAlarm (msg, tsPlayer) {
    // Payload alarm id is required.
    const validAlarmId = validToInteger(msg, 'payload', 0, 10000, 'enable alarm')
    await tsPlayer.AlarmClockService.PatchAlarm({ ID: validAlarmId, Enabled: true })   
    
    return {}
  }

  /**
   *  Get household alarms.

   * @param {object} msg incoming message
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is array of all group array of members
   *
   * @throws {error} all methods
   */
  async function householdGetAlarms (msg, tsPlayer) {
    const payload = await getAlarmsAll(tsPlayer)
    return { payload }
  }

  /**
   *  Get household groups. Ignores hidden player.

   * @param {object} msg incoming message
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is array of all group array of members
   *
   * @throws {error} all methods
   */
  async function householdGetGroups (msg, tsPlayer) {
    const payload = await getGroupsAll(tsPlayer)

    return { payload }
  }

  /**
   *  Get SONOS playlists.
   * @param {object} msg incoming message
   * @param {object} tsPlayer sonos-ts player
   *
   * @returns {promise<object>} property payload is array of all sonos playlists as objects
   *
   * @throws {error} all methods
   */
  async function householdGetSonosPlaylists (msg, tsPlayer) {
    
    const payload = await getSonosPlaylists(tsPlayer)

    return { payload }
  }

  /**
   *  Remove Sonos playlist with given title. (impact on My Sonos and also Sonos playlist list)
   * @param {object} msg incoming message
   * @param {string} msg.payload title of Sonos playlist.
   * @param {boolean} [msg.ignoreNotExists] if missing assume true
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'msg.ignoreNotExists is not boolean', 
   * 'no Sonos playlist title matching search string'
   * @throws {error} all methods
   */
  async function householdRemoveSonosPlaylist (msg, tsPlayer) {
    // Payload title search string is required.
    const validatedTitle = validRegex(msg, 'payload', REGEX_ANYCHAR, 'title')

    let ignoreNotExists = true
    if (isTruthyProperty(msg, ['ignoreNotExists'])) {
      if (typeof msg.ignoreNotExists !== 'boolean') {
        throw new Error(`${PACKAGE_PREFIX}: msg.ignoreNotExists is not boolean`)
      }
      ignoreNotExists = msg.ignoreNotExist
    }

    // Using the default player of this node
    const sonosPlaylists = await getSonosPlaylists(tsPlayer)
    // Find title in playlist - exact
    const foundIndex = sonosPlaylists.findIndex((playlist) => (playlist.title === validatedTitle))
    if (foundIndex === -1) {
      if (!ignoreNotExists) {
        throw new Error(`${PACKAGE_PREFIX} no Sonos playlist title matching search string`)
      }
      //ignore and return
    } else {
      await tsPlayer.ContentDirectoryService.DestroyObject(
        { 'ObjectID': sonosPlaylists[foundIndex].id })
    }

    return {}
  }

  /**
   *  Separate group in household.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function householdSeparateGroup (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    for (let i = 1; i < groupData.members.length; i++) { // Start with 1 - coordinator is last
      // No check - always returns true
      await executeActionV7(groupData.members[i].urlObject,
        '/MediaRenderer/AVTransport/Control', 'BecomeCoordinatorOfStandaloneGroup',
        { 'InstanceID': 0 })
    }

    return {}
  }

  /**
   *  Separate a stereo pair of players. Right player will become visible again.
   * @param {object} msg incoming message
   * @param {string} msg.payload - left SONOS-Playername, is visible
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'all groups data undefined', 'channelmap is in error - right uuid', 
   * 'player name left was not found', 'player name right was not found'
   * @throws {error} all methods
   *
   */
  async function householdSeparateStereoPair (msg, tsPlayer) {
    // Player left is required
    const playerLeft = validRegex(msg, 'payload', REGEX_ANYCHAR, 'player name left')

    // Verify that playerNames are valid and get the uuid
    const allGroupsData = await getGroupsAll(tsPlayer)
    if (!isTruthy(allGroupsData)) {
      throw new Error(`${PACKAGE_PREFIX} all groups data undefined`)
    }

    let playerLeftUuid = ''
    let playerRightUuid = ''
    let playerChannelMap
    let playerUuid
    let name
    let playerLeftUrlObject // type JavaScript URL
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
            playerLeftUrlObject = allGroupsData[iGroup][iMember].urlObject
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
    await executeActionV7(playerLeftUrlObject,
      '/DeviceProperties/Control', 'SeparateStereoPair',
      { 'ChannelMapSet': `${playerLeftUuid}:LF,LF;${playerRightUuid}:RF,RF` })

    return {}
  }

  /**
   *  Household test player connection
   * @param {object} msg incoming message
   * @param {string} msg.payload SONOS player name, required!!!!
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is boolean
   *
   * Caution: sonosPlayer can not be used here as default for input.
   * It should be a "always on always available" player.
   *
   * @throws {error} 'player name (msg.${msg.payload}) is missing/invalid', 
   * 'player name (msg.${msg.payload}) is not string or empty', 'all groups data undefined'
   * @throws {error} all methods
   */
  async function householdTestPlayerOnline (msg, tsPlayer) {
    // Player name is required
    if (!isTruthyProperty(msg, ['payload'])) {
      throw new Error(`${PACKAGE_PREFIX} player name (msg.${msg.payload}) is missing/invalid`)
    }
    const playerToBeTested = msg.payload
    if (typeof playerToBeTested !== 'string' || playerToBeTested === '') {
      throw new Error(`${PACKAGE_PREFIX} player name (msg.${msg.payload}) is not string or empty`)
    }

    const allGroupsData = await getGroupsAll(tsPlayer)
    if (!isTruthy(allGroupsData)) {
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
   * @param {object} msg incoming message
   * @param {string} msg.payload notification uri.
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {string} [msg.duration] duration of notification hh:mm:ss 
   * - default is calculation, if that fails then 00:00:05
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'player (msg.player/node) is not a joiner', 
   * 'duration (msg.duration) is not a string', duration (msg.duration) is not format hh:mm:ss'
   * @throws {error} all methods
   *
   * Hints:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this player and the group shound be modified
   */
  async function joinerPlayNotification (msg, tsPlayer) {
    // Payload notification uri is required.
    const validatedUri = validRegex(msg, 'payload', REGEX_ANYCHAR, 'uri')

    // Validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

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
    if (isTruthyProperty(msg, ['duration'])) {
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
    tsCoordinator.myUuid = groupData.members[0].uuid
    const tsJoiner = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    tsJoiner.urlObject = groupData.members[groupData.playerIndex].urlObject
    
    await playJoinerNotification(tsCoordinator, tsJoiner, options)

    return {}
  }

  /**
   *  Adjust player volume and outputs new volume.
   * @param {object} msg incoming message
   * @param {string/number} msg.payload -100 to +100 integer.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property newVolume as string, range 0 ... 100
   *
   * @throws {error} all methods
   */
  async function playerAdjustVolume (msg, tsPlayer) {
    // msg.payload volume is required.
    const adjustVolume = validToInteger(msg, 'payload', -100, +100, 'adjust volume')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    const result = await ts1Player.RenderingControlService.SetRelativeVolume(
      { 'InstanceID': 0, 'Channel': 'Master', 'Adjustment': adjustVolume })

    const newVolume = result.NewVolume
    return { newVolume } // caution newVolume property!
  }

  /**
   *  Player become coordinator of standalone group.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function playerBecomeStandalone (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    
    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    await ts1Player.AVTransportService.BecomeCoordinatorOfStandaloneGroup(
      { 'InstanceID': 0 })

    return {}
  }

  /**
   *  Get player bass.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload string -10 .. 10
   *
   * @throws {error} all methods
   */
  async function playerGetBass (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    const result = await ts1Player.RenderingControlService.GetBass(
      { 'InstanceID': 0 })
    const payload = result.CurrentBass

    return { payload }
  }

  /**
   *  Get player battery level
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} battery level 0 100
   *
   * @throws {error} all methods
   */
  async function playerGetBatteryLevel (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const payload = await getDeviceBatteryLevel(
      groupData.members[groupData.playerIndex].urlObject, 1000)

    return { payload }
  }

  /**
   *  Get player button lock state.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload either On|Off
   *
   * @throws {error} all methods
   */
  async function playerGetButtonLockState (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    const result = await ts1Player.DevicePropertiesService.GetButtonLockState()
    
    const payload = result.CurrentButtonLockState.toLowerCase()
    return { payload }
  }

  /**
   *  Get player EQ data.
   * @param {object} msg incoming message + msg.nrcspCmd
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {string} msg.nrcspCmd command
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload either nightmode (on|off), 
   * subgain(nubmer), dialogLevel(on|off)
   *
   * @throws {error} 'Sonos player model name undefined', 'Selected player does not support TV',
   * 'player response is undefined`'
   * @throws {error} all methods
   *
   * EQ data are only available for specific players.
   */
  async function playerGetEq (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    ts1Player.urlObject = groupData.members[groupData.playerIndex].urlObject

    // Verify that player has a TV mode
    const deviceInfo = await getDeviceInfo(ts1Player.urlObject, TIMEOUT_HTTP_REQUEST)
    const found = deviceInfo.device.capabilities.findIndex((cap) => (cap === 'HT_PLAYBACK'))
    if (found === -1) {
      throw new Error(`${PACKAGE_PREFIX} player does not support TV`)
    }

    let args
    // No check exist needed as command has already been checked
    if (msg.nrcspCmd === 'player.get.nightmode') {
      args = { 'InstanceID': 0, 'EQType': 'NightMode' }
    } else if (msg.nrcspCmd === 'player.get.subgain') {
      args = { 'InstanceID': 0, 'EQType': 'SubGain' }
    } else if (msg.nrcspCmd === 'player.get.dialoglevel') {
      args = { 'InstanceID': 0, 'EQType': 'DialogLevel' }
    } else {
      // Can not happen
    }

    const result = await ts1Player.RenderingControlService.GetEQ(args)
    let payload = result.CurrentValue
    if (!isTruthy(payload)) {
      throw new Error(`${PACKAGE_PREFIX} player response is undefined`)
    }
    if (args.EQType !== 'SubGain') {
      payload = (payload === 1 ? 'on' : 'off')
    }
    // else SubGain is value

    return { payload }
  }

  /**
   *  Get player LED state.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload string on|off
   *
   * @throws {error} all methods
   */
  async function playerGetLed (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    // returns On or Off
    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    const result = await ts1Player.DevicePropertiesService.GetLEDState({})
    
    const payload = result.CurrentLEDState.toLowerCase()
    return { payload }
  }

  /**
   *  Get player loudness.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload string on|off
   *
   * @throws {error} all methods
   */
  async function playerGetLoudness (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    const result = await ts1Player.RenderingControlService.GetLoudness(
      { 'InstanceID': 0, 'Channel': 'Master' })
    
    const payload = (result.CurrentLoudness ? 'on' : 'off')
    return { payload }
  }

  /**
   *  Get player mute state.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise} {payload: muteState} on|off
   *
   * @throws {error} all methods
   */
  async function playerGetMute (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    const result = await ts1Player.RenderingControlService.GetMute(
      { 'InstanceID': 0, 'Channel': 'Master' })
    
    const payload = (result.CurrentMute ? 'on' : 'off')
    return { payload }
  }

  /**
   *  Get player properties.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>}  property payload is object such as uuid, playerName
   *
   * @throws {error} all methods
   */
  async function playerGetProperties (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    ts1Player.urlObject = groupData.members[groupData.playerIndex].urlObject
    const properties = await getDeviceProperties(ts1Player.urlObject)
    const payload = Object.assign({}, properties)
    payload.uuid = payload.UDN.substring('uuid:'.length)
    payload.playerName = payload.roomName

    return { payload }
  }

  /**
   *  Get players SONOS-Queue.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload is array of queue items as object
   *
   * @throws {error} all methods
   */
  async function playerGetQueue (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    ts1Player.urlObject = groupData.members[groupData.playerIndex].urlObject
    const payload = await getSonosQueueV2(ts1Player, QUEUE_REQUESTS_MAXIMUM) 

    return { payload }
  }

  /**
   *  Get players role.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload string player role.
   *
   * @throws {error} all methods
   */
  async function playerGetRole (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
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
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload string -10 .. 10
   *
   * @throws {error} all methods
   */
  async function playerGetTreble (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    const result = await ts1Player.RenderingControlService.GetTreble(
      { 'InstanceID': 0 })

    const payload = result.CurrentTreble
    return { payload }
  }

  /**
   *  Get player volume.
   * @param {object} msg incoming message
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} property payload string range 0 .. 100
   *
   * @throws {error} all methods
   */
  async function playerGetVolume (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    const result = await ts1Player.RenderingControlService.GetVolume(
      { 'InstanceID': 0, 'Channel': 'Master' })
    
    const payload = result.CurrentVolume
    return { payload }
  }

  /**
   *  Player (from config node or msg.playerName) will join group of player in payload. 
   * @param {object} msg incoming message
   * @param {string} msg.payload SONOS name of any player in the target group
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * Details: if coordinator: will leave old group and join new group.
   * If already in that group - it will just continue.
   * if coordinator of that group - no action and continue
   *
   * @throws {error} all methods
   */
  async function playerJoinGroup (msg, tsPlayer) {
    // Payload a playername in target group is required
    const validatedGroupPlayerName = validRegex(msg, 'payload', REGEX_ANYCHAR, 'group player name')

    // Get coordinator uri/rincon of the target group
    const groupDataToJoin = await getGroupCurrent(tsPlayer, validatedGroupPlayerName)
    const coordinatorRincon = `x-rincon:${groupDataToJoin.members[0].uuid}`

    // Get playerName and URL origin of joiner (playerName or config node)
    const validated = await validatedGroupProperties(msg)
    const groupDataJoiner = await getGroupCurrent(tsPlayer, validated.playerName)

    if (
      groupDataJoiner.members[groupDataJoiner.playerIndex].playerName
      !== groupDataToJoin.members[0].playerName) {
      // No check - always returns true. We use SetAVTransport as AddMember does not work

      await executeActionV7(groupDataJoiner.members[groupDataJoiner.playerIndex].urlObject,
        '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
        { 'InstanceID': 0, 'CurrentURI': coordinatorRincon, 'CurrentURIMetaData': '' })
    } // Else: do nothing - either playerName is already coordinator

    return {}
  }

  /**
   *  Player play AVTransport uri: LineIn, TV, or streams.
   * @param {object} msg incoming message
   * @param {string} msg.payload uri x-***:
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   * 
   * @deprecated recommendation is to use group.play.queue, player.play.linein, player.play.tv
   * or the group.play.* commands. 
   * 
   * why depreciated: for some streams metadata are needed and have to be "guessed". For some 
   * such as Tunein it works fine but many are still open. Using My Sonos is much better!
   *
   * @throws {error} all methods
   *
   */
  async function playerPlayAvtransport (msg, tsPlayer) {
    // Payload uri is required: eg x-rincon-stream:RINCON_5CAAFD00223601400 for line in
    const validatedUri = validRegex(msg, 'payload', REGEX_ANYCHAR, 'uri')

    // Validate msg.playerName, msg.volume
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    // eslint-disable-next-line max-len   
    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    ts1Player.urlObject = groupData.members[groupData.playerIndex].urlObject
    
    await ts1Player.SetAVTransportURI(validatedUri)

    if (validated.volume !== -1) {
      await ts1Player.SetVolume(validated.volume)
    }
    await ts1Player.Play()
  
    return {}
  }

  /**
   *  Player play line in - if supported by player.
   * @param {object} msg incoming message
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'player does not support line in'
   * @throws {error} all methods
   *
   */
  async function playerPlayLineIn (msg, tsPlayer) {
    // Validate msg.playerName, msg.volume
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    ts1Player.urlObject = groupData.members[groupData.playerIndex].urlObject
    // Get the device info, check whether line in is supported and get uuid
    const deviceInfo = await getDeviceInfo(ts1Player.urlObject, TIMEOUT_HTTP_REQUEST)
    const found = deviceInfo.device.capabilities.findIndex((cap) => (cap === 'LINE_IN'))
    if (found >= 0) {
      // get uuid
      const uuid = deviceInfo.device.id
      // No check - always returns true - will play automatically
      await ts1Player.AVTransportService.SetAVTransportURI(
        {
          'InstanceID': 0, 'CurrentURI': `x-rincon-stream:${uuid}`, 'CurrentURIMetaData': ''
        })
      if (validated.volume !== -1) {
        await ts1Player.SetVolume(validated.volume)
      }
    } else {
      throw new Error(`${PACKAGE_PREFIX} player does not support line in`)
    }

    return {}
  }

  /**
   *  Player play TV - if supported by player.
   * @param {object} msg incoming message
   * @param {number/string} [msg.volume] volume - if missing do not touch volume
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'player does not support TV'
   * @throws {error} all methods
   *
   */
  async function playerPlayTv (msg, tsPlayer) {
    // Validate msg.playerName, msg.volume
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    // eslint-disable-next-line max-len
    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    ts1Player.urlObject = groupData.members[groupData.playerIndex].urlObject
    // Get the device info, check whether TV is supported and get uuid
    const deviceInfo = await getDeviceInfo(ts1Player.urlObject, TIMEOUT_HTTP_REQUEST)
    const found = deviceInfo.device.capabilities.findIndex((cap) => (cap === 'HT_PLAYBACK'))
    if (found >= 0) {
      // get uuid
      const uuid = deviceInfo.device.id
      // No check - always returns true - will play automatically
      await ts1Player.AVTransportService.SetAVTransportURI(
        {
          'InstanceID': 0, 'CurrentURI': `x-sonos-htastream:${uuid}:spdif`,
          'CurrentURIMetaData': ''
        })
      
      if (validated.volume !== -1) {
        await ts1Player.SetVolume(validated.volume)
      }
    } else {
      throw new Error(`${PACKAGE_PREFIX} player does not support TV`)
    }

    return {}
  }

  /**
   *  Set player bass.
   * @param {object} msg incoming message
   * @param {string/number} msg.payload-10 to +10 integer.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function playerSetBass (msg, tsPlayer) {
    // Payload bass is required.
    const newBass = validToInteger(msg, 'payload', -10, +10, 'set bass')
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    await ts1Player.RenderingControlService.SetBass(
      { 'InstanceID': 0, 'DesiredBass': newBass })

    return {}
  }

  /**
   *  Set player button lock state.
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function playerSetButtonLockState (msg, tsPlayer) {
    //msg.payload button state is required - convert to On Off
    const newState = (isOnOff(msg, 'payload', 'button lock state') ? 'On' : 'Off')
     
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    
    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    await ts1Player.DevicePropertiesService.SetButtonLockState(
      { 'DesiredButtonLockState': newState })
    return {}
  }

  /**
   *  Set player EQ type
   * @param {object} msg incoming message, uses msg.nrcspCmd
   * @param {string} msg.nrcspCmd the lowercase, player.set.nightmode/subgain/dialoglevel
   * @param {string} msg.payload value on,off or -15 .. 15 in case of subgain
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} 'Sonos player model name undefined', 'Selected player does not support TV'
   * @throws {error} all methods
   */
  async function playerSetEQ (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    ts1Player.urlObject = groupData.members[groupData.playerIndex].urlObject

    // Verify that player has a TV mode
    const deviceInfo = await getDeviceInfo(ts1Player.urlObject, TIMEOUT_HTTP_REQUEST)
    const found = deviceInfo.device.capabilities.findIndex((cap) => (cap === 'HT_PLAYBACK'))
    if (found === -1) {
      throw new Error(`${PACKAGE_PREFIX} player does not support TV`)
    }

    let eqType
    let eqValue
    // No check exist needed as command has already been checked
    if (msg.nrcspCmd === 'player.set.nightmode') {
      eqType = 'NightMode'
      eqValue = isOnOff(msg, 'payload', 'nightmode') // Required
      eqValue = (eqValue ? 1 : 0)
    } else if (msg.nrcspCmd === 'player.set.subgain') {
      eqType = 'SubGain'
      eqValue = validToInteger(msg, 'payload', -15, 15, 'subgain') // Required
    } else if (msg.nrcspCmd === 'player.set.dialoglevel') {
      eqType = 'DialogLevel'
      eqValue = isOnOff(msg, 'payload', 'dialoglevel') // Required
      eqValue = (eqValue ? 1 : 0)
    } else {
      // Can not happen
    }
    await ts1Player.RenderingControlService.SetEQ(
      { 'InstanceID': 0, 'EQType': eqType, 'DesiredValue': eqValue })

    return {}
  }

  /**
   *  Set player led on|off.
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off
   * @param {string} [msg.playerName = using tslayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function playerSetLed (msg, tsPlayer) {
    // msg.payload Led state is required - convert to On Off
    const newState = (isOnOff(msg, 'payload', 'led state') ? 'On' : 'Off')

    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    await ts1Player.DevicePropertiesService.SetLEDState(
      { 'DesiredLEDState': newState })

    return {}
  }

  /**
   *  Set player loudness on|off.
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function playerSetLoudness (msg, tsPlayer) {
    // msg.payload is required
    const newState = isOnOff(msg, 'payload', 'loudness state')

    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    await ts1Player.RenderingControlService.SetLoudness(
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredLoudness': newState })

    return {}
  }

  /**
   *  Set player mute state.
   * @param {object} msg incoming message
   * @param {string} msg.payload on|off.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function playerSetMute (msg, tsPlayer) {
    // Payload mute state is required.
    const newState = isOnOff(msg, 'payload', 'mute state')

    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    await ts1Player.RenderingControlService.SetMute(
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredMute': newState })

    return {}
  }

  /**
   *  Set player treble.
   * @param {object} msg incoming message
   * @param {string/number} msg.payload -10 to +10 integer.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function playerSetTreble (msg, tsPlayer) {
    // Payload volume is required.
    const newTreble = validToInteger(msg, 'payload', -10, +10, 'set treble')

    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    await ts1Player.RenderingControlService.SetTreble(
      { 'InstanceID': 0, 'DesiredTreble': newTreble })

    return {}
  }

  /**
   *  Set player volume.
   * @param {object} msg incoming message
   * @param {number/string} msg.payload, integer 0 .. 100 integer.
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function playerSetVolume (msg, tsPlayer) {
    // Payload volume is required.
    const validatedVolume = validToInteger(msg, 'payload', 0, 100, 'set volume')
    const validatedPlayerName = validRegex(msg, 'playerName', REGEX_ANYCHAR,
      'player name', '')
    const groupData = await getGroupCurrent(tsPlayer, validatedPlayerName)

    const ts1Player = new SonosDevice(groupData.members[groupData.playerIndex].urlObject.hostname)
    await ts1Player.RenderingControlService.SetVolume(
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredVolume': validatedVolume })

    return {}
  }

  /**
   *  Test without getGroupCurrent
   * @param {object} msg incoming message
   * @param {string} msg.endpoint 
   * @param {string} msg.action
   * @param {object} msg.inArgs
   * @param {object} tsPlayer sonos-ts player 
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function playerTest (msg, tsPlayer) {
    
    // Stephan 
    const payload = await tsPlayer.AVTransportService.GetPositionInfo({ InstanceID: 0 })
    return { payload }
  }

  /**
   *  Test action
   * @param {object} msg incoming message
   * @param {string} msg.endpoint 
   * @param {string} msg.action
   * @param {object} msg.inArgs
   * @param {string} [msg.playerName = using tsPlayer] SONOS-Playername
   * @param {object} tsPlayer sonos-ts player with .urlObject as Javascript build-in URL
   *
   * @returns {promise<object>} {}
   *
   * @throws {error} all methods
   */
  async function playerExecuteActionV7 (msg, tsPlayer) {
    const validated = await validatedGroupProperties(msg)
    const groupData = await getGroupCurrent(tsPlayer, validated.playerName)
    const { endpoint, action, inArgs } = msg.payload
    const payload = await executeActionV7(groupData.members[groupData.playerIndex].urlObject,
      endpoint, action, inArgs)
    
    return { payload }
  }

  RED.nodes.registerType('sonos-universal', SonosUniversalNode)
}
