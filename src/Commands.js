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
 * @since 2021-03-03
 */ 

'use strict'

const { PACKAGE_PREFIX } = require('./Globals.js')

const {
  executeActionV6, extractGroup, getMediaInfo, getMutestate, getPlaybackstate, getPositionInfo,
  getRadioId, getUpnpClassEncoded, getVolume, guessProcessingType, parseBrowseToArray,
  parseZoneGroupToArray, positionInTrack, selectTrack, setMutestate, setVolume
} = require('./Extensions.js')

const { encodeHtmlEntity, hhmmss2msec, isTruthy, isTruthyProperty
} = require('./Helper.js')

const { MetaDataHelper } = require('@svrooij/sonos/lib')

const debug = require('debug')(`${PACKAGE_PREFIX}commands`)

module.exports = {

  //
  //     NOTIFICATION & SNAPSHOT 
  //     .......................

  /**  Play notification on a group. Coordinator is index 0 in tsPlayerArray
   * @param {tsPlayer[]} tsPlayerArray sonos-ts player array with JavaScript build-in URL urlObject
   *               coordinator has index 0. Length = 1 is allowed
   * @param {object} options options
   * @param {string} options.uri uri
   * @param {string} [options.metadata] metadata - will be generated if missing
   * @param {string} options.volume volume during notification - if -1 don't use, range 1 .. 99
   * @param {boolean} options.sameVolume all player in group play at same volume level
   * @param {boolean} options.automaticDuration duration will be received from player
   * @param {string} options.duration format hh:mm:ss
   * 
   * @returns {promise} true
   * 
   * @throws {error} all methods
   */

  // TODO optimize 
  playGroupNotification: async function (tsPlayerArray, options) {
    const WAIT_ADJUSTMENT = 2000

    // generate metadata if not provided and uri as URL
    let metadata
    if (!isTruthyProperty(options, ['metadata'])) {
      metadata = await MetaDataHelper.GuessMetaDataAndTrackUri(options.uri).metadata
      // metadata = GenerateMetadata(options.uri).metadata
    } else {
      metadata = options.metadata
    }
    if (metadata !== '') {
      metadata = await encodeHtmlEntity(metadata) // html not url encoding!
    }
    debug('metadata >>%s' + JSON.stringify(metadata))

    // create snapshot state/volume/content
    // getCurrentState will return playing for a non-coordinator player even if group is playing
    const iCoord = 0
    const snapshot = {}
    const state = await getPlaybackstate(tsPlayerArray[iCoord].urlObject)
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    debug('wasPlaying >>%s', snapshot.wasPlaying)
    snapshot.mediaInfo
      = await tsPlayerArray[iCoord].AVTransportService.GetMediaInfo()
    snapshot.positionInfo = await tsPlayerArray[iCoord].AVTransportService.GetPositionInfo()
    snapshot.memberVolumes = []
    if (options.volume !== -1) {
      snapshot.memberVolumes[0] = await getVolume(tsPlayerArray[iCoord].urlObject)
    }
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < tsPlayerArray.length; index++) {
        snapshot.memberVolumes[index] = await getVolume(tsPlayerArray[index].urlObject)
      }
    }
    debug('Snapshot created - now start playing notification')
    
    // set AVTransport
    await executeActionV6(tsPlayerArray[iCoord].urlObject,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', {
        'InstanceID': 0,
        'CurrentURI': await encodeHtmlEntity(options.uri),
        'CurrentURIMetaData': metadata
      })

    if (options.volume !== -1) {
      await setVolume(tsPlayerArray[iCoord].urlObject, options.volume)
      debug('same Volume >>%s', options.sameVolume)
      if (options.sameVolume) { // all other members, starting at 1
        for (let index = 1; index < tsPlayerArray.length; index++) {
          await setVolume(tsPlayerArray[index].urlObject, options.volume)
        }
      }
    }
    // no check - always returns true
    await tsPlayerArray[iCoord].Play()
   
    debug('Playing notification started - now figuring out the end')

    // waiting either based on SONOS estimation, per default or user specified
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
    if (options.volume !== -1) {
      await setVolume(tsPlayerArray[iCoord].urlObject,
        snapshot.memberVolumes[iCoord])
    }
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < tsPlayerArray.length; index++) {
        await setVolume(tsPlayerArray[index].urlObject,
          snapshot.memberVolumes[index])
      }
    }
    if (!options.uri.includes('x-sonos-vli')) {
      // can not recover initiated by Spotify or Amazon Alexa
      await tsPlayerArray[iCoord].AVTransportService.SetAVTransportURI({
        'InstanceID': 0,
        'CurrentURI': snapshot.mediaInfo.CurrentURI,
        'CurrentURIMetaData': snapshot.mediaInfo.CurrentURIMetaData
      })
    }
    if (snapshot.positionInfo.Track && snapshot.positionInfo.Track > 1
      && snapshot.mediaInfo.NrTracks > 1) {
      await tsPlayerArray[iCoord].SeekTrack(Number(snapshot.positionInfo.Track))
        .catch(() => {
          debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.positionInfo.RelTime && snapshot.positionInfo.TrackDuration !== '0:00:00') {
      debug('Setting back time to >>%s', JSON.stringify(snapshot.positionInfo.RelTime))
      await tsPlayerArray[iCoord].SeekPosition(snapshot.positionInfo.RelTime)
        .catch(() => {
          debug('Reverting back track time failed, happens for some music services.')
        })
    }
    if (snapshot.wasPlaying) {
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

  // TODO see playGroupNotification
  playJoinerNotification: async function (tsCoordinator, tsJoiner, options) {
    const WAIT_ADJUSTMENT = 2000

    // generate metadata if not provided and uri as URL
    let metadata
    if (!isTruthyProperty(options, ['metadata'])) {
      metadata = await MetaDataHelper.GuessMetaDataAndTrackUri(options.uri).metadata
      // metadata = GenerateMetadata(options.uri).metadata
    } else {
      metadata = options.metadata
    }
    if (metadata !== '') {
      metadata = await encodeHtmlEntity(metadata) // html not url encoding!
    }
    debug('metadata >>%s' + JSON.stringify(metadata))

    // create snapshot state/volume/content
    // getCurrentState will return playing for a non-coordinator player even if group is playing
    const snapshot = {}
    const state = await getPlaybackstate(tsCoordinator.urlObject) 
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    snapshot.mediaInfo = await tsJoiner.AVTransportService.GetMediaInfo()
    if (options.volume !== -1) {
      snapshot.joinerVolume = await getVolume(tsJoiner.urlObject)
    }
    debug('Snapshot created - now start playing notification')

    // set the joiner to notification - joiner will leave group!
    await executeActionV6(tsJoiner.urlObject,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', {
        'InstanceID': 0,
        'CurrentURI': await encodeHtmlEntity(options.uri),
        'CurrentURIMetaData': metadata
      })

    // no check - always returns true
    await tsJoiner.Play()

    if (options.volume !== -1) {
      await setVolume(tsJoiner.urlObject, options.volume)
    }
    debug('Playing notification started - now figuring out the end')

    // waiting either based on SONOS estimation, per default or user specified
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
      await setVolume(tsJoiner.urlObject, snapshot.joinerVolume)
    }

    await tsJoiner.AVTransportService.SetAVTransportURI({
      'InstanceID': 0,
      'CurrentURI': snapshot.mediaInfo.CurrentURI,
      'CurrentURIMetaData': snapshot.mediaInfo.CurrentURIMetaData
    })
    if (snapshot.wasPlaying) {
      await tsJoiner.Play()
    }
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
   * @property {member[]} membersData array of members in a group
   * @property {object} member group members relevant data
   * @property {string} member.urlSchemeAuthority such as http://192.168.178.37:1400/
   * @property {boolean} member.mutestate null for not available
   * @property {string} member.volume -1 for not available
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
   *
   * @returns {promise<Snapshot>} group snapshot object
   * 
   * @throws {error} all methods
  */
  createGroupSnapshot: async function (playersInGroup, options) {
    debug('method:%s', 'createGroupSnapshot')
    const snapshot = {}
    snapshot.membersData = []
    let member
    for (let index = 0; index < playersInGroup.length; index++) {
      member = { // default
        // urlSchemaAuthority because it may stored in flow variable
        urlSchemeAuthority: playersInGroup[index].urlObject.origin,
        mutestate: null,
        volume: '-1',
        playerName: playersInGroup[index].playerName
      }
      if (options.snapVolumes) {
        member.volume = await getVolume(playersInGroup[index].urlObject)
      }
      if (options.snapMutestates) {
        member.mutestate = await getMutestate(playersInGroup[index].urlObject)
      }
      snapshot.membersData.push(member)
    }

    const coordinatorUrlObject = playersInGroup[0].urlObject
    snapshot.playbackstate = await getPlaybackstate(coordinatorUrlObject)
    snapshot.wasPlaying = (snapshot.playbackstate === 'playing'
  || snapshot.playbackstate === 'transitioning')
    const mediaData = await getMediaInfo(coordinatorUrlObject)
    const positionData = await getPositionInfo(coordinatorUrlObject)
    Object.assign(snapshot,
      {
        'CurrentURI': mediaData.CurrentURI,
        'CurrentURIMetadata': mediaData.CurrentURIMetaData,
        'NrTracks': mediaData.NrTracks
      })
    Object.assign(snapshot,
      {
        'Track': positionData.Track,
        'RelTime': positionData.RelTime,
        'TrackDuration': positionData.TrackDuration
      })
    return snapshot
  },

  /**  Restore snapshot of group. Group topology must be the same! Does NOT play!
 * @param {object<Snapshot>} snapshot - see typedef
 
 * @returns {promise} true
 *
 * @throws if invalid response from SONOS player
 */
  restoreGroupSnapshot: async function (snapshot) {
    debug('method:%s', 'restoreGroupSnapshot')
    // restore content
    // urlSchemeAuthority because we do create/restore
    const coordinatorUrlObject = new URL(snapshot.membersData[0].urlSchemeAuthority)
    
    // html encode for the &
    const metadata = await encodeHtmlEntity(snapshot.CurrentURIMetadata)
    const uri = await encodeHtmlEntity(snapshot.CurrentURI)
    await executeActionV6(coordinatorUrlObject,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', {
        'InstanceID': 0,
        'CurrentURI': uri,
        'CurrentURIMetaData': metadata
      })

    let track
    if (isTruthyProperty(snapshot, ['Track'])) {
      track = parseInt(snapshot['Track'])
    }
    let nrTracks
    if (isTruthyProperty(snapshot, ['NrTracks'])) {
      nrTracks = parseInt(snapshot['NrTracks'])
    }
    if (track >= 1 && nrTracks >= track) {
      debug('Setting track to >>%s', snapshot.Track)
      // we need to wait until track is selected
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](500)
      await selectTrack(coordinatorUrlObject, track)
        .catch(() => {
          debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.RelTime && snapshot.TrackDuration !== '0:00:00') {
    // we need to wait until track is selected
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](100)
      debug('Setting back time to >>%', snapshot.RelTime)
      await positionInTrack(coordinatorUrlObject, snapshot.RelTime)
        .catch(() => {
          debug('Reverting back track time failed, happens for some music services.')
        })
    }
    // restore volume/mute if captured.
    let volume
    let mutestate
    let urlObject // JavaScript build-in URL
    for (let index = 0; index < snapshot.membersData.length; index++) {
      volume = snapshot.membersData[index].volume
      urlObject = new URL(snapshot.membersData[index].urlSchemeAuthority)
      if (volume !== '-1') { // volume is of type string
        await setVolume(urlObject, parseInt(volume))
      }
      mutestate = snapshot.membersData[index].mutestate
      if (mutestate != null) {
        await setMutestate(urlObject, mutestate)
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
  getGroupCurrent: async function (tsPlayer, playerName) {
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
  getGroupsAll: async function (anyTsPlayer) {
    debug('method:%s', 'getGroupsAll')
    
    // get all groups
    const householdGroups = await anyTsPlayer.ZoneGroupTopologyService.GetZoneGroupState({})   
    if (!isTruthyProperty(householdGroups, ['ZoneGroupState'])) {
      throw new Error(`${PACKAGE_PREFIX} property ZoneGroupState is missing`)
    }
    
    return await parseZoneGroupToArray(householdGroups.ZoneGroupState) 
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

  /** Get array of all My Sonos Favorite items including SonosPlaylists
   * @param {object} tsPlayer sonos-ts player
   * @param {number} requestedCount integer, 1 to ... (no validation)
   *
   * @returns {Promise<DidlBrowseItem[]>} all My Sonos items as array (except SONOS Playlists)
   *
   * @throws {error} all methods
   */ 
  getMySonos: async function (tsPlayer, requestedCount) { 
    debug('method:%s', 'getMySonos')
    // FV:2 = Favorites 
    const favorites = await tsPlayer.ContentDirectoryService.Browse({
      'ObjectID': 'FV:2', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*', 'StartingIndex': 0,
      'RequestedCount': requestedCount, 'SortCriteria': ''
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
    // TODO requested Count different for MySonos and SONOS Playlists
    const sonosPlaylists = await module.exports.getSonosPlaylists(tsPlayer, requestedCount)    

    return transformedItems.concat(sonosPlaylists)
  },

  /** Get array of all SONOS-Playlists
   * @param {object} tsPlayer sonos-ts player
   * @param {number} requestedCount integer, 1 to ...
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-Playlists as array, could be empty
   *
   * @throws {error} invalid return from Browse, decodeHtmlEntityTs, parser.parse
   */
  getSonosPlaylists: async function (tsPlayer, requestedCount) { 
    debug('method:%s', 'getSonosPlaylists')

    // SQ = SONOS-Playlists (saved queue) 
    const browsePlaylist = await tsPlayer.ContentDirectoryService.Browse({
      'ObjectID': 'SQ:', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*', 'StartingIndex': 0,
      'RequestedCount': requestedCount, 'SortCriteria': ''
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

  /** Get array of all SONOS-Queue items.
   * Adds processingType and player urlObject.origin to artUri.
   * @param {object} tsPlayer sonos-ts player
   * @param {number} requestedCount integer, 1 to ...
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-queue items, could be empty
   *
   * @throws {error} invalid return from Browse, parseBrowseToArray error
   */
  getSonosQueue: async (tsPlayer, requestedCount) => {
    debug('method:%s', 'getSonosQueue')
    
    // Q:0 = SONOS-Queue
    const browseQueue = await tsPlayer.ContentDirectoryService.Browse({
      'ObjectID': 'Q:0', 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': requestedCount, 'SortCriteria': ''
    })
    
    const itemArray = await parseBrowseToArray(browseQueue, 'item')
    const transformed = itemArray.map((item) => {
      if (item.artUri.startsWith('/getaa')) {
        item.artUri = tsPlayer.urlObject.origin + item.artUri
      }
      return item
    })

    return transformed
  },

  /** Get array of all Music Library items matching category and optional search string
   * @param {string} category such as 'Album:', 'Playlist:'
   * @param {string} [searchString=''] any search string, being used in category
   * @param {number} requestedCount integer, 1 to 5000
   * @param {object} tsPlayer sonos-ts player
   * 
   * @returns {Promise<exportedItem[]>} all Music Library items matching criteria, could be empty
   *
   * @throws {error} 'category is unknown', 'searchString is not string', 
   * 'requestedCount is not number', 'response form parsing Browse Album is invalid'
   * @throws {error} all methods
   */
  getMusicLibraryItems: async function (category, searchString, requestedCount, tsPlayer) { 
    debug('method:%s', 'getMusicLibraryItems')

    // validate parameter
    if (!['A:ALBUM:', 'A:PLAYLISTS:', 'A:TRACKS:', 'A:ARTIST:'].includes(category)) {
      throw new Error(`${PACKAGE_PREFIX} category is unknown`)
    }
    if (typeof searchString !== 'string') {
      throw new Error(`${PACKAGE_PREFIX} searchString is not string`)
    }
    if (typeof requestedCount !== 'number') {
      throw new Error(`${PACKAGE_PREFIX} requestedCount is not number`)
    }
    
    // The search string must be encoded- but not the category (:)
    const objectId = category + encodeURIComponent(searchString)
    const browseCategory = await tsPlayer.ContentDirectoryService.Browse({ 
      'ObjectID': objectId, 'BrowseFlag': 'BrowseDirectChildren', 'Filter': '*',
      'StartingIndex': 0, 'RequestedCount': requestedCount, 'SortCriteria': ''
    })

    let list
    if (category === 'A:TRACKS:') {
      list = await parseBrowseToArray(browseCategory, 'item')    
    } else {
      list = await parseBrowseToArray(browseCategory, 'container')  
    }
    if (!isTruthy(list)) {
      throw new Error(`${PACKAGE_PREFIX} response form parsing Browse Album is invalid`)
    }
    
    return list
  }
}
