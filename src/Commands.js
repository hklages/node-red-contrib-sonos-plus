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
  executeActionV7, extractGroup, getMediaInfo,
  getRadioId, getUpnpClassEncoded, guessProcessingType, parseBrowseToArray,
  parseZoneGroupToArray, parseAlarmsToArray
} = require('./Extensions.js')

const { encodeHtmlEntity, hhmmss2msec, isTruthy, isTruthyProperty
} = require('./Helper.js')

const { MetaDataHelper, SonosDevice } = require('@svrooij/sonos/lib')

const debug = require('debug')(`${PACKAGE_PREFIX}commands`)

module.exports = {

  //
  //     NOTIFICATION & SNAPSHOT 
  //     .......................

  /**  Play notification on a group. Coordinator is index 0 in tsPlayerArray
   * @param {tsPlayer[]} tsPlayerArray sonos-ts player array with JavaScript build-in URL urlObject
   *               coordinator has index 0. Length = 1 is allowed
   * @param {object} options options
   * @param {string} options.uri uri required!
   * @param {string} options.volume volume during notification - if -1 don't use, range 1 .. 99
   * @param {boolean} options.sameVolume all player in group play at same volume level
   * @param {boolean} options.automaticDuration duration will be received from player
   * @param {string} options.duration format hh:mm:ss
   * 
   * @returns {promise} true
   * 
   * @throws {error} all methods
   */

  playGroupNotification: async (tsPlayerArray, options) => {
    debug('method:%s', 'playGroupNotification')
    const WAIT_ADJUSTMENT = 2000

    // generate metadata if not provided
    if (!isTruthyProperty(options, ['uri'])) {
      throw new Error(`${PACKAGE_PREFIX} uri is missing`)
    }
    const track = await MetaDataHelper.GuessTrack(options.uri)
    let metadata = await MetaDataHelper.TrackToMetaData(track)
    if (metadata !== '') {
      metadata = await encodeHtmlEntity(metadata) // html not url encoding!
    }
    debug('metadata >>%s' + JSON.stringify(metadata))

    // create snapshot state/volume/content
    const snapShot = await module.exports.createGroupSnapshot(tsPlayerArray, {
      snapVolumes: true,
      snapMutes: false
    })
    debug('Snapshot created - now start playing notification')
    
    // set AVTransport on coordinator and if requested the volume
    const iCoord = 0
    const uri = await encodeHtmlEntity(options.uri)
    await tsPlayerArray[iCoord].AVTransportService.SetAVTransportURI({
      InstanceID: 0, CurrentURI: uri, CurrentURIMetaData: metadata
    })

    // set volume and play notification everywhere
    if (options.volume !== -1) {
      await tsPlayerArray[iCoord].SetVolume(options.volume)
      debug('same Volume >>%s', options.sameVolume)
      if (options.sameVolume) { // all other members, starting at 1
        for (let index = 1; index < tsPlayerArray.length; index++) {
          await tsPlayerArray[index].SetVolume(options.volume)
        }
      }
    }
    await tsPlayerArray[iCoord].Play()
    debug('Playing notification started - now figuring out the end')

    // Coordinator waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = hhmmss2msec(options.duration)
    if (options.automaticDuration) {
      const positionInfo
        = await tsPlayerArray[iCoord].AVTransportService.GetPositionInfo()
      if (isTruthyProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = hhmmss2msec(positionInfo.TrackDuration) + WAIT_ADJUSTMENT
        debug('Did retrieve duration from SONOS player')
      } else {
        debug('Could NOT retrieve duration from SONOS player - using default/specified length')
      }
    }
    debug('duration >>%s', JSON.stringify(waitInMilliseconds))
    await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](waitInMilliseconds)
    debug('notification finished - now starting to restore')

    // return to previous state = restore snapshot
    await module.exports.restoreGroupSnapshot(snapShot)

    // vli can not be recovered
    if (snapShot.wasPlaying) {
      if (!options.uri.includes('x-sonos-vli')) {
        await tsPlayerArray[iCoord].Play()
      }
    }
  },

  /**  Play notification on a single joiner but must not be coordinator.
   * @param {object} tsCoordinator sonos-ts coordinator in group with url
   * @param {object} tsJoiner node-sonos player in group with url
   * @param {object} options options
   * @param {string} options.uri uri
   * @param {string} [options.metadata] metadata - will be generated if missing
   * @param {string} options.volume volume during notification: 1 means don't use, range 1 .. 99
   * @param {boolean} options.automaticDuration
   * @param {string} options.duration format hh:mm:ss
   * @returns {promise} true
   *
   * @throws {error} all methods
   *
   * Hint: joiner will leave group, play notification and rejoin the group. 
   * State will be imported from group.
   */

  playJoinerNotification: async (tsCoordinator, tsJoiner, options) => {
    debug('method:%s', 'playJoinerNotification')
    const WAIT_ADJUSTMENT = 2000

    // generate metadata if not provided
    if (!isTruthyProperty(options, ['uri'])) {
      throw new Error(`${PACKAGE_PREFIX} uri is missing`)
    }
    const track = await MetaDataHelper.GuessTrack(options.uri)
    let metadata = await MetaDataHelper.TrackToMetaData(track)
    if (metadata !== '') {
      metadata = await encodeHtmlEntity(metadata) // html not url encoding!
    }
    debug('metadata >>%s' + JSON.stringify(metadata))

    // create snapshot state/volume/content
    // coordinator playback state is relevant - not joiner
    const snapshot = {}

    // Do we need that? 
    const transportInfoObject = await tsCoordinator.AVTransportService.GetTransportInfo({
      InstanceID: 0
    })
    const state = transportInfoObject.CurrentTransportState.toLowerCase()
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    if (options.volume !== -1) {
      const result = await tsJoiner.RenderingControlService.GetVolume(
        { InstanceID: 0, Channel: 'Master' })
      snapshot.joinerVolume = result.CurrentVolume
    }
    debug('Snapshot created - now start playing notification')

    // set AVTransport on joiner - joiner will leave group!
    await executeActionV7(tsJoiner.urlObject,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', {
        'InstanceID': 0,
        'CurrentURI': await encodeHtmlEntity(options.uri),
        'CurrentURIMetaData': metadata
      })

    // set volume and play notification on joiner
    if (options.volume !== -1) {
      await tsJoiner.SetVolume(options.volume)
    }
    await tsJoiner.Play()
    debug('Playing notification started - now figuring out the end')

    // Joiner: waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = hhmmss2msec(options.duration)
    if (options.automaticDuration) {
      const positionInfo = await tsJoiner.AVTransportService.GetPositionInfo()
      if (isTruthyProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = hhmmss2msec(positionInfo.TrackDuration) + WAIT_ADJUSTMENT
        debug('Did retrieve duration from SONOS player')
      } else {
        debug('Could NOT retrieve duration from SONOS player - using default/specified length')
      }
    }
    debug('duration >>' + JSON.stringify(waitInMilliseconds))
    await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](waitInMilliseconds)
    debug('notification finished - now starting to restore')

    // return to previous state = restore snapshot
    if (options.volume !== -1) {
      await tsJoiner.SetVolume(snapshot.joinerVolume)
    }
    const coordinatorRincon = `x-rincon:${tsCoordinator.myUuid}`
    await executeActionV7(tsJoiner.urlObject,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
      { 'InstanceID': 0, 'CurrentURI': coordinatorRincon, 'CurrentURIMetaData': '' })

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
   * @property {string} playlistName name of playlist
   * @property {member[]} membersData array of members in a group
   * @property {object} member group members relevant data
   * @property {string} member.urlSchemeAuthority such as http://192.168.178.37:1400/
   * @property {string} member.mutestate null for not available, otherwise on\|off
   * @property {integer} member.volume null for not available, range 0 to 100
   * @property {string} member.playerName SONOS-Playername
   */

  /**  Creates snapshot of a current group.
   * @param {player[]} playersInGroup player data in group, coordinator at 0 
   * @param {object} player player 
   * @param {object} player.urlObject player JavaScript build-in URL
   * @param {string} player.playerName SONOS-Playername
   * @param {object} options
   * @param {boolean} [options.snapVolumes = false] capture all players volume
   * @param {boolean} [options.snapMutestates = false] capture all players mute state
   * @param {string} [options.sonosPlaylistName = ''] store queue in a SONOS-Playlist
   *
   * @returns {promise<Snapshot>} group snapshot object
   * 
   * @throws {error} all methods
  */
  createGroupSnapshot: async (playersInGroup, options) => {
    debug('method:%s', 'createGroupSnapshot')
    const snapshot = {}
    snapshot.membersData = []
  
    // mutestate and volume of all players
    for (let index = 0; index < playersInGroup.length; index++) {
      const member = { // default
        // urlSchemaAuthority because it maybe stored in flow variable
        urlSchemeAuthority: playersInGroup[index].urlObject.origin,
        mutestate: null,
        volume: null,
        playerName: playersInGroup[index].playerName
      }
      const tsPlayer = new SonosDevice(playersInGroup[index].urlObject.hostname)
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
    
    // save queue
    if (options.sonosPlaylistName) {
      // TODO validate title at least one character
      // TODO what happens if queue is empty
      // TODO what happens if playlist already exists!
      const validatedTitle = options.sonosPlaylistName
      await tsCoordinator.AVTransportService.SaveQueue(
        { 'InstanceID': 0, 'Title': validatedTitle, 'ObjectID': '' }) 
      snapshot.playlistName = validatedTitle
    }

    // content (MediaInfo, PositionInfo), playbackstate of coordinator
    const transportInfoObject = await tsCoordinator.AVTransportService.GetTransportInfo({
      InstanceID: 0
    })
    snapshot.playbackstate = transportInfoObject.CurrentTransportState.toLowerCase()
    snapshot.wasPlaying = (snapshot.playbackstate === 'playing'
      || snapshot.playbackstate === 'transitioning')
    // Caution: CurrentUriMetadata as string not as object!
    const mediaData = await getMediaInfo(coordinatorUrlObject)
    Object.assign(snapshot,
      {
        'CurrentURI': mediaData.CurrentURI,
        'CurrentURIMetadata': mediaData.CurrentURIMetaData, // DIDL string
        'NrTracks': mediaData.NrTracks
      })
    const positionData = await tsCoordinator.AVTransportService.GetPositionInfo({ InstanceID: 0 })
    // TODO what value NRTrack if not exist - update the data definition above!
    // TODO what value TRACK, .... if not exist for instance stream
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

    const WAIT_FOR_SETAV = 500 // content needs time to finish
    const WAIT_FOR_TRACK = 100 // track position needs time to finish
    
    const iCoord = 0 // coordinator is always at position 0
    const coordinatorUrlObject = new URL(snapshot.membersData[iCoord].urlSchemeAuthority)
    const tsCoordinator = new SonosDevice(coordinatorUrlObject.hostname)
   
    // restore queue if saved
    // TODO restore queue
    if (isTruthyProperty(snapshot, ['playlistName'])) {
      // restore queue
    }

    // restore content, urlSchemeAuthority because we do create/restore
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
      // wait for SetAVTransportURI being competed then restore track
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](WAIT_FOR_SETAV)
      await tsCoordinator.SeekTrack(track)
        .catch(() => {
          debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.RelTime && snapshot.TrackDuration !== '0:00:00') {
      // wait then restore track position
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](WAIT_FOR_TRACK)
      debug('Setting back time to >>%', snapshot.RelTime)
      await tsCoordinator.SeekPosition(snapshot.RelTime)
        .catch(() => {
          debug('Reverting back track time failed, happens for some music services.')
        })
    }

    // restore volume/mute if captured.
    for (let i = 0; i < snapshot.membersData.length; i++) {
      const urlObject = new URL(snapshot.membersData[i].urlSchemeAuthority)
      const ts1Player = new SonosDevice(urlObject.hostname)
      const volume = snapshot.membersData[i].volume
      
      if (volume !== null) { 
        await ts1Player.RenderingControlService.SetVolume(
          { 'InstanceID': 0, 'Channel': 'Master', 'DesiredVolume': volume.toString() })
      }

      const mutestate = snapshot.membersData[i].mutestate
      if (mutestate !== null) {
        await ts1Player.RenderingControlService.SetMute(
          { 'InstanceID': 0, 'Channel': 'Master', 'DesiredMute': (mutestate === 'on') }) 
      }
    }
  
    return true
  },

  //
  //     GROUP RELATED
  //     .............

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
   */

  /** Get array of all groups. Each group consist of an array of players <playerGroupData>[]
   * Coordinator is always in position 0. Group array may have size 1 (standalone)
   * @param {object} player sonos-ts player
   * 
   * @returns {promise<playerGroupData[]>} array of arrays with playerGroupData
   *          First group member is coordinator.
   *
   * @throws {error} 'property ZoneGroupState is missing', 'response form parse xml is invalid'
   * @throws {error} all methods
   */
  getGroupsAll: async (anyTsPlayer) => {
    debug('method:%s', 'getGroupsAll')
    
    // get all groups
    const householdGroups = await anyTsPlayer.ZoneGroupTopologyService.GetZoneGroupState({})   
    if (!isTruthyProperty(householdGroups, ['ZoneGroupState'])) {
      throw new Error(`${PACKAGE_PREFIX} property ZoneGroupState is missing`)
    }
    
    return await parseZoneGroupToArray(householdGroups.ZoneGroupState) 
  },

  //
  //     ALARMS RELATED
  //     ...............
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
  //     ...............
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
    const favorites = await tsPlayer.ContentDirectoryService.Browse({
      'ObjectID': 'FV:2', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*', 'StartingIndex': 0,
      'RequestedCount': REQUESTED_COUNT_MYSONOS, 'SortCriteria': ''
    })

    const itemArray = await parseBrowseToArray(favorites, 'item')
    // add several properties
    const transformedItems = await Promise.all(itemArray.map(async (item) => {
      if (item.artUri.startsWith('/getaa')) {
        item.artUri = tsPlayer.urlObject.origin + item.artUri
      }
      
      if (isTruthyProperty(item, ['uri'])) {
        item.radioId = getRadioId(item.uri)
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

  /** Get array of all SONOS-Playlists
   * @param {object} tsPlayer sonos-ts player
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-Playlists as array, could be empty
   *
   * @throws {error} invalid return from Browse, decodeHtmlEntityTs, parser.parse
   */
  getSonosPlaylists: async (tsPlayer) => { 
    debug('method:%s', 'getSonosPlaylists')

    const REQUESTED_COUNT_PLAYLISTS = 1000 // always fetch the allowed maximum

    // SQ = SONOS-Playlists (saved queue) 
    const browsePlaylist = await tsPlayer.ContentDirectoryService.Browse({
      'ObjectID': 'SQ:', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*', 'StartingIndex': 0,
      'RequestedCount': REQUESTED_COUNT_PLAYLISTS, 'SortCriteria': ''
    })
    
    // caution: container not items
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
    // - exact, case sensitive
    const foundIndex = sonosPlaylists.findIndex((playlist) => (playlist.title === title))
    if (foundIndex === -1) {
      throw new Error(`${PACKAGE_PREFIX} no SONOS-Playlist title matching search string`)
    } 
    const objectId = sonosPlaylists[foundIndex].id // first id of SONOS-Playlist matching title
    
    // do multiple request, parse them and combine to one list
    let totalListParsed = [] // concatenation of all http requests, parsed
    let numberRequestsDone = 0
    let totalMatches = 1 // at least one call
    while ((numberRequestsDone < requestLimit)
        && (numberRequestsDone * REQUESTED_COUNT < totalMatches)) {
      // get up to REQUESTED_COUNT items and parse them
      const browsePlaylist = await tsPlayer.ContentDirectoryService.Browse({
        'ObjectID': objectId, 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
        'StartingIndex': 0, 'RequestedCount': REQUESTED_COUNT, 'SortCriteria': ''
      })
      const SingleListParsed = await parseBrowseToArray(browsePlaylist, 'item')
      totalListParsed = totalListParsed.concat(SingleListParsed)
      totalMatches = browsePlaylist.TotalMatches
     
      numberRequestsDone++
    }

    // transform
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
    // Get first items and transform them
    let browseQueue = await tsPlayer.ContentDirectoryService.Browse({
      'ObjectID': objectId, 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': REQUESTED_COUNT, 'SortCriteria': ''
    })
    
    let list // list from single http request, parsed, transformed items
    let itemArray = await parseBrowseToArray(browseQueue, 'item')
    list = itemArray.map((item) => {
      if (item.artUri.startsWith('/getaa')) {
        item.artUri = tsPlayer.urlObject.origin + item.artUri
      }
      return item
    })
    if (!isTruthy(list)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse is invalid`)
    }

    // if there are more items, then get them
    const totalMatches = browseQueue.TotalMatches
    let totalList = [] // concatenation of all http requests, parsed, transformed
    totalList = totalList.concat(list)

    if (totalMatches > REQUESTED_COUNT) {
      // we need to fetch the rest: 0..999 no additional request/ 1000..1999 1 add request, ...
      const iterations = Math.min(requestLimit-1, Math.floor(totalMatches / REQUESTED_COUNT)) 
      for (let i = 1; i < iterations + 1 ; i++) { // we start at 1
        browseQueue = await tsPlayer.ContentDirectoryService.Browse({
          'ObjectID': objectId, 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
          'StartingIndex': i * REQUESTED_COUNT, 'RequestedCount': REQUESTED_COUNT,
          'SortCriteria': ''
        })        
        itemArray = await parseBrowseToArray(browseQueue, 'item')
        list = itemArray.map((item) => {
          if (item.artUri.startsWith('/getaa')) {
            item.artUri = tsPlayer.urlObject.origin + item.artUri
          }
          return item
        })
        if (!isTruthy(list)) {
          throw new Error(`${PACKAGE_PREFIX} response form parsing Browse is invalid`)
        }
        totalList = totalList.concat(list)
      }
    }

    return totalList
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
    const ML_REQUESTED_COUNT = 1000 // allowed maximum

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
    let browseCategory = await tsPlayer.ContentDirectoryService.Browse({ 
      'ObjectID': objectId, 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': ML_REQUESTED_COUNT, 'SortCriteria': ''
    })

    let list // single list from one http request
    if (type === 'A:TRACKS:') {
      list = await parseBrowseToArray(browseCategory, 'item')    
    } else {
      list = await parseBrowseToArray(browseCategory, 'container')  
    }
    if (!isTruthy(list)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse is invalid`)
    }

    // if there are more items, then get them
    const totalMatches = browseCategory.TotalMatches
    let totalList = [] // concatenation of all http requests, parsed
    totalList = totalList.concat(list)

    if (totalMatches > ML_REQUESTED_COUNT) {
      // we need to fetch the rest: 0..999 no additional request/ 1000..1999 1 add request, ...
      const iterations = Math.min(requestLimit-1, Math.floor(totalMatches / ML_REQUESTED_COUNT)) 
      for (let i = 1; i < iterations + 1 ; i++) { // we start at 1
        browseCategory = await tsPlayer.ContentDirectoryService.Browse({ 
          'ObjectID': objectId, 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
          'StartingIndex': i * ML_REQUESTED_COUNT,
          'RequestedCount': ML_REQUESTED_COUNT, 'SortCriteria': ''
        })
        if (type === 'A:TRACKS:') {
          list = await parseBrowseToArray(browseCategory, 'item')    
        } else {
          list = await parseBrowseToArray(browseCategory, 'container')  
        }
        if (!isTruthy(list)) {
          throw new Error(`${PACKAGE_PREFIX} response form parsing Browse Album is invalid`)
        }
        totalList = totalList.concat(list)
      }
    }
    
    return totalList
  }

}
