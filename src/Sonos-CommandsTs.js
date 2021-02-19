/**
 * Collection of complex SONOS commands. 
 *
 * @module Sonos-CommandsTs
 * 
 * @author Henning Klages
 * 
 * @since 2021-02-19
 */ 

'use strict'

const { PACKAGE_PREFIX } = require('./Globals.js')

const {
  getMutestate: xGetMutestate, getPlaybackstate: xGetPlaybackstate, 
  getVolume: xGetVolume, setMutestate: xSetMutestate, setVolume: xSetVolume,
  getMediaInfo: xGetMediaInfo, getPositionInfo: xGetPositionInfo,
  setAvTransport: xSetAvTransport, selectTrack: xSelectTrack,
  positionInTrack: xPositionInTrack, play: xPlay,
  parseBrowseToArray: xParseBrowseToArray, getRadioId: xGetRadioId,
  getUpnpClassEncoded: xGetUpnpClassEncoded, executeActionV6
} = require('./Sonos-Extensions.js')

const { isTruthyProperty: xIsTruthyProperty, isTruthyStringNotEmpty: xIsTruthyStringNotEmpty,
  hhmmss2msec: xhhmmss2msec, isTruthy: xIsTruthy, decodeHtmlEntity: xDecodeHtmlEntity,
  encodeHtmlEntity: xEncodeHtmlEntity
} = require('./HelperTS.js')

const { MetaDataHelper } = require('@svrooij/sonos/lib')

const parser = require('fast-xml-parser')

const debug = require('debug')(`${PACKAGE_PREFIX}Commands`)

module.exports = {

  UPNP_CLASSES_STREAM: ['object.item.audioItem.audioBroadcast'],

  UPNP_CLASSES_QUEUE: [
    'object.container.album.musicAlbum',
    'object.container.playlistContainer',
    'object.item.audioItem.musicTrack',
    'object.container',
    'object.container.playlistContainer#playlistItem',
    'object.container.playlistContainer.#playlistItem',
    'object.container.playlistContainer.#PlaylistView'
  ],

  UNPN_CLASSES_UNSUPPORTED: [
    'object.container.podcast.#podcastContainer',
    'object.container.albumlist'
  ],

  /**  Play notification on a group. Coordinator is index 0 in tsPlayerArray
   * @param  {tsPlayer[]} tsPlayerArray sonos-ts player array with JavaScript build-in URL urlObject
   *                   coordinator has index 0. Length = 1 is allowed
   * @param  {object}  options options
   * @param  {string}  options.uri  uri
   * @param  {string}  [options.metadata]  metadata - will be generated if missing
   * @param  {string}  options.volume volume during notification - if -1 don't use, range 1 .. 99
   * @param  {boolean} options.sameVolume all player in group play at same volume level
   * @param  {boolean} options.automaticDuration duration will be received from player
   * @param  {string}  options.duration format hh:mm:ss
   * 
   * @returns {promise} true
   * 
   * @throws if invalid response from setAVTransportURI, play,
   */

  // TODO optimize 
  playGroupNotification: async function (tsPlayerArray, options) {
    const WAIT_ADJUSTMENT = 2000

    // generate metadata if not provided and uri as URL
    let metadata
    if (!xIsTruthyProperty(options, ['metadata'])) {
      metadata = await MetaDataHelper.GuessMetaDataAndTrackUri(options.uri).metadata
      // metadata = GenerateMetadata(options.uri).metadata
    } else {
      metadata = options.metadata
    }
    if (metadata !== '') {
      metadata = await xEncodeHtmlEntity(metadata) // html not url encoding!
    }
    debug('metadata >>%s' + JSON.stringify(metadata))

    // create snapshot state/volume/content
    // getCurrentState will return playing for a non-coordinator player even if group is playing
    const iCoord = 0
    const snapshot = {}
    const state = await xGetPlaybackstate(tsPlayerArray[iCoord].urlObject)
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    debug('wasPlaying >>%s', snapshot.wasPlaying)
    snapshot.mediaInfo
      = await tsPlayerArray[iCoord].AVTransportService.GetMediaInfo()
    snapshot.positionInfo = await tsPlayerArray[iCoord].AVTransportService.GetPositionInfo()
    snapshot.memberVolumes = []
    if (options.volume !== -1) {
      snapshot.memberVolumes[0] = await xGetVolume(tsPlayerArray[iCoord].urlObject)
    }
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < tsPlayerArray.length; index++) {
        snapshot.memberVolumes[index] = await xGetVolume(tsPlayerArray[index].urlObject)
      }
    }
    debug('Snapshot created - now start playing notification')
    
    // set AVTransport
    const args = {
      InstanceID: 0,
      CurrentURI: await xEncodeHtmlEntity(options.uri),
      CurrentURIMetaData: metadata
    }
    await executeActionV6(tsPlayerArray[iCoord].urlObject,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', args)

    if (options.volume !== -1) {
      await xSetVolume(tsPlayerArray[iCoord].urlObject, options.volume)
      debug('same Volume >>%s', options.sameVolume)
      if (options.sameVolume) { // all other members, starting at 1
        for (let index = 1; index < tsPlayerArray.length; index++) {
          await xSetVolume(tsPlayerArray[index].urlObject, options.volume)
        }
      }
    }
    // no check - always returns true
    await tsPlayerArray[iCoord].Play()
   
    debug('Playing notification started - now figuring out the end')

    // waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = xhhmmss2msec(options.duration)
    if (options.automaticDuration) {
      const positionInfo
        = await tsPlayerArray[iCoord].AVTransportService.GetPositionInfo()
      if (xIsTruthyProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = xhhmmss2msec(positionInfo.TrackDuration) + WAIT_ADJUSTMENT
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
      await xSetVolume(tsPlayerArray[iCoord].urlObject,
        snapshot.memberVolumes[iCoord])
    }
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < tsPlayerArray.length; index++) {
        await xSetVolume(tsPlayerArray[index].urlObject,
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
   * @param  {object}  tsCoordinator sonos-ts coordinator in group with url
   * @param  {object}  tsJoiner node-sonos player in group with url
   * @param  {object}  options options
   * @param  {string}  options.uri  uri
   * @param  {string}  [options.metadata]  metadata - will be generated if missing
   * @param  {string}  options.volume volume during notification: 1 means don't use, reage 1 .. 99
   * @param  {boolean} options.automaticDuration
   * @param  {string}  options.duration format hh:mm:ss
   * @returns {promise} true
   *
   * @throws all from setAVTransportURI(), avTransportService()*, play, setPlayerVolume
   *
   * Hint: joiner will leave group, play notification and rejoin the group. 
   * State will be imported from group.
   */

  // TODO see playGroupNotification
  playJoinerNotification: async function (tsCoordinator, tsJoiner, options) {
    const WAIT_ADJUSTMENT = 2000

    // generate metadata if not provided and uri as URL
    let metadata
    if (!xIsTruthyProperty(options, ['metadata'])) {
      metadata = await MetaDataHelper.GuessMetaDataAndTrackUri(options.uri).metadata
      // metadata = GenerateMetadata(options.uri).metadata
    } else {
      metadata = options.metadata
    }
    if (metadata !== '') {
      metadata = await xEncodeHtmlEntity(metadata) // html not url encoding!
    }
    debug('metadata >>%s' + JSON.stringify(metadata))

    // create snapshot state/volume/content
    // getCurrentState will return playing for a non-coordinator player even if group is playing
    const snapshot = {}
    const state = await xGetPlaybackstate(tsCoordinator.urlObject) 
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    snapshot.mediaInfo = await tsJoiner.AVTransportService.GetMediaInfo()
    if (options.volume !== -1) {
      snapshot.joinerVolume = await xGetVolume(tsJoiner.urlObject)
    }
    debug('Snapshot created - now start playing notification')

    // set the joiner to notification - joiner will leave group!
    const args = {
      InstanceID: 0,
      CurrentURI: await xEncodeHtmlEntity(options.uri),
      CurrentURIMetaData: metadata
    }
    await executeActionV6(tsJoiner.urlObject,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', args)

    // no check - always returns true
    await tsJoiner.Play()

    if (options.volume !== -1) {
      await xSetVolume(tsJoiner.urlObject, options.volume)
    }
    debug('Playing notification started - now figuring out the end')

    // waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = xhhmmss2msec(options.duration)
    if (options.automaticDuration) {
      const positionInfo = await tsJoiner.AVTransportService.GetPositionInfo()
      if (xIsTruthyProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = xhhmmss2msec(positionInfo.TrackDuration) + WAIT_ADJUSTMENT
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
      await xSetVolume(tsJoiner.urlObject, snapshot.joinerVolume)
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

  /** Get group data for a given player.   
   * @param {string} tsPlayer sonos-ts player
   * @param {string} [playerName] SONOS-Playername such as Kitchen 
   * 
   * @returns {promise<object>}  returns object:
   *  { groupId, playerIndex, coordinatorIndex, members[]<playerGroupData> } 
   *
   * @throws {error} getGroupsAll
   * @throws {error} extractGroup 
   */
  getGroupCurrent: async function (tsPlayer, playerName) {
    debug('method >>%s', 'getGroupCurrent')
    const allGroups = await module.exports.getGroupsAll(tsPlayer)
    // eslint-disable-next-line max-len
    const thisGroup = await module.exports.extractGroup(tsPlayer.urlObject.hostname, allGroups, playerName)
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
   * @param  {object} player sonos-ts player
   * 
   * @returns {promise<playerGroupData[]>} array of arrays with playerGroupData
   *          First group member is coordinator.
   *
   * @throws {error} GetZoneGroupState response errors
   * @throws {error} parse errors
   */
  getGroupsAll: async function (anyTsPlayer) {
    debug('method >>%s', 'getGroupsAll')
    
    // get the data from SONOS player and transform to JavaScript Objects
    const householdPlayers = await anyTsPlayer.GetZoneGroupState()
    
    // select only ZoneGroupState not the other attributes and check
    if (!xIsTruthyProperty(householdPlayers, ['ZoneGroupState'])) {
      throw new Error(`${PACKAGE_PREFIX} property ZoneGroupState is missing`)
    }
    const decoded = await xDecodeHtmlEntity(householdPlayers.ZoneGroupState)
    const groups = await parser.parse(decoded, {
      'ignoreAttributes': false,
      'attributeNamePrefix': '_',
      'parseNodeValue': false
    }) 
    if (!xIsTruthy(groups)) {
      throw new Error(`${PACKAGE_PREFIX} response form parse xml is invalid.`)
    }
    if (!xIsTruthyProperty(groups, ['ZoneGroupState', 'ZoneGroups', 'ZoneGroup'])) {
      throw new Error(`${PACKAGE_PREFIX} response form parse xml: properties missing.`)
    }

    // convert single item to array: all groups array and all members array
    let groupsArray
    if (Array.isArray(groups.ZoneGroupState.ZoneGroups.ZoneGroup)) {
      groupsArray = groups.ZoneGroupState.ZoneGroups.ZoneGroup.slice()
    } else {
      groupsArray = [groups.ZoneGroupState.ZoneGroups.ZoneGroup] //convert to single item array
    }
    groupsArray = groupsArray.map(group => {
      if (!Array.isArray(group.ZoneGroupMember)) group.ZoneGroupMember = [group.ZoneGroupMember]
      return group
    })
    // result is groupsArray is array<groupDataRaw> and always arrays (not single item)

    // sort all groups that coordinator is in position 0 and select properties
    // see typeDef playerGroupData
    const groupsArraySorted = [] // result to be returned
    let groupSorted // keeps the group members, now sorted
    let coordinatorUuid = ''
    let groupId = ''
    let playerName = ''
    let uuid = ''
    let invisible = ''
    let channelMapSet = ''
    let urlObject // player JavaScript build-in URL
    for (let iGroup = 0; iGroup < groupsArray.length; iGroup++) {
      groupSorted = []
      coordinatorUuid = groupsArray[iGroup]._Coordinator
      groupId = groupsArray[iGroup]._ID
      // first push coordinator, other properties will be updated later!
      groupSorted.push({ groupId, 'uuid': coordinatorUuid })
      
      for (let iMember = 0; iMember < groupsArray[iGroup].ZoneGroupMember.length; iMember++) {
        urlObject = new URL(groupsArray[iGroup].ZoneGroupMember[iMember]._Location)
        urlObject.pathname = '' // clean up
        uuid = groupsArray[iGroup].ZoneGroupMember[iMember]._UUID  
        // my naming is playerName instead of the SONOS ZoneName
        playerName = groupsArray[iGroup].ZoneGroupMember[iMember]._ZoneName
        invisible = (groupsArray[iGroup].ZoneGroupMember[iMember]._Invisible === '1')
        channelMapSet = groupsArray[iGroup].ZoneGroupMember[iMember]._ChannelMapSet || ''      
        if (groupsArray[iGroup].ZoneGroupMember[iMember]._UUID !== coordinatorUuid) {
          // push new except coordinator
          groupSorted.push({ urlObject, playerName, uuid, groupId, invisible, channelMapSet })
        } else {
          // update coordinator on position 0 with name
          groupSorted[0].urlObject = urlObject
          groupSorted[0].playerName = playerName
          groupSorted[0].invisible = invisible
          groupSorted[0].channelMapSet = channelMapSet
        }
      }
      groupSorted = groupSorted.filter((member) => member.invisible === false)
      groupsArraySorted.push(groupSorted)
    }
    return groupsArraySorted 
  },

  /** Extract group for a given player.
   * @param {string} playerUrlHost (wikipedia) host such as 192.168.178.37
   * @param {object} allGroupsData from getGroupsAll
   * @param {string} [playerName] SONOS-Playername such as Kitchen 
   * 
   * @returns {promise<object>}  returns object:
   *  { groupId, playerIndex, coordinatorIndex, members[]<playerGroupData> } 
   *
   * @throws {error} 
   */
  extractGroup: async function (playerUrlHost, allGroupsData, playerName) {
    debug('method >>%s', 'extractGroup')
    
    // this ensures that playerName overrules given playerUrlHostname
    const searchByPlayerName = xIsTruthyStringNotEmpty(playerName)

    // find player in group bei playerUrlHostname or playerName
    // playerName overrules playerUrlHostname
    let foundGroupIndex = -1 // indicator for player NOT found
    let visible
    let groupId
    let usedPlayerUrlHost = ''
    for (let iGroup = 0; iGroup < allGroupsData.length; iGroup++) {
      for (let iMember = 0; iMember < allGroupsData[iGroup].length; iMember++) {
        visible = !allGroupsData[iGroup][iMember].invisible
        groupId = allGroupsData[iGroup][iMember].groupId
        if (searchByPlayerName) {
          // we compare playerName (string) such as Küche
          if (allGroupsData[iGroup][iMember].playerName === playerName && visible) {
            foundGroupIndex = iGroup
            usedPlayerUrlHost = allGroupsData[iGroup][iMember].urlObject.hostname
            break // inner loop
          }
        } else {
          // we compare by URL hostname such as '192.168.178.35'
          if (allGroupsData[iGroup][iMember].urlObject.hostname
            === playerUrlHost && visible) {
            foundGroupIndex = iGroup
            usedPlayerUrlHost = allGroupsData[iGroup][iMember].urlObject.hostname
            break // inner loop
          }
        }
      }
      if (foundGroupIndex >= 0) {
        break // break also outer loop
      }
    }
    if (foundGroupIndex === -1) {
      throw new Error(`${PACKAGE_PREFIX} could not find given player in any group`)
    }
    
    // remove all invisible players player (in stereopair there is one invisible)
    const members = allGroupsData[foundGroupIndex].filter((member) => (member.invisible === false))

    // find our player index in that group. At this position because we did filter!
    // that helps to figure out role: coordinator, joiner, independent
    // eslint-disable-next-line max-len
    const playerIndex = members.findIndex((member) => (member.urlObject.hostname === usedPlayerUrlHost))

    return {
      groupId,
      playerIndex,
      'coordinatorIndex': 0,
      members
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
   * @param  {player[]} playersInGroup player data in group, coordinator at 0 
   * @param  {object} player player 
   * @param  {object} player.urlObject  player JavaScript build-in URL
   * @param  {string} player.playerName SONOS-Playername
   * @param  {object} options
   * @param  {boolean} [options.snapVolumes = false] capture all players volume
   * @param  {boolean} [options.snapMutestates = false] capture all players mute state
   *
   * @returns {promise<Snapshot>} group snapshot object
   * 
   * @throws {error} if invalid response from SONOS player
  */
  createGroupSnapshot: async function (playersInGroup, options) {
    debug('method >>%s', 'createGroupSnapshot')
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
        member.volume = await xGetVolume(playersInGroup[index].urlObject)
      }
      if (options.snapMutestates) {
        member.mutestate =  await xGetMutestate(playersInGroup[index].urlObject)
      }
      snapshot.membersData.push(member)
    }

    const coordinatorUrlObject = playersInGroup[0].urlObject
    snapshot.playbackstate = await xGetPlaybackstate(coordinatorUrlObject)
    snapshot.wasPlaying = (snapshot.playbackstate === 'playing'
    || snapshot.playbackstate === 'transitioning')
    const mediaData = await xGetMediaInfo(coordinatorUrlObject)
    const positionData = await xGetPositionInfo(coordinatorUrlObject)
    Object.assign(snapshot,
      {
        CurrentURI: mediaData.CurrentURI,
        CurrentURIMetadata: mediaData.CurrentURIMetaData,
        NrTracks: mediaData.NrTracks
      })
    Object.assign(snapshot,
      {
        Track: positionData.Track,
        RelTime: positionData.RelTime,
        TrackDuration: positionData.TrackDuration
      })
    return snapshot
  },

  /**  Restore snapshot of group. Group topology must be the same!
   * @param  {object<Snapshot>}  snapshot - see typedef
   
   * @returns {promise} true
   *
   * @throws if invalid response from SONOS player
   */
  restoreGroupSnapshot: async function (snapshot) {
    debug('method >>%s', 'restoreGroupSnapshot')
    // restore content
    // urlSchemeAuthority because we do create/restore
    const coordinatorUrlObject = new URL(snapshot.membersData[0].urlSchemeAuthority)
    const metadata = snapshot.CurrentURIMetadata
    await xSetAvTransport(coordinatorUrlObject,
      {
        'CurrentURI': snapshot.CurrentURI,
        'CurrentURIMetaData': metadata
      })

    let track
    if (xIsTruthyProperty(snapshot, ['Track'])) {
      track = parseInt(snapshot['Track'])
    }
    let nrTracks
    if (xIsTruthyProperty(snapshot, ['NrTracks'])) {
      nrTracks = parseInt(snapshot['NrTracks'])
    }
    if (track >= 1 && nrTracks >= track) {
      debug('Setting track to >>%s', snapshot.Track)
      // we need to wait until track is selected
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](500)
      xSelectTrack(coordinatorUrlObject, track)
        .catch(() => {
          debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.RelTime && snapshot.TrackDuration !== '0:00:00') {
      // we need to wait until track is selected
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](100)
      debug('Setting back time to >>%', snapshot.RelTime)
      await xPositionInTrack(coordinatorUrlObject, snapshot.RelTime)
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
      urlObject  = new URL(snapshot.membersData[index].urlSchemeAuthority)
      if (volume !== '-1') { // volume is of type string
        await xSetVolume(urlObject, parseInt(volume))
      }
      mutestate = snapshot.membersData[index].mutestate
      if (mutestate != null) {
        await xSetMutestate(urlObject, mutestate)
      }
    }
    if (snapshot.wasPlaying) {
      await xPlay(coordinatorUrlObject)
    }
    return true
  },

  /**
  * Transformed data of Browse action response. 
  * @global
  * @typedef {object} DidlBrowseItem
  * @property {string} id object id, can be used in Browse command 
  * @property {string} title title 
  * @property {string} artist='' artist
  * @property {string} album='' album
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
   * @throws {error} invalid return from Browse, xDecodeHtmlEntity, xParseBrowsDidlXmlToArray
   */  
  getMySonos: async function (tsPlayer, requestedCount) { 
    debug('method >>%s', 'getMySonos')
    const favorites = await tsPlayer.ContentDirectoryService.Browse({
      ObjectID: 'FV:2', BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0,
      RequestedCount: requestedCount, SortCriteria: ''
    })

    let transformedItems = await xParseBrowseToArray(favorites, 'item', PACKAGE_PREFIX)
    transformedItems = await Promise.all(transformedItems.map(async (item) => {
      if (item.artUri.startsWith('/getaa')) {
        item.artUri = tsPlayer.urlObject.origin + item.artUri
      }
      
      if (xIsTruthyProperty(item, ['uri'])) {
        item.radioId = xGetRadioId(item.uri)
      }

      // My Sonos items have own upnp class object.itemobject.item.sonos-favorite"
      // metadata contains the relevant upnp class of the track, album, stream, ...
      if (xIsTruthyProperty(item, ['metadata'])) {
        item.upnpClass = await xGetUpnpClassEncoded(item['metadata'])
    
        if (module.exports.UPNP_CLASSES_STREAM.includes(item.upnpClass)) {
          item.processingType = 'stream'
        } else if (module.exports.UPNP_CLASSES_QUEUE.includes(item.upnpClass)) {
          item.processingType = 'queue'
        } else {
          // default as it works in most case
          item.processingType = 'queue'
        }
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
    debug('method >>%s', 'getSonosPlaylists')

    const browsePlaylist = await tsPlayer.ContentDirectoryService.Browse({
      ObjectID: 'SQ:', BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0,
      RequestedCount: requestedCount, SortCriteria: ''
    })
    
    let transformed = await xParseBrowseToArray(browsePlaylist, 'container', PACKAGE_PREFIX)
    transformed = transformed.map((item) => {
      if (item.artUri.startsWith('/getaa')) {
        item.artUri = tsPlayer.urlObject.origin + item.artUri
      }
      return item
    })
    return transformed
  }, 

}
