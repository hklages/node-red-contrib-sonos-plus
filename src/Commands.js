/**
 * Collection of more complex SONOS commands.
 * - notification and snapshot such as playGroupNotification
 * - group related such as getGroupCurrent
 * - content related such as getMySonos
 *
 * @module Sonos-Commands
 * 
 * @author Henning Klages
 * 
 */ 

'use strict'

const { PACKAGE_PREFIX } = require('./Globals.js')

const {
  extractGroup, getMediaInfo,
  getUpnpClassEncoded, guessProcessingType, parseBrowseToArray,
  parseZoneGroupToArray, parseAlarmsToArray
} = require('./Extensions.js')

const { encodeHtmlEntity, hhmmss2msec, isTruthy, isTruthyProperty, validPropertyRequiredRegex
} = require('./Helper.js')

const { REGEX_ANYCHAR
} = require('./Globals.js')

const { MetaDataHelper, SonosDevice } = require('@svrooij/sonos/lib')

const debug = require('debug')(`${PACKAGE_PREFIX}commands`)

module.exports = {

  //
  //     NOTIFICATION & SNAPSHOT 
  //     

  /**  Play notification on an existing group.
   * @param {tsPlayer[]} tsPlayerArray sonos-ts player array with JavaScript build-in URL urlObject.
   *               Coordinator has index 0. Length = 1 is allowed.
   * @param {object} options options
   * @param {string} options.uri uri to be used as notification
   * @param {string} options.volume volume during notification - if -1 don't use, range 1 .. 99
   * @param {boolean} options.sameVolume all player in group play at same volume level
   * @param {boolean} options.automaticDuration true: duration will be received from player
   * @param {string} [options.duration] format hh:mm:ss, only required if automaticDuration = false
   * 
   * @returns {promise} true
   * 
   * @throws {error} all methods
   */

  playGroupNotification: async (tsPlayerArray, options) => {
    debug('method:%s', 'playGroupNotification')
    const WAIT_ADJUSTMENT = 1000 // milliseconds
    const DEFAULT_DURATION = '00:00:15'

    // Generate metadata if not provided
    if (!isTruthyProperty(options, ['uri'])) {
      throw new Error(`${PACKAGE_PREFIX} uri is missing`)
    }
    const track = await MetaDataHelper.GuessTrack(options.uri)
    let metadata = await MetaDataHelper.TrackToMetaData(track)
    metadata = (metadata !== '' ? await encodeHtmlEntity(metadata) : '')
    debug('Info: metadata >>%s' + JSON.stringify(metadata))

    // Create snapshot state/volume/content but not the queue
    // SONOS-Queue is not snapshot because usually it is not changed.
    const snapShot = await module.exports.createGroupSnapshot(tsPlayerArray, {
      snapVolumes: true,  // simplification - only necessary in some cases
      snapMutes: false, // dont save the mutestates of each player
      sonosPlaylistName: null // dont save the SONOS-Queue
    })
    debug('Info: Snapshot created')
    
    // Set AVTransport on coordinator
    const iCoord = 0
    const uri = await encodeHtmlEntity(options.uri)
    await tsPlayerArray[iCoord].AVTransportService.SetAVTransportURI({
      InstanceID: 0, CurrentURI: uri, CurrentURIMetaData: metadata
    })

    // Set volume and play on coordinator
    if (options.volume !== -1) {
      debug('Info: using same volume >>%s', options.sameVolume)
      if (options.sameVolume) { // all player including coordinator
        for (const tsPlayer of tsPlayerArray) {
          await tsPlayer.SetVolume(options.volume)
        }
      } else {
        await tsPlayerArray[iCoord].SetVolume(options.volume) // coordinator only
      }
    }
    await tsPlayerArray[iCoord].Play()
    debug('Info: Playing notification started')

    // Coordinator waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = hhmmss2msec(DEFAULT_DURATION)
    if (options.automaticDuration) {
      const positionInfo = await tsPlayerArray[iCoord].AVTransportService.GetPositionInfo()
      if (isTruthyProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = hhmmss2msec(positionInfo.TrackDuration) + WAIT_ADJUSTMENT
        debug('Info: Using duration received from SONOS player')
      } else {
        debug('Info: Could NOT retrieve duration from SONOS player - using default') 
      }
    } else {
      if (isTruthyProperty(options, ['duration'])) {
        waitInMilliseconds = hhmmss2msec(options.duration)
      } else {
        debug('Error: options.duration is not set but needed - using default') 
      }
    }
    debug('Info: using duration >>%s', JSON.stringify(waitInMilliseconds))
    await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](waitInMilliseconds)
    debug('Info: notification finished')

    // Return to previous state = restore snapshot (does not play)
    await module.exports.restoreGroupSnapshot(snapShot)
    debug('Info: snapshot restored')

    // vli can not be recovered
    if (snapShot.wasPlaying) {
      if (!options.uri.includes('x-sonos-vli')) {
        await tsPlayerArray[iCoord].Play()
      } else {
        debug('Info: Stream can not be played >>%s:', JSON.stringify(options.uri))
      }
    }
  },

  /**  Play notification on a single joiner (must not be coordinator).
   * Original group continues playing (if playing). If duration is not 
   * specified or can not be calculated the default 15 sec is used.
   * @param {object} tsJoiner node-sonos player in group with url
   * @param {string} coordinatorUuid coordinator uuid - used for grouping
   * @param {object} options options
   * @param {string} options.uri uri to be used as notification
   * @param {string} options.volume volume during notification - if -1 don't use, range 1 .. 99
   * @param {boolean} options.automaticDuration true: duration will be received from player
   * @param {string} [options.duration] format hh:mm:ss, only required if automaticDuration = false
   * @returns {promise} true
   *
   * @throws {error} all methods
   *
   * Hint: joiner will leave group, play notification and rejoin the group. 
   */

  playJoinerNotification: async (tsJoiner, coordinatorUuid, options) => {
    debug('method:%s', 'playJoinerNotification')
    const WAIT_ADJUSTMENT = 1000 // milliseconds
    const DEFAULT_DURATION = '00:00:15'

    // Generate metadata if not provided
    if (!isTruthyProperty(options, ['uri'])) {
      throw new Error(`${PACKAGE_PREFIX} uri is missing`)
    }
    const track = await MetaDataHelper.GuessTrack(options.uri)
    let metadata = await MetaDataHelper.TrackToMetaData(track)
    metadata = (metadata !== '' ? await encodeHtmlEntity(metadata) : '')
    debug('Info: metadata >>%s' + JSON.stringify(metadata))

    // No full snapshot needed as the original group does not change
    let joinerVolume 
    if (options.volume !== -1) { 
      const result = await tsJoiner.RenderingControlService.GetVolume(
        { 'InstanceID': 0, 'Channel': 'Master' })
      joinerVolume = result.CurrentVolume
    }

    // Set AVTransport on joiner - joiner will automatically leave group!
    const uri = await encodeHtmlEntity(options.uri)
    await tsJoiner.AVTransportService.SetAVTransportURI({
      InstanceID: 0, CurrentURI: uri, CurrentURIMetaData: metadata
    })

    // Set joiner volume if requested
    if (options.volume !== -1) {
      await tsJoiner.SetVolume(options.volume)
      debug('Info: new volume set')
    }
    await tsJoiner.Play()
    debug('Info: Playing notification started')

    // Joiner: waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = hhmmss2msec(DEFAULT_DURATION)
    if (options.automaticDuration) {
      const positionInfo = await tsJoiner.AVTransportService.GetPositionInfo()
      if (isTruthyProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = hhmmss2msec(positionInfo.TrackDuration) + WAIT_ADJUSTMENT
        debug('Info: Using duration received from SONOS player')
      } else {
        debug('Info: Could NOT retrieve duration from SONOS player - using default') 
      }
    } else {
      if (isTruthyProperty(options, ['duration'])) {
        waitInMilliseconds = hhmmss2msec(options.duration)
      } else {
        debug('Error: options.duration is not set but needed - using default') 
      }
    }
    debug('duration >>' + JSON.stringify(waitInMilliseconds))
    await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](waitInMilliseconds)
    debug('Info: notification finished')

    // Return to previous state
    if (options.volume !== -1) { 
      await tsJoiner.SetVolume(joinerVolume)
    }
    const coordinatorRincon = `x-rincon:${coordinatorUuid}`
    await tsJoiner.AVTransportService.SetAVTransportURI(
      { 'InstanceID': 0, 'CurrentURI': coordinatorRincon, 'CurrentURIMetaData': '' }
    )
    debug('Info: restored')

  },

  /**
   * @typedef {object} Snapshot snapshot of group
   * @global
   * @property {boolean} wasPlaying 
   * @property {string} playbackstate such stop, playing, ...
   * @property {string} CurrentURI content
   * @property {string} CurrentURIMetadata content meta data
   * @property {string} NrTracks tracks in queue
   * @property {number} Track current track
   * @property {string} TrackDuration duration hh:mm:ss
   * @property {string} RelTime position hh:mm:ss
   * @property {string} sonosPlaylistName  null or SONOS-Playlist if provided
   * @property {string} playlistObjectId null if queue empty
   * 
   * @property {member[]} membersData array of members in a group
   * @property {object} member group members relevant data
   * @property {string} member.urlSchemeAuthority such as http://192.168.178.37:1400/
   * @property {string} member.mutestate null for not available, otherwise on\|off
   * @property {integer} member.volume null for not available, range 0 to 100
   * @property {string} member.playerName SONOS-Playername
  
   * 
   * If the SONOS-Queue is empty and there is a request to save it to a SONOS-Playlist
   * then the playlistObjectId is set to null! SONOS des not support to save an empty SONOS-QUEUE!
   */

  /**  Creates snapshot of the current group: playbackstate, content, SONOS-Queue, track, position.
   * Volume, mutestate of all players in group, but not the group structure itself.
   * In case of an empty SONOS-Queue, the playlistObjectId is set to null.
   * @param {player[]} playersInGroup player data in group, coordinator at 0 
   * @param {object} player player 
   * @param {object} player.urlObject player JavaScript build-in URL
   * @param {string} player.playerName SONOS-Playername
   * @param {object} options
   * @param {boolean} options.snapVolumes if true capture all players volume
   * @param {boolean} options.snapMutestates if true capture all players mute state
   * @param {string} options.sonosPlaylistName if not null store queue in a SONOS-Playlist
   * 
   * @returns {promise<Snapshot>} group snapshot object
   * 
   * @throws {error} all methods, ... wrong syntax
  */
  createGroupSnapshot: async (playersInGroup, options) => {
    debug('method:%s', 'createGroupSnapshot')
    const snapshot = {}
    snapshot.membersData = []
  
    // Mutestate and volume of all players
    for (const player of playersInGroup) {
      const member = { // default
        // urlSchemaAuthority because it maybe stored in flow variable
        urlSchemeAuthority: player.urlObject.origin,
        mutestate: null,
        volume: null,
        playerName: player.playerName
      }
      const tsPlayer = new SonosDevice(player.urlObject.hostname)
      if (options.snapVolumes) {
        const result = await tsPlayer.RenderingControlService.GetVolume(
          { 'InstanceID': 0, 'Channel': 'Master' })
        member.volume = result.CurrentVolume // number!
      }
      if (options.snapMutestates) {
        const result = await tsPlayer.RenderingControlService.GetMute(
          { 'InstanceID': 0, 'Channel': 'Master' })
        member.mutestate = (result.CurrentMute ? 'on' : 'off')
      }
      snapshot.membersData.push(member)
    }

    const iCoord = 0
    const coordinatorUrlObject = playersInGroup[iCoord].urlObject
    const tsCoordinator = new SonosDevice(coordinatorUrlObject.hostname)

    // Is queue empty? We just fetch 1 = RequestedCount to test
    const SONOS_QUEUE_OBJECTID = 'Q:0'
    const browseQueue = await tsCoordinator.ContentDirectoryService.Browse({
      'ObjectID': SONOS_QUEUE_OBJECTID, 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': 1, 'SortCriteria': ''
    })
    if (browseQueue.TotalMatches === 0) {
      // Queue is empty
      snapshot.playlistObjectId = null //
    } else {
      // Save non empty SONOS-Queue to SONOS-Playlist
      // If already exist a SONOS-Playlist with same name create new with different objectId
      if (options.sonosPlaylistName !== null) {
        const result = await tsCoordinator.AVTransportService.SaveQueue(
          { 'InstanceID': 0, 'Title': options.sonosPlaylistName, 'ObjectID': '' }) 
        snapshot.playlistObjectId = result.AssignedObjectID
      }
    }
    snapshot.sonosPlaylistName = options.sonosPlaylistName // in any case
    
    // Content (MediaInfo, PositionInfo), playbackstate of coordinator
    const transportInfoObject = await tsCoordinator.AVTransportService.GetTransportInfo({
      InstanceID: 0
    })
    snapshot.playbackstate = transportInfoObject.CurrentTransportState.toLowerCase()
    snapshot.wasPlaying = (snapshot.playbackstate === 'playing'
      || snapshot.playbackstate === 'transitioning')
    // Caution: CurrentUriMetadata as string not as object! Thats important!
    const mediaData = await getMediaInfo(coordinatorUrlObject)
    Object.assign(snapshot,
      {
        'CurrentURI': mediaData.CurrentURI,
        'CurrentURIMetadata': mediaData.CurrentURIMetaData, // DIDL string
        'NrTracks': mediaData.NrTracks
      })
    const positionData = await tsCoordinator.AVTransportService.GetPositionInfo({ InstanceID: 0 })
    // The following are only useful in case of a queue, but we store it in any case. 
    Object.assign(snapshot,
      {
        'Track': positionData.Track, // number
        'RelTime': positionData.RelTime, // string h:mm:ss
        'TrackDuration': positionData.TrackDuration // string h:mm:ss
      })
    return snapshot
  },

  /**  Restore snapshot of group. Group topology must be the same! Does NOT play!
 * @param {object<Snapshot>} snapshot - see typedef
 
 * @returns {promise} true
 *
 * @throws if invalid response from SONOS player
 */
  restoreGroupSnapshot: async (snapshot) => {
    debug('method:%s', 'restoreGroupSnapshot')

    const WAIT_FOR_QUEUE = 300 // Restore the SONOS-Queue
    const WAIT_FOR_SETAV = 500 // content needs time to finish
    const WAIT_FOR_TRACK = 100 // track position needs time to finish
    
    const iCoord = 0 // coordinator is always at position 0
    const coordinatorUrlObject = new URL(snapshot.membersData[iCoord].urlSchemeAuthority)
    const tsCoordinator = new SonosDevice(coordinatorUrlObject.hostname)
   
    // Restore SONOS-Queue if it was requested
    if (snapshot.sonosPlaylistName !== null) {
      // in any case we have to clear the queue because it might have been modified
      await tsCoordinator.AVTransportService.RemoveAllTracksFromQueue()
      if (snapshot.playlistObjectId !== null) {
        // restore SONOS-Queue from SONOS-Playlist with given objectId
        const objectIdCount = snapshot.playlistObjectId.replace('SQ:', '')
        const uri = `file:///jffs/settings/savedqueues.rsq#${objectIdCount}`
        await tsCoordinator.AddUriToQueue(uri, 0, true)
        await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](WAIT_FOR_QUEUE)
      }
    }

    // Restore content, urlSchemeAuthority because we do create/restore
    // vli means managed by an external app such as spotifiy, not restorable
    const uri = snapshot.CurrentURI
    if (!uri.includes('x-sonos-vli')) {
      await tsCoordinator.AVTransportService.SetAVTransportURI({
        InstanceID: 0, CurrentURI: uri,
        CurrentURIMetaData: snapshot.CurrentURIMetadata
      })
    } else {
      debug('content could not be restored >>type x-sonos-vli')
      return true
    }
    let track = 0 // 0 for undefined track - dont restore
    if (isTruthyProperty(snapshot, ['Track'])) {
      track = parseInt(snapshot['Track'])
    }
    let nrTracks = 0 
    if (isTruthyProperty(snapshot, ['NrTracks'])) {
      nrTracks = parseInt(snapshot['NrTracks'])
    }
    if (track >= 1 && nrTracks >= track) {
      debug('Setting track to >>%s', snapshot.Track)
      // Wait for SetAVTransportURI being competed then restore track
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](WAIT_FOR_SETAV)
      await tsCoordinator.SeekTrack(track)
        .catch(() => {
          debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.RelTime && snapshot.TrackDuration !== '0:00:00') {
      // Wait then restore track position
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](WAIT_FOR_TRACK)
      debug('Setting back time to >>%', snapshot.RelTime)
      await tsCoordinator.SeekPosition(snapshot.RelTime)
        .catch(() => {
          debug('Reverting back track time failed, happens for some music services.')
        })
    }

    // Restore volume/mute if captured.
    for (const member of snapshot.membersData) {
      const urlObject = new URL(member.urlSchemeAuthority)
      const ts1Player = new SonosDevice(urlObject.hostname)
      const volume = member.volume
      
      if (volume !== null) { 
        await ts1Player.RenderingControlService.SetVolume(
          { 'InstanceID': 0, 'Channel': 'Master', 'DesiredVolume': volume.toString() })
      }

      const mutestate = member.mutestate
      if (mutestate !== null) {
        await ts1Player.RenderingControlService.SetMute(
          { 'InstanceID': 0, 'Channel': 'Master', 'DesiredMute': (mutestate === 'on') }) 
      }
    }
  
    return true
  },

  //
  //     GROUP RELATED
  //  

  /** Get hostname of selected SONOS-Player.
   * @param {object} msg NODE-RED incoming message object
   * @param {string} msg.playerName the SONOS-Player - optional
   * @param {string} tsPlayer sonos-ts player
  
   * @returns {promise<string>} hostname
  
   * @throws {error} methods getGroupCurrent, validPropertyRequiredRegex
   */
  getSelectedPlayerHostname: async (msg, tsPlayer) => {
    debug('method:%s', 'getSelectedPlayerHostname')
    let selectedHostname = tsPlayer.urlObject.hostname
    if (isTruthyProperty(msg, ['playerName'])) {
      // for future use - currently it only checks for string as we use REGEX_ANYCHAR
      const optionalPlayerName = validPropertyRequiredRegex(msg, 'playerName', REGEX_ANYCHAR)  
      const groupData = await module.exports.getGroupCurrent(tsPlayer, optionalPlayerName)
      selectedHostname = groupData.members[groupData.playerIndex].urlObject.hostname
    } 

    return selectedHostname
  },

  /** Get hostname of coordinator in selected group.
   * @param {object} msg NODE-RED incoming message object
   * @param {string} msg.playerName the SONOS-Player - optional
   * @param {string} tsPlayer sonos-ts player
  
   * @returns {promise<string>} coordinator hostname
  
   * @throws {error} methods getGroupCurrent, validPropertyRequiredRegex
   */
  getCoordinatorHostname: async (msg, tsPlayer) => {
    debug('method:%s', 'getCoordinatorHostname')
    
    let groupData
    if (isTruthyProperty(msg, ['playerName'])) {
      // for future use - currently it only checks for string as we use REGEX_ANYCHAR
      const optionalPlayerName = validPropertyRequiredRegex(msg, 'playerName', REGEX_ANYCHAR)  
      groupData = await module.exports.getGroupCurrent(tsPlayer, optionalPlayerName)
    } else {
      groupData = await module.exports.getGroupCurrent(tsPlayer)
    }

    return groupData.members[groupData.members[0].urlObject.hostname]  // coordinator hostname
  },

  /** Get group data for a given player.
   * @param {string} tsPlayer sonos-ts player
   * @param {string} [playerName] SONOS-Playername such as Kitchen 
   * 
   * @returns {promise<object>} returns object:
   * { groupId, playerIndex, coordinatorIndex, members[]<playerGroupData> } 
   *
   * @throws {error} all methods
   */
  getGroupCurrent: async (tsPlayer, playerName) => {
    debug('method:%s', 'getGroupCurrent')
    const allGroups = await module.exports.getGroupsAll(tsPlayer)
    const thisGroup = await extractGroup(tsPlayer.urlObject.hostname, allGroups, playerName)

    return thisGroup
  },
  
  /**
   * @typedef {object} playerGroupData group data transformed
   * @global
   * @property {object} urlObject JavaScript URL object
   * @property {string} playerName SONOS-Playername such as "Küche"
   * @property {string} uuid such as RINCON_5CAAFD00223601400
   * @property {string} groupId such as RINCON_5CAAFD00223601400:482
   * @property {boolean} invisible false in case of any bindings otherwise true
   * @property {string} channelMapSet such as
   *                    RINCON_000E58FE3AEA01400:LF,LF;RINCON_B8E9375831C001400:RF,RF
   *                    is used for stereo pair
   * @property {string} HTSatChanMapSet such as
   *                    RINCON_x01400:LF,RF;RINCON_x01400:RR;RINCON_x01400:LR;RINCON_x01400:SW
   *                    is used for surround system 5.1 
   * 
   */

  /** Get array of all groups. Each group consist of an array of players <playerGroupData>[]
   * Coordinator is always in position 0. Group array may have size 1 (standalone)
   * @param {object} player sonos-ts player
   * @param {boolean} removeHidden removes all hidden players  
   * 
   * @returns {promise<playerGroupData[]>} array of arrays with playerGroupData
   *          First group member is coordinator
   *
   * @throws {error} 'property ZoneGroupState is missing'
   * @throws {error} all methods
   */
  getGroupsAll: async (anyTsPlayer, removeHidden) => {
    debug('method:%s', 'getGroupsAll')
    
    // Get all groups
    const householdGroups = await anyTsPlayer.ZoneGroupTopologyService.GetZoneGroupState({})   
    if (!isTruthyProperty(householdGroups, ['ZoneGroupState'])) {
      throw new Error(`${PACKAGE_PREFIX} property ZoneGroupState is missing`)
    }
    
    return await parseZoneGroupToArray(householdGroups.ZoneGroupState, removeHidden) 
  },

  /** Set volume on members in a group. Does not do anything if volume = -1.
   * @property {object[]} members array of playerGroupData
   * @property {number} playerIndex the key to major player, integer 0, members.length
   * @property {number} volume new volume, integer 0 .. 100 or -1 means no change
   * @property {boolean} everywhere set volume on every player
   * 
   * @returns {promise<true>} 
   *
   * @throws {error} all methods
   */
  setVolumeOnMembers: async (members, playerIndex, volume, everywhere) => {
    debug('method:%s', 'setVolumeOnMembers')
  
    if (volume !== -1) {
      debug('changing volumes')
      if (everywhere) { // set all player
        debug('changing volumes everywhere')
        for (const member of members) {
          const tsPlayer = new SonosDevice(member.urlObject.hostname)
          await tsPlayer.SetVolume(volume)
        }
      } else { // Set only one player
        const tsPlayer = new SonosDevice(members[playerIndex].urlObject.hostname)
        await tsPlayer.SetVolume(volume)
      }
    }
  
    return true
  },

  //
  //     ALARMS RELATED
  //     .
  /**
  /** Get alarm list version and array of all alarms. 
   * @param {object} player sonos-ts player
   * 
   * @returns {promise<object>} Alarms object: {}
   *
   * @throws {error} all methods
   * @throws {error} illegal response from ListAlarm - CurrentAlarmList|CurrentAlarmListVersion
   */
  getAlarmsAll: async (anyTsPlayer) => {
    debug('method:%s', 'getAlarmsAll')
    
    const result = await anyTsPlayer.AlarmClockService.ListAlarms({})
    if (!isTruthyProperty(result, ['CurrentAlarmList'])) {
      throw new Error(`${PACKAGE_PREFIX} illegal response from ListAlarm - CurrentAlarmList`)
    }
    if (!isTruthyProperty(result, ['CurrentAlarmListVersion'])) {
      throw new Error(`${PACKAGE_PREFIX} illegal response from ListAlarm - CurrentAlarmListVersion`)
    }
    const alarms = await parseAlarmsToArray(result.CurrentAlarmList)
    const alarmsObject = {
      'currentAlarmListVersion': result.CurrentAlarmListVersion,
      alarms
    }

    return alarmsObject
  },

  //
  //     CONTENT RELATED
  //     
  /**
  * Transformed data of Browse action response. 
  * @global
  * @typedef {object} DidlBrowseItem
  * @property {string} id object id, can be used in Browse command 
  * @property {string} title title 
  * @property {string} artist='' artist
  * @property {string} album='' album
  * @property {string} description=''
  * @property {string} uri='' AVTransportation URI
  * @property {string} metadata='' metadata usually in DIDL Lite format
  * @property {string} artUri='' URI of cover, if available
  * @property {string} sid='' music service id (derived from uri)
  * @property {string} serviceName='' music service name such as Amazon Music (derived from uri)
  * @property {string} upnpClass='' UPnP Class (derived from uri or upnp class)
  * @property {string} processingType='' can be 'queue', 'stream', 'unsupported' or empty
  */

  /** Get array of all My Sonos Favorite items including SonosPlaylists - special imported playlists
   * @param {object} tsPlayer sonos-ts player
   *
   * @returns {Promise<DidlBrowseItem[]>} all My Sonos items as array (except SONOS-Playlists)
   *
   * @throws {error} all methods
   * 
   * In the SONOS app you can "import all Music Library Playlists" 
   * (Browse,  MusicLibrary, Imported playlists, dot-menu, add to my sonos). These then show up 
   * under My Sonos own category "Imported Playlist". These are currently not supported and choosing
   * "Imported" as search string will show error - undefined uri. Items are result fo A:PLAYLISTS
   * But you can add these single items to My Sonos category Playlists. Then it works.
   */ 
  getMySonos: async (tsPlayer) =>  { 
    debug('method:%s', 'getMySonos')

    const REQUESTED_COUNT_MYSONOS = 1000 // always fetch the allowed maximum

    // FV:2 = Favorites 
    // Assumption: less then 1000 items - otherwise we have to iterate (see MusicLibrary)
    const favorites = await tsPlayer.ContentDirectoryService.Browse({
      'ObjectID': 'FV:2', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*', 'StartingIndex': 0,
      'RequestedCount': REQUESTED_COUNT_MYSONOS, 'SortCriteria': ''
    })

    const itemArray = await parseBrowseToArray(favorites, 'item')
    // add several properties
    const transformedItems = await Promise.all(itemArray.map(async (item) => {
      // correct image for apple. Github #249
      if (item.sid === '204') {
        item.artUri = item.artUri.replace('&amp;', '&')    
      }
      
      if (item.artUri.startsWith('/getaa')) {
        item.artUri = tsPlayer.urlObject.origin + item.artUri
      }
      
      // My Sonos items have own upnp class object.itemobject.item.sonos-favorite"
      // metadata contains the relevant upnp class of the track, album, stream, ...
      if (isTruthyProperty(item, ['metadata'])) {
        item.upnpClass = await getUpnpClassEncoded(item['metadata'])
        item.processingType = await guessProcessingType(item.upnpClass)
        return item
      }
    }))
    const sonosPlaylists = await module.exports.getSonosPlaylists(tsPlayer)    

    return transformedItems.concat(sonosPlaylists)
  },

  /** Get array of all SONOS-Playlists.
   * @param {object} tsPlayer sonos-ts player
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-Playlists as array, could be empty
   *
   * @throws {error} invalid return from Browse, decodeHtmlEntityTs, parser.parse
   */
  getSonosPlaylists: async (tsPlayer) => { 
    debug('method:%s', 'getSonosPlaylists')

    const REQUESTED_COUNT_PLAYLISTS = 1000 // always fetch the allowed maximum

    // SQ: stands for SONOS-Playlists (saved queue) 
    // Assumption: less then 1000 Playlists, otherwise we have to iterate (see MusicLibrary)
    const browsePlaylist = await tsPlayer.ContentDirectoryService.Browse({
      'ObjectID': 'SQ:', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*', 'StartingIndex': 0,
      'RequestedCount': REQUESTED_COUNT_PLAYLISTS, 'SortCriteria': ''
    })
    
    // Caution: container not items
    const itemArray = await parseBrowseToArray(browsePlaylist, 'container')
    const transformed = itemArray.map((item) => {
      if (item.artUri.startsWith('/getaa')) {
        item.artUri = tsPlayer.urlObject.origin + item.artUri
      }
      return item
    })

    return transformed
  }, 

  /** Get array of all items of specified SONOS-Playlist. Can be empty array.
   * @param {object} tsPlayer sonos-ts player
   * @param {number} requestLimit maximum number of calls, must be >=1
   * 
   * @returns {Promise<DidlBrowseItem[]>} array of all items of the SONOS-Playlist, could be empty 
   *
   * @throws {error} invalid return from Browse, parser.parse
   * 
   * Info: Parsing is done per single list and not on the total list
   * because parsing routine uses as parameter the object of Browse. 
   * Parse on the full list would be more efficient
   */
  getSonosPlaylistTracks: async (tsPlayer, title, requestLimit) => { 
    debug('method:%s', 'getSonosPlaylistTracks')
    const REQUESTED_COUNT = 1000 // allowed maximum

    // validate parameter - just to avoid basic bugs
    if (typeof requestLimit !== 'number') {
      throw new Error(`${PACKAGE_PREFIX} requestLimit is not number`)
    }
    
    // Get the FIRST corresponding ObjectID for given title (not unique) 
    const sonosPlaylists = await module.exports.getSonosPlaylists(tsPlayer)
    // - Exact, case sensitive
    const foundIndex = sonosPlaylists.findIndex((playlist) => (playlist.title === title))
    if (foundIndex === -1) {
      throw new Error(`${PACKAGE_PREFIX} no SONOS-Playlist title matching search string`)
    } 
    const objectId = sonosPlaylists[foundIndex].id // first id of SONOS-Playlist matching title
  
    // Do multiple request, parse them and combine to one list
    let totalListParsed = [] // concatenation of all http requests, parsed
    let numberRequestsDone = 0
    let totalMatches = 1 // will be updated in while loop, 1 to start
    while ((numberRequestsDone < requestLimit)
        && (numberRequestsDone * REQUESTED_COUNT < totalMatches)) {
      // Get up to REQUESTED_COUNT items and parse them
      const browsePlaylist = await tsPlayer.ContentDirectoryService.Browse({
        'ObjectID': objectId, 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
        'StartingIndex': numberRequestsDone * REQUESTED_COUNT,
        'RequestedCount': REQUESTED_COUNT, 'SortCriteria': ''
      })
      const SingleListParsed = await parseBrowseToArray(browsePlaylist, 'item')
      totalListParsed = totalListParsed.concat(SingleListParsed)
      totalMatches = browsePlaylist.TotalMatches
     
      numberRequestsDone++
    }

    // Transform
    const totalListTransformed = totalListParsed.map((item) => {
      if (item.artUri.startsWith('/getaa')) {
        item.artUri = tsPlayer.urlObject.origin + item.artUri
      }
      return item
    })
    if (!isTruthy(totalListTransformed)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse is invalid`)
    }

    return totalListTransformed
  }, 

  /** Get array of all SONOS-Queue tracks - Version 2 for more then 1000 items
   * Adds processingType and player urlObject.origin to artUri.
   * @param {object} tsPlayer sonos-ts player
   * @param {number} requestLimit maximum number of calls, must be >=1
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-queue items, could be empty
   *
   * @throws {error} invalid return from Browse, parseBrowseToArray error
   */
  getSonosQueueV2: async (tsPlayer, requestLimit) => {
    debug('method:%s', 'getSonosQueueV2')
    const REQUESTED_COUNT = 1000 // allowed maximum

    // validate parameter - just to avoid basic bugs
    if (typeof requestLimit !== 'number') {
      throw new Error(`${PACKAGE_PREFIX} requestLimit is not number`)
    }
    const objectId = 'Q:0' // SONOS-Queue

    // Do multiple request, parse them and combine to one list
    let totalListParsed = [] // concatenation of all http requests, parsed
    let numberRequestsDone = 0
    let totalMatches = 1 // will be updated in while loop, 1 to start
    while ((numberRequestsDone < requestLimit)
        && (numberRequestsDone * REQUESTED_COUNT < totalMatches)) {
      // Get up to REQUESTED_COUNT items and parse them
      const browseQueue = await tsPlayer.ContentDirectoryService.Browse({
        'ObjectID': objectId, 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
        'StartingIndex': numberRequestsDone * REQUESTED_COUNT,
        'RequestedCount': REQUESTED_COUNT, 'SortCriteria': ''
      })
      const SingleListParsed = await parseBrowseToArray(browseQueue, 'item')
      totalListParsed = totalListParsed.concat(SingleListParsed)
      totalMatches = browseQueue.TotalMatches
     
      numberRequestsDone++
    }

    // Transform
    const totalListTransformed = totalListParsed.map((item) => {
      if (item.artUri.startsWith('/getaa')) {
        item.artUri = tsPlayer.urlObject.origin + item.artUri
      }
      return item
    })
    if (!isTruthy(totalListTransformed)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse is invalid`)
    }

    return totalListTransformed
  },

  /** Version 2: Get array of all Music Library items matching category and optional search string
   * Submits several requests if necessary
   * @param {string} type such as 'Album:', 'Playlist:'
   * @param {string} [searchString=''] any search string, being used in category
   * @param {number} requestLimit maximum number of calls, must be >=1
   * @param {object} tsPlayer sonos-ts player
   * 
   * @returns {Promise<exportedItem[]>} all Music Library items matching criteria, could be empty
   *
   * @throws {error} 'category is unknown', 'searchString is not string', 
   * 'requestedLimit is not number', 'response form parsing Browse is invalid'
   * @throws {error} all methods
   */
  getMusicLibraryItemsV2: async (type, searchString, requestLimit, tsPlayer) => { 
    debug('method:%s', 'getMusicLibraryItemsV2')
    const REQUESTED_COUNT = 1000 // allowed maximum

    // validate parameter
    if (!['A:ALBUM:', 'A:PLAYLISTS:', 'A:TRACKS:', 'A:ARTIST:'].includes(type)) {
      throw new Error(`${PACKAGE_PREFIX} category is unknown`)
    }
    if (typeof searchString !== 'string') {
      throw new Error(`${PACKAGE_PREFIX} searchString is not string`)
    }
    if (typeof requestLimit !== 'number') {
      throw new Error(`${PACKAGE_PREFIX} requestLimit is not number`)
    }
    
    // The search string must be encoded- but not the category (:)
    const objectId = type + encodeURIComponent(searchString)
    const category = (type === 'A:TRACKS:' ? 'item' : 'container')
 
    /// new - start

    // Do multiple request, parse them and combine to one list
    let totalListParsed = [] // concatenation of all http requests, parsed
    let numberRequestsDone = 0
    let totalMatches = 1 // will be updated in while loop, 1 to start
    while ((numberRequestsDone < requestLimit)
        && (numberRequestsDone * REQUESTED_COUNT < totalMatches)) {
      // Get up to REQUESTED_COUNT items and parse them
      const browseCategory = await tsPlayer.ContentDirectoryService.Browse({
        'ObjectID': objectId, 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
        'StartingIndex': numberRequestsDone * REQUESTED_COUNT,
        'RequestedCount': REQUESTED_COUNT, 'SortCriteria': ''
      })
      const SingleListParsed = await parseBrowseToArray(browseCategory, category)
      totalListParsed = totalListParsed.concat(SingleListParsed)
      totalMatches = browseCategory.TotalMatches
     
      numberRequestsDone++
    }

    // No transformation of list
    if (!isTruthy(totalListParsed)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse is invalid`)
    }
    
    return totalListParsed
  }

}
