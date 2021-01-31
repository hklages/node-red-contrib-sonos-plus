/**
 * Collection of 
 * 
 * - special SONOS commands for group/My Sonos handling
 * 
 * - the basic executeAction command and simple commands
 * 
 * - helpers such as getRadioId
 * 
 * handling the communication above SOAP level. SOAP Level communication is done in module Soap.
 * 
 * @see <a href="https://github.com/hklages/node-red-contrib-sonos-plus/wiki">Wiki</a> for overview.
 *
 * @module Sonos-Commands
 * 
 * @author Henning Klages
 * 
 * @since 2020-12-16
*/

'use strict'

const { isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString,
  getNestedProperty, hhmmss2msec, NRCSP_PREFIX, isTruthy
} = require('./Helper.js')

const { sendSoapToPlayer } = require('./Soap.js')
const xml2js = require('xml2js')
const { GenerateMetadata } = require('sonos').Helpers

const debug = require('debug')('nrcsp:Sonos-Commands')

/**
  * Transformed data of Browse action response. 
  * @global
  * @typedef {object} DidlBrowseItem
  * @property {string} id object id, can be used for Browse command 
  * @property {string} title title 
  * @property {string} artist='' artist
  * @property {string} uri='' AVTransportation URI
  * @property {string} artUri='' URI of cover, if available
  * @property {string} metadata='' metadata usually in DIDL Lite format
  * @property {string} sid='' music service id (derived from uri)
  * @property {string} serviceName='' music service name such as Amazon Music (derived from uri)
  * @property {string} upnpClass='' UPnP Class (derived from uri or upnp class)
  * @property {string} processingType='' can be 'queue', 'stream', 'unsupported' or empty
  */

module.exports = {
  // SONOS related data
  MEDIA_TYPES: ['all', 'Playlist', 'Album', 'Track'],
  MIME_TYPES: ['.mp3', '.mp4', '.flac', '.m4a', '.ogg', '.wma'],
  ACTIONS_TEMPLATESV6: require('./Db-ActionsV6.json'),
  MUSIC_SERVICES: require('./Db-MusicServices.json'),

  UNPN_CLASSES_UNSUPPORTED: [
    'object.container.podcast.#podcastContainer',
    'object.container.albumlist'
  ],
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

  //
  //                                COMPLEX COMMANDS
  //...............................................................................................

  /**  Play notification on a group. Coordinator is index 0 in nodesonosPlayerArray
   * @param  {object}  node current node - for debugging
   * @param  {nodesonosPlayer[]}  nodesonosPlayerArray array of node-sonos player with url,
   *                   coordinator has index 0.
   *                   length = 1 is allowed if independent
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

  // TODO optimize and remove node-sonos commands
  playGroupNotification: async function (node, nodesonosPlayerArray, options) {
    const WAIT_ADJUSTMENT = 2000

    // generate metadata if not provided and uri as URL
    let metadata
    if (!isValidProperty(options, ['metadata'])) {
      metadata = GenerateMetadata(options.uri).metadata
    } else {
      metadata = options.metadata
    }
    if (metadata !== '') {
      metadata = module.exports.encodeHtml(metadata) // html not url encoding!
    }
    node.debug('metadata >>' + JSON.stringify(metadata))
    const uri = new URL(options.uri)

    // create snapshot state/volume/content
    // getCurrentState will return playing for a non-coordinator player even if group is playing
    const iCoord = 0
    const snapshot = {}
    const state = await nodesonosPlayerArray[iCoord].getCurrentState()
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    node.debug('wasPlaying >>' + snapshot.wasPlaying)
    snapshot.mediaInfo
      = await nodesonosPlayerArray[iCoord].avTransportService().GetMediaInfo()
    snapshot.positionInfo = await nodesonosPlayerArray[0].avTransportService().GetPositionInfo()
    snapshot.memberVolumes = []
    if (options.volume !== -1) {
      snapshot.memberVolumes[0] = await nodesonosPlayerArray[iCoord].getVolume()
    }
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < nodesonosPlayerArray.length; index++) {
        snapshot.memberVolumes[index] = await nodesonosPlayerArray[index].getVolume()
      }
    }
    node.debug('Snapshot created - now start playing notification')

    // set AVTransport
    const args = {
      InstanceID: 0,
      CurrentURI: module.exports.encodeHtml(uri.toString()),
      CurrentURIMetaData: metadata
    }
    await module.exports.executeActionV6(nodesonosPlayerArray[iCoord].url,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', args)

    if (options.volume !== -1) {
      await module.exports.setPlayerVolume(nodesonosPlayerArray[iCoord].url, options.volume)
      node.debug('same Volume' + options.sameVolume)
      if (options.sameVolume) { // all other members, starting at 1
        for (let index = 1; index < nodesonosPlayerArray.length; index++) {
          await module.exports.setPlayerVolume(nodesonosPlayerArray[index].url, options.volume)
        }
      }
    }
    // no check - always returns true
    await module.exports.executeActionV6(nodesonosPlayerArray[iCoord].url,
      '/MediaRenderer/AVTransport/Control', 'Play',
      { InstanceID: 0, Speed: 1 })
   
    node.debug('Playing notification started - now figuring out the end')

    // waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = hhmmss2msec(options.duration)
    if (options.automaticDuration) {
      const positionInfo
        = await nodesonosPlayerArray[iCoord].avTransportService().GetPositionInfo()
      if (isValidProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = hhmmss2msec(positionInfo.TrackDuration) + WAIT_ADJUSTMENT
        node.debug('Did retrieve duration from SONOS player')
      } else {
        node.debug('Could NOT retrieve duration from SONOS player - using default/specified length')
      }
    }
    node.debug('duration >>' + JSON.stringify(waitInMilliseconds))
    await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](waitInMilliseconds)
    node.debug('notification finished - now starting to restore')

    // return to previous state = restore snapshot
    if (options.volume !== -1) {
      await module.exports.setPlayerVolume(nodesonosPlayerArray[iCoord].url,
        snapshot.memberVolumes[iCoord])
    }
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < nodesonosPlayerArray.length; index++) {
        await module.exports.setPlayerVolume(nodesonosPlayerArray[index].url,
          snapshot.memberVolumes[index])
      }
    }
    if (!options.uri.includes('x-sonos-vli')) {
      // that means initiated by Spotify or Amazon Alexa - can not recover)
      await nodesonosPlayerArray[iCoord].setAVTransportURI({
        uri: snapshot.mediaInfo.CurrentURI,
        metadata: snapshot.mediaInfo.CurrentURIMetaData,
        onlySetUri: true // means don't play
      })
    }
    if (snapshot.positionInfo.Track && snapshot.positionInfo.Track > 1
      && snapshot.mediaInfo.NrTracks > 1) {
      await nodesonosPlayerArray[iCoord].selectTrack(snapshot.positionInfo.Track)
        .catch(() => {
          node.debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.positionInfo.RelTime && snapshot.positionInfo.TrackDuration !== '0:00:00') {
      node.debug('Setting back time to >>' + JSON.stringify(snapshot.positionInfo.RelTime))
      await nodesonosPlayerArray[iCoord].avTransportService().Seek({
        InstanceID: 0, Unit: 'REL_TIME', Target: snapshot.positionInfo.RelTime
      })
        .catch(() => {
          node.debug('Reverting back track time failed, happens for some music services.')
        })
    }
    if (snapshot.wasPlaying) {
      if (!options.uri.includes('x-sonos-vli')) {
        await nodesonosPlayerArray[iCoord].play()
      }
    }
  },

  /**  Play notification on a single joiner but must not be coordinator.
   * @param  {object}  node current node - for debugging
   * @param  {object}  nodesonosCoordinator node-sonos coordinator in group with url
   * @param  {object}  nodesonosJoiner node-sonos player in group with url
   * @param  {object}  options options
   * @param  {string}  options.uri  uri
   * @param  {string}  [options.metadata]  metadata - will be generated if missing
   * @param  {string}  options.volume volume during notification: 
   *                  - 1 means don't touch. integer 1 .. 99
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
  playJoinerNotification: async function (node, nodesonosCoordinator, nodesonosJoiner, options) {
    const WAIT_ADJUSTMENT = 2000

    // generate metadata if not provided and uri as URL
    let metadata
    if (!isValidProperty(options, ['metadata'])) {
      metadata = GenerateMetadata(options.uri).metadata
    } else {
      metadata = options.metadata
    }
    if (metadata !== '') {
      metadata = module.exports.encodeHtml(metadata) // html not url encoding!
    }
    node.debug('metadata >>' + JSON.stringify(metadata))
    const uri = new URL(options.uri)

    // create snapshot state/volume/content
    // getCurrentState will return playing for a non-coordinator player even if group is playing
    const snapshot = {}
    const state = await nodesonosCoordinator.getCurrentState() // joiner does not show valid state!
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    snapshot.mediaInfo = await nodesonosJoiner.avTransportService().GetMediaInfo()
    if (options.volume !== -1) {
      snapshot.joinerVolume = await nodesonosJoiner.getVolume()
    }
    node.debug('Snapshot created - now start playing notification')

    // set the joiner to notification - joiner will leave group!
    const args = {
      InstanceID: 0,
      CurrentURI: module.exports.encodeHtml(uri.toString()),
      CurrentURIMetaData: metadata
    }
    await module.exports.executeActionV6(nodesonosJoiner.url,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
      args)

    // no check - always returns true
    await module.exports.executeActionV6(nodesonosJoiner.url,
      '/MediaRenderer/AVTransport/Control', 'Play',
      { InstanceID: 0, Speed: 1 })

    if (options.volume !== -1) {
      await module.exports.setPlayerVolume(nodesonosJoiner.url, options.volume)
    }
    node.debug('Playing notification started - now figuring out the end')

    // waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = hhmmss2msec(options.duration)
    if (options.automaticDuration) {
      const positionInfo = await nodesonosJoiner.avTransportService().GetPositionInfo()
      if (isValidProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = hhmmss2msec(positionInfo.TrackDuration) + WAIT_ADJUSTMENT
        node.debug('Did retrieve duration from SONOS player')
      } else {
        node.debug('Could NOT retrieve duration from SONOS player - using default/specified length')
      }
    }
    node.debug('duration >>' + JSON.stringify(waitInMilliseconds))
    await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](waitInMilliseconds)
    node.debug('notification finished - now starting to restore')

    // return to previous state = restore snapshot
    if (options.volume !== -1) {
      await module.exports.setPlayerVolume(nodesonosJoiner.url, snapshot.joinerVolume)
    }
    await nodesonosJoiner.setAVTransportURI({
      uri: snapshot.mediaInfo.CurrentURI,
      metadata: snapshot.mediaInfo.CurrentURIMetaData,
      onlySetUri: true // means don't play
    })
    if (snapshot.wasPlaying) {
      await nodesonosJoiner.play()
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
   * @property {string} member.urlOrigin such as http://192.168.178.37:1400/
   * @property {boolean} member.mutestate null for not available
   * @property {string} member.volume -1 for not available
   * @property {string} member.playerName SONOS-Playername
   */

  /**  Creates snapshot of a current group.
   * @param  {object}  node current node - for debugging
   * @param  {player[]} playersInGroup player data in group, coordinator at 0 
   * @param  {object} player player 
   * @param  {object} player.url  URL (JavaScript build in)
   * @param  {string} player.playerName SONOS-Playername
   * @param  {object} options
   * @param  {boolean} [options.snapVolumes = false] capture all players volume
   * @param  {boolean} [options.snapMutestates = false] capture all players mute state
   *
   * @returns {promise<Snapshot>} group snapshot object
   * 
   * @throws {error} if invalid response from SONOS player
  */
  createGroupSnapshot: async function (node, playersInGroup, options) {
    const snapshot = {}
    snapshot.membersData = []
    let member
    for (let index = 0; index < playersInGroup.length; index++) {
      member = { // default
        // url.origin because it may stored in flow variable
        urlOrigin: playersInGroup[index].url.origin,
        mutestate: null,
        volume: '-1',
        playerName: playersInGroup[index].playerName
      }
      if (options.snapVolumes) {
        member.volume = await module.exports.getPlayerVolume(playersInGroup[index].url)
      }
      if (options.snapMutestates) {
        member.mutestate =  await module.exports.getPlayerMutestate(playersInGroup[index].url)
      }
      snapshot.membersData.push(member)
    }

    const coordinatorUrl = playersInGroup[0].url
    snapshot.playbackstate = await module.exports.getCoordinatorPlaybackstate(coordinatorUrl)
    snapshot.wasPlaying = (snapshot.playbackstate === 'playing'
      || snapshot.playbackstate === 'transitioning')
    const mediaData = await module.exports.getCoordinatorMediaInfo(coordinatorUrl)
    const positionData = await module.exports.getCoordinatorPositionInfo(coordinatorUrl)
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
   * @param  {object}  node current node - for debugging
   * @param  {object<Snapshot>}  snapshot - see typedef
   
   * @returns {promise} true
   *
   * @throws if invalid response from SONOS player
   */
  restoreGroupSnapshot: async function (node, snapshot) {
    // restore content
    // urlOrigin because we do create/restore
    const coordinatorUrl = new URL(snapshot.membersData[0].urlOrigin)
    const metadata = snapshot.CurrentURIMetadata
    await module.exports.setPlayerAVTransport(coordinatorUrl,
      {
        'CurrentURI': snapshot.CurrentURI,
        'CurrentURIMetaData': metadata
      })

    let track
    if (isValidProperty(snapshot, ['Track'])) {
      track = parseInt(snapshot['Track'])
    }
    let nrTracks
    if (isValidProperty(snapshot, ['NrTracks'])) {
      nrTracks = parseInt(snapshot['NrTracks'])
    }
    if (track >= 1 && nrTracks >= track) {
      node.debug('Setting track to >>' + snapshot.Track)
      // we need to wait until track is selected
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](500)
      module.exports.coordinatorPlayTrack(coordinatorUrl, track)
        .catch(() => {
          node.debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.RelTime && snapshot.TrackDuration !== '0:00:00') {
      // we need to wait until track is selected
      await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](100)
      node.debug('Setting back time to >>' + snapshot.RelTime)
      module.exports.coordinatorPositionInTrack(coordinatorUrl, snapshot.RelTime)
        .catch(() => {
          node.debug('Reverting back track time failed, happens for some music services.')
        })
    }
    // restore volume/mute if captured.
    let volume
    let mutestate
    let url // type URL (JavaScript build in)
    for (let index = 0; index < snapshot.membersData.length; index++) {
      volume = snapshot.membersData[index].volume
      url = new URL(snapshot.membersData[index].urlOrigin)
      if (volume !== '-1') { // volume is of type string
        await module.exports.setPlayerVolume(url, parseInt(volume))
      }
      mutestate = snapshot.membersData[index].mutestate
      if (mutestate != null) {
        await module.exports.setPlayerMutestate(url, mutestate)
      }
    }
    if (snapshot.wasPlaying) {
      await module.exports.coordinatorPlay(coordinatorUrl)
    }
    return true
  },

  /** Get array of all SONOS player data in same group, index of player and groupId
   * Coordinator is first in array. Hidden players are ignored!
   * @param  {object} nodesonosPlayer node-sonos player with url
   * @param  {string} [playerName=use nodesonosPlayer] valid SONOS-Playername
   * 
   * @returns {promise<Object>} returns { playerIndex, groupId, members[]<playerGroupData> } 
   *
   * @throws {error} from getGroupsAll and if invalid data
   * @throws {error} if sonosPlayer respectively playerName not found in any group
   */
  getGroupCurrent: async function (nodesonosPlayer, playerName) {
    // playerName !== '' then use playerName
    const searchByPlayerName = isTruthyAndNotEmptyString(playerName)
    const allGroupsData = await module.exports.getGroupsAll(nodesonosPlayer.url)
    if (!isTruthyAndNotEmptyString(allGroupsData)) {
      throw new Error(`${NRCSP_PREFIX} all groups data undefined`)
    }

    // find our players group in all groups- either by name or ip
    let foundGroupIndex = -1 // indicator for player NOT found
    let visible
    let groupId
    let usedPlayerHostname = ''
    for (let iGroup = 0; iGroup < allGroupsData.length; iGroup++) {
      for (let iMember = 0; iMember < allGroupsData[iGroup].length; iMember++) {
        visible = !allGroupsData[iGroup][iMember].invisible
        groupId = allGroupsData[iGroup][iMember].groupId
        if (searchByPlayerName) {
          // we compare playerName (string) such as Küche
          if (allGroupsData[iGroup][iMember].playerName === playerName && visible) {
            foundGroupIndex = iGroup
            usedPlayerHostname = allGroupsData[iGroup][iMember].url.hostname
            break // inner loop
          }
        } else {
          // we compare by URL.hostname such as '192.168.178.35'
          if (allGroupsData[iGroup][iMember].url.hostname
            === nodesonosPlayer.url.hostname && visible) {
            foundGroupIndex = iGroup
            usedPlayerHostname = allGroupsData[iGroup][iMember].url.hostname
            break // inner loop
          }
        }
      }
      if (foundGroupIndex >= 0) {
        break // break also outer loop
      }
    }
    if (foundGroupIndex === -1) {
      throw new Error(`${NRCSP_PREFIX} could not find givenn player in any group`)
    }
    
    // remove all invisible players player (in stereopair there is one invisible)
    const members = allGroupsData[foundGroupIndex].filter((member) => (member.invisible === false))

    // find our player index in that grup. At this position because we did filter!
    // that helps to figure out role: coordinator, joiner, independent
    const playerIndex = members.findIndex((member) => (member.url.hostname === usedPlayerHostname))

    return {
      playerIndex,
      groupId,
      members
    }
  },

  /**
   * @typedef {object} groupDataRaw group data from action
   * @global
   * @property {string} Coordinator such as RINCON_5CAAFD00223601400
   * @property {string} ID group id such as RINCON_5CAAFD00223601400:481
   * @property {member[]} ZoneGroupMember 
   * @property {object} member 
   * @property {string} member.UUID UUID such as RINCON_5CAAFD00223601400
   * @property {string} member.Location such  http://192.168.178.37:1400/xml/device_description.xml
   * @property {string} member.ZoneName SONOS-Playername such as Küche - (my naming: playerName)
   * @property {boolean} member.invisible 
   * ... and more
   */

  /**
   * @typedef {object} playerGroupData group data transformed
   * @global
   * @property {Object<URL>} url includes protocol, host, port, ...
   * @property {string} playerName SONOS-Playername such as "Küche"
   * @property {string} uuid such as RINCON_5CAAFD00223601400
   * @property {string} groupId such as RINCON_5CAAFD00223601400:482
   * @property {boolean} invisible false in case of any bindings otherwise true
   * @property {string} channelMapSet such as 
   *                    RINCON_000E58FE3AEA01400:LF,LF;RINCON_B8E9375831C001400:RF,RF
   */

  /** 
   * @typedef {object} URL JavaScript build in type
   * @global
   * @property {string} origin such as http://192.168.178.37:1400
   * @property {string} hostname such as 192.168.178.37
   * @property {string} port such as 1440
   * @property {string} member.UUID UUID such as RINCON_5CAAFD00223601400
   * ... and more @see https://javascript.info/url
   */
  
  /** Get array of all groups. Each group consist of an array of players<playerGroupData>  
   * Coordinator is always in position 0. Group array may have size 1 (standalone)
   * @param  {object} playerUrl URL (JavaScript build in datatype)
   * 
   * @returns {promise<playerGroupData[]>} array of arrays with playerGroupData
   *          First group member is coordinator.
   *
   * @throws {error} from executeActionsV6, groupXmlToArray or if invalid response
   * @throws {error} 
   */
  getGroupsAll: async function (playerUrl) {
    
    // get the data from SONOS player and transform to JavaScript Objects
    const householdPlayers = await module.exports.executeActionV6(playerUrl,
      '/ZoneGroupTopology/Control', 'GetZoneGroupState', {})
    if (!isTruthyAndNotEmptyString(householdPlayers)) {
      throw new Error(`${NRCSP_PREFIX} invalid response GetZoneGroupState..`)
    }
    const groups = await module.exports.groupXmlToArray(householdPlayers)
    if (!isTruthyAndNotEmptyString(groups)) {
      throw new Error(`${NRCSP_PREFIX} response form parsing GetZoneGroupState.`)
    }
    if (!isValidPropertyNotEmptyString(groups, ['ZoneGroup'])) {
      throw new Error(`${NRCSP_PREFIX} response form parsing GetZoneGroupState.`)
    }

    // convert single item to array: all groups array and all members array
    let groupsArray
    if (Array.isArray(groups.ZoneGroup)) {
      groupsArray = groups.ZoneGroup.slice()
    } else {
      groupsArray = [groups.ZoneGroup] //convert to single item array
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
    let url // type URL JavaScript build in
    for (let iGroup = 0; iGroup < groupsArray.length; iGroup++) {
      groupSorted = []
      coordinatorUuid = groupsArray[iGroup].Coordinator
      groupId = groupsArray[iGroup].ID
      // first push coordinator, others will be updated later!
      groupSorted.push({ groupId, 'uuid': coordinatorUuid })
      
      for (let iMember = 0; iMember < groupsArray[iGroup].ZoneGroupMember.length; iMember++) {
        url = new URL(groupsArray[iGroup].ZoneGroupMember[iMember].Location)
        url.pathname = '' // clean up
        uuid = groupsArray[iGroup].ZoneGroupMember[iMember].UUID  
        // my naming is playerName instead of the SONOS ZoneName
        playerName = groupsArray[iGroup].ZoneGroupMember[iMember].ZoneName
        invisible = (groupsArray[iGroup].ZoneGroupMember[iMember].Invisible === '1')
        channelMapSet = groupsArray[iGroup].ZoneGroupMember[iMember].ChannelMapSet || ''
        
        if (groupsArray[iGroup].ZoneGroupMember[iMember].UUID !== coordinatorUuid) {
          groupSorted.push({ url, playerName, uuid, groupId, invisible, channelMapSet })
        } else {
          // update coordinator on position 0 with name
          groupSorted[0].url = url
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

  /**  Get array of all My Sonos items - maximum 200. Includes SONOS-Playlists (maximum 999)
   * @param {object} playerUrl URL  http://192.168.178.35:1400
   *
   * @returns {Promise<DidlBrowseItem[]>} all My-Sonos Items and SONOS-Playlists as array, 
   * could be empty
   *
   * @throws {error} nrcsp: invalid return from Browse, didlXmlToArray error
   *
   * Restriction: Maximum number of My-Sonos items: 200, maximum number of SONOS-Playlists 999.
   * Restrictions: MusicLibrary/ Sonos playlists without service id.
   * Restrictions: Audible Audio books are missing.
   * Restrictions: Pocket Casts Podcasts without uri, only metadata
   */
  getMySonosV3: async function (playerUrl) {
    // get all My-Sonos items (ObjectID FV:2) - maximum 200, but not SONOS-Playlists
    const browseFv = await module.exports.executeActionV6(playerUrl,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'FV:2', BrowseFlag: 'BrowseDirectChildren', Filter: '*',
        StartingIndex: 0, RequestedCount: 200, SortCriteria: ''
      })
    if (!isValidPropertyNotEmptyString(browseFv, ['NumberReturned'])) {
      throw new Error(`${NRCSP_PREFIX} invalid response Browse FV:2 - missing NumberReturned`)
    }
    if (browseFv.NumberReturned === '0') {
      throw new Error(`${NRCSP_PREFIX} Could not find any My Sonos item (please add at least one)`)
    }
    
    const listMySonos = await module.exports.didlXmlToArray(browseFv.Result, 'item')
    if (!isTruthyAndNotEmptyString(listMySonos)) {
      throw new Error(`${NRCSP_PREFIX} response form parsing Browse FV-2 is invalid.`)
    }
    let mySonosPlusPl = []
    // TuneIn radio stations: Radio id, playerUrl.origin to albumArtUri
    mySonosPlusPl = listMySonos.map(item => {
      let  artUri = ''  
      if (isValidPropertyNotEmptyString(item, ['artUri'])) {
        artUri = item['artUri']
        if (typeof artUri === 'string' && artUri.startsWith('/getaa')) {
          artUri = playerUrl.origin + artUri
        } 
      }
      item.artUri = artUri
      
      if (isValidProperty(item, ['uri'])) {
        item.radioId = module.exports.getRadioId(item.uri)
      }

      // My Sonos items have own upnp class object.itemobject.item.sonos-favorite"
      // metadata contains the relevant upnp class of the track, album, stream, ...
      if (isValidProperty(item, ['metadata'])) {
        item.upnpClass = module.exports.getUpnpClass(item['metadata'])
      }
      if (module.exports.UPNP_CLASSES_STREAM.includes(item.upnpClass)) {
        item.processingType = 'stream'
      } else if (module.exports.UPNP_CLASSES_QUEUE.includes(item.upnpClass)) {
        item.processingType = 'queue'
      } else {
        // default as it works in most case
        item.processingType = 'queue'
      }

      return item
    })

    // get all SONOS-Playlists
    const newListPlaylists = await module.exports.getSonosPlaylistsV2(playerUrl)

    return mySonosPlusPl.concat(newListPlaylists)
  },

  /** Get array of all SONOS-Playlists - maximum 999. 
   * Adds playerUrl.origin to artUri and processingType
   * @param {object} playerUrl player URL http://192.168.178.35:1400
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-Playlists as array, could be empty
   *
   * @throws {error} nrcsp: invalid return from Browse, didlXmlToArray error
   */
  getSonosPlaylistsV2: async function (playerUrl) {
    const browsePlaylist = await module.exports.executeActionV6(playerUrl,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'SQ:', BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0,
        RequestedCount: 999, SortCriteria: ''
      })
    if (!isValidPropertyNotEmptyString(browsePlaylist, ['NumberReturned'])) {
      throw new Error(`${NRCSP_PREFIX} invalid response Browse SQ: - missing NumberReturned`)
    }
    let  modifiedPlaylistsArray = []
    if (browsePlaylist.NumberReturned !== '0') {
      if (!isValidPropertyNotEmptyString(browsePlaylist, ['Result'])) {
        throw new Error(`${NRCSP_PREFIX} invalid response Browse SQ: - missing Result`)
      }

      // container
      const playlistArray = await module.exports.didlXmlToArray(browsePlaylist.Result, 'container')
      if (!isTruthyAndNotEmptyString(playlistArray)) {
        throw new Error(`${NRCSP_PREFIX} response form parsing Browse SQ is invalid.`)
      }
      
      // add playerUrl.origin to artUri
      modifiedPlaylistsArray = playlistArray.map(item => {
        let  artUri = ''  
        if (isValidPropertyNotEmptyString(item, ['artUri'])) {
          artUri = item['artUri']
          if (typeof artUri === 'string' && artUri.startsWith('/getaa')) {
            artUri = playerUrl.origin + artUri
          } 
        }
        item.artUri = artUri
        item.processingType = 'queue'
        return item
      })
    }
    return modifiedPlaylistsArray
  },
  
  /** Get array of all SONOS-Queue items - maximum 200. 
   * Adds processingType and playerUrlOrigin to artUri.
   * @param {object} playerUrl player URL origin http://192.168.178.35:1400
   *
   * @returns {Promise<DidlBrowseItem[]>} all SONOS-queue items, could be empty
   *
   * @throws {error} nrcsp: invalid return from Browse, didlXmlToArray error
   */
  getSonosQueue: async function (playerUrl) {
    const browseQueue = await module.exports.executeActionV6(playerUrl,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      {
        ObjectID: 'Q:0', BrowseFlag: 'BrowseDirectChildren', Filter: '*',
        StartingIndex: 0, RequestedCount: 200, SortCriteria: ''
      })
    if (!isValidPropertyNotEmptyString(browseQueue, ['NumberReturned'])) {
      throw new Error(`${NRCSP_PREFIX} invalid response Browse Q:0 - missing NumberReturned`)
    }
    
    let modifiedQueueArray = []
    if (browseQueue.NumberReturned !== '0') {
      if (!isValidPropertyNotEmptyString(browseQueue, ['Result'])) {
        throw new Error(`${NRCSP_PREFIX} invalid response Browse Q:0 - missing Result`)
      }
      // item
      const queueArray = await module.exports.didlXmlToArray(browseQueue.Result, 'item')
      if (!isTruthyAndNotEmptyString(queueArray)) {
        throw new Error(`${NRCSP_PREFIX} response form parsing Browse Q:0 is invalid.`)
      }

      // update artUri with playerUrl.origin and add proccesingType 'queue'
      modifiedQueueArray = queueArray.map((item) => {
        let  artUri = ''  
        if (isValidPropertyNotEmptyString(item, ['artUri'])) {
          artUri = item['artUri']
          if (typeof artUri === 'string' && artUri.startsWith('/getaa')) {
            artUri = playerUrl.origin + artUri
          } 
        }
        item.artUri = artUri
        item.processingType = 'queue'
        return item
      })
    }
    return modifiedQueueArray
  },

  /** Set the AVTransport stream for given player. Adds InstanceID. Encodes html.
   * CAUTION: a joiner may leave group
   * CAUTION: Does not play - only sets content. Needs a play afterwards
   * CAUTION: No Metadata generation - must be provided!
   * CAUTION: Allows to set all to empty - means no content, will not play
   * Thats done for the createSnapshot, restoreSnapshot!
   * 
   * @param {object} playerUrl player URL (build in object)
   * @param {object} inArgs action arguments (except InstanceID)
   * @param {string} inArgs.CurrentURI such as "x-sonosapi-stream:s119032?sid=254&flags=8224&sn=0"
   * @param {string} inArgs.CurrentURIMetaData uri as DIDL-Lite xml
   *
   * @returns {promise} true
   *
   * @throws {error} from executeActionV6
   * @throws {error} if any inArgs, playerUrl is missing/invalid
   */
  setPlayerAVTransport: async function (playerUrl, inArgs) { 
    if (!isTruthy(playerUrl)) {
      throw new Error(`${NRCSP_PREFIX} playerUrl is invalid/missing.`)
    }
    if (typeof playerUrl !== 'object') { // does not cover all but is ok
      throw new Error(`${NRCSP_PREFIX} playerUrl is not object`)
    }
    
    if (!isTruthy(inArgs)) {
      throw new Error(`${NRCSP_PREFIX} inArgs is invalid/missing.`)
    }
    if (!isValidProperty(inArgs, ['CurrentURI'])) {
      throw new Error(`${NRCSP_PREFIX} CurrentURI is missing.`)
    }
    if (typeof inArgs['CurrentURI'] !== 'string') {
      throw new Error(`${NRCSP_PREFIX} CurrentURI is not type string.`)
    }
    if (!isValidProperty(inArgs, ['CurrentURIMetaData'])) {
      throw new Error(`${NRCSP_PREFIX} CurrentURIMetaData is missing.`)
    }
    if (typeof inArgs['CurrentURIMetaData'] !== 'string') {
      throw new Error(`${NRCSP_PREFIX} CurrentURIMetaData is not type string.`)
    }
    const metadata = inArgs['CurrentURIMetaData'].trim()
    
    // HTML encoding is very important (caution: not uri encoding)!
    // transformedArgs are embedded in SOAP envelop
    const transformedArgs = {
      'InstanceID': 0, 
      'CurrentURI': module.exports.encodeHtml(inArgs.CurrentURI),
      'CurrentURIMetaData': module.exports.encodeHtml(metadata)
    }

    return await module.exports.executeActionV6(playerUrl,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', transformedArgs)
  },

  //
  //                    SIMPLE COMMANDS - EXECUTE ACTION AND SIMPLE TRANSFORMATION
  //
  //  @param  {object} playerUrl player URL (JavaScript build in )
  //  @throws {error} from executeAction
  //
  //...............................................................................................
  
  // Get mute state of given player. Returns promise<string> current mute state, on|off
  getPlayerMutestate: async function (playerUrl) {
    return (await module.exports.executeActionV6(playerUrl,
      '/MediaRenderer/RenderingControl/Control', 'GetMute',
      { 'InstanceID': 0, 'Channel': 'Master' }) === '1' ? 'on' : 'off')
  },

  // Get media info of given player. Returns promise<object>
  getCoordinatorMediaInfo: async function (coordinatorUrl) {
    return await module.exports.executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'GetMediaInfo',
      { 'InstanceID': 0 })
  },

  // Get playbackstate of given player. Returns promise<string> playbackstate such as playing
  // values: playing, stopped, playing, paused_playback, transitioning, no_media_present
  // Only valid on coordinator!
  getCoordinatorPlaybackstate: async function (coordinatorUrl) {
    const transportInfo = await module.exports.executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'GetTransportInfo',
      { 'InstanceID': 0 })
    return transportInfo.CurrentTransportState.toLowerCase()
  },

  // Get position info of given player. Returns promise<object>
  getCoordinatorPositionInfo: async function (coordinatorUrl) {
    return await module.exports.executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'GetPositionInfo',
      { 'InstanceID': 0 })
  },

  // Get volume of given player. Returns promise<string> current volume, integer, range 0 .. 100
  getPlayerVolume: async function (playerUrl) {
    return await module.exports.executeActionV6(playerUrl,
      '/MediaRenderer/RenderingControl/Control', 'GetVolume',
      { 'InstanceID': 0, 'Channel': 'Master' })
  },

  // Set new mute state at given player. newMutestate string is on|off
  setPlayerMutestate: async function (playerUrl, newMutestate) {
    return await module.exports.executeActionV6(playerUrl,
      '/MediaRenderer/RenderingControl/Control', 'SetMute',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredMute': (newMutestate ==='on') })
  },

  // Set new volume at given player. newVolume is number and must be integer, in range 0 .. 100
  setPlayerVolume: async function (playerUrl, newVolume) {
    return await module.exports.executeActionV6(playerUrl,
      '/MediaRenderer/RenderingControl/Control', 'SetVolume',
      { 'InstanceID': 0, 'Channel': 'Master', 'DesiredVolume': newVolume })
  },

  //** Play (already set) URI.
  coordinatorPlay: async function (coordinatorUrl) {
    return await module.exports.executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'Play',
      { 'InstanceID': 0, 'Speed': 1 })
  },

  //** Play track - requires none empty queue. trackPosition (number) 1 to queue length
  coordinatorPlayTrack: async function (coordinatorUrl, trackPosition) {
    if (!isTruthy(trackPosition)) {
      throw new Error(`${NRCSP_PREFIX} trackPosition is invalid/missing.`)
    }
    if (typeof trackPosition !== 'string' && typeof trackPosition !== 'number') { 
      throw new Error(`${NRCSP_PREFIX} trackPosition is not string/number`)
    }
    const track = parseInt(trackPosition)

    return await module.exports.executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'Seek',
      { 'InstanceID': 0, 'Target': track, 'Unit': 'TRACK_NR' })
  },

  //** Position in track - requires none empty queue. position h:mm:ss
  coordinatorPositionInTrack: async function (coordinatorUrl, positionInTrack) {
    if (!isTruthy(positionInTrack)) {
      throw new Error(`${NRCSP_PREFIX} positionInTrack is invalid/missing.`)
    }
    if (typeof positionInTrack !== 'string') { 
      throw new Error(`${NRCSP_PREFIX} positionInTrack is not string`)
    }

    return await module.exports.executeActionV6(coordinatorUrl,
      '/MediaRenderer/AVTransport/Control', 'Seek',
      { 'InstanceID': 0, 'Target': positionInTrack, 'Unit': 'REL_TIME' })
  },

  //
  //                                EXECUTE UPNP ACTION COMMAND
  //...............................................................................................

  /**  Sends action with actionInArgs to endpoint at playerUrl.origin and returns result.
   * @param  {object} playerUrl player URL (JavaScript build in) such as http://192.168.178.37:1400
   * @param  {string} endpoint the endpoint name such as /MediaRenderer/AVTransport/Control
   * @param  {string} actionName the action name such as Seek
   * @param  {object} actionInArgs all arguments - throws error if one argument is missing!
   *
   * @uses ACTIONS_TEMPLATESV6 to get required inArgs and outArgs. 
   * 
   * @returns {Promise<(object|boolean)>} true or outArgs of that action
   *  
   * @throws {error} nrcsp: any inArgs property missing, http return invalid status or not 200, 
   * missing body, unexpected response
   * @throws {error} xml2js.parseStringPromise 
   * 
   * Everything OK if statusCode === 200 and body includes expected 
   * response value (set) or value (get)
   */
  executeActionV6: async function (playerUrl, endpoint, actionName, actionInArgs) {
    debug('entering method executeActionV6')
    // get action in, out properties from json file
    const endpointActions = module.exports.ACTIONS_TEMPLATESV6[endpoint]
    const { inArgs, outArgs } = endpointActions[actionName]
    
    // actionInArgs must have all properties
    inArgs.forEach(property => {
      if (!isValidProperty(actionInArgs, [property])) {
        throw new Error(`${NRCSP_PREFIX} property ${property} is missing}`)
      }
    })
    
    // generate serviceName from endpoint - its always the second last
    // SONOS endpoint is either /<device>/<serviceName>/Control or /<serviceName>/Control
    const tmp = endpoint.split('/')  
    const serviceName = tmp[tmp.length - 2]
  
    const response
      = await sendSoapToPlayer(playerUrl.origin, endpoint, serviceName, actionName, actionInArgs)

    // Everything OK if statusCode === 200 
    // && body includes expected response value or requested value
    if (!isValidProperty(response, ['statusCode'])) {
      // This should never happen. Just to avoid unhandled exception.
      // eslint-disable-next-line max-len
      throw new Error(`${NRCSP_PREFIX} status code from sendToPlayer is invalid - response.statusCode >>${JSON.stringify(response)}`)
    }
    if (response.statusCode !== 200) {
      // This should not happen as long as axios is being used. Just to avoid unhandled exception.
      // eslint-disable-next-line max-len
      throw new Error(`${NRCSP_PREFIX} status code is not 200: ${response.statusCode} - response >>${JSON.stringify(response)}`)
    }
    if (!isValidProperty(response, ['body'])) {
      // This should not happen. Just to avoid unhandled exception.
      // eslint-disable-next-line max-len
      throw new Error(`${NRCSP_PREFIX} body from sendToPlayer is invalid - response >>${JSON.stringify(response)}`)
    }

    // Convert XML to JSON
    const parseXMLArgs = { mergeAttrs: true, explicitArray: false, charkey: '' } 
    // documentation: https://www.npmjs.com/package/xml2js#options  -- don't change option!
    const bodyXml = await xml2js.parseStringPromise(response.body, parseXMLArgs)

    // RESPONSE
    // The key to the core data is ['s:Envelope','s:Body',`u:${actionName}Response`]
    // There are 2 cases: 
    //   1.   no output argument thats typically in a "set" action: 
    //            expected response is just an envelope with
    //            .... 'xmlns:u' = `urn:schemas-upnp-org:service:${serviceName}:1`  
    //   2.   one or more values typically in a "get" action: in addition 
    //            the values outArgs are included.
    //            .... 'xmlns:u' = `urn:schemas-upnp-org:service:${serviceName}:1` 
    //            and in addition the properties from outArgs
    //   
    const key = ['s:Envelope', 's:Body']
    key.push(`u:${actionName}Response`)

    // check body response
    if (!isValidProperty(bodyXml, key)) {
      // eslint-disable-next-line max-len
      throw new Error(`${NRCSP_PREFIX} body from sendToPlayer is invalid - response >>${JSON.stringify(response)}`)
    }
    let result = getNestedProperty(bodyXml, key)
    if (!isValidProperty(result, ['xmlns:u'])) {
      throw new Error(`${NRCSP_PREFIX} xmlns:u property is missing`)
    }
    const expectedResponseValue = `urn:schemas-upnp-org:service:${serviceName}:1`  
    if (result['xmlns:u'] !== expectedResponseValue) {
      throw new Error(`${NRCSP_PREFIX} unexpected player response: urn:schemas ... is missing `)
    }
    
    if (outArgs.length === 0) { // case 1 
      result = true
    } else {
      // check whether all outArgs exist and return them as object!
      outArgs.forEach(property => { 
        if (!isValidProperty(result, [property])) {
          throw new Error(`${NRCSP_PREFIX} response property ${property} is missing}`)
        }
      })
      delete result['xmlns:u'] // thats not needed
    }
    if (outArgs.length === 1) {
      result = result[outArgs[0]]
    }
    return result
  },

  //
  //                                          HELPERS
  //...............................................................................................

  /** 
   * Returns an array of items (DidlBrowseItem) extracted from action "Browse" output (didlXml).
   * @param  {string}  didlXml Browse response property Result (DIDL-Light string in xml format)
   * @param  {string}  itemName property in DIDL lite holding the data such as "item" or "container"
   *
   * @returns {Promise<DidlBrowseItem[]>} Promise, array of {@link Sonos-Commands#DidlBrowseItem},
   *  maybe empty array.
   *                   
   * @throws {error} if any parameter is missing
   * @throws {error} from method xml2js and invalid response (missing id, title)
   * 
   * Browse provides the results (Result, ... ) in form of a DIDL-Lite xml format. 
   * The <DIDL-Lite> includes several attributes such as xmlns:dc" and entries 
   * all named "container" or "item". These include xml tags such as 'res'. 
   * The items in the container includes also xml tag content.
   * The uri is a xml tag content of res, so we have to define tag = uriIdentifier. 
   */
  didlXmlToArray: async function (didlXml, itemName) {
    if (!isTruthyAndNotEmptyString(didlXml)) {
      throw new Error(`${NRCSP_PREFIX} DIDL-Light input is missing`)
    }
    if (!isTruthyAndNotEmptyString(itemName)) {
      throw new Error(`${NRCSP_PREFIX} item name such as container is missing`)
    }
    const tag = 'uriIdentifier' // uri is text content (_) xml tag content from <res> 
    const parseXMLArgs = { mergeAttrs: true, explicitArray: false, charkey: tag } 
    // documentation: https://www.npmjs.com/package/xml2js#options  -- don't change option!
    const didlJson = await xml2js.parseStringPromise(didlXml, parseXMLArgs)
    
    if (!isTruthyAndNotEmptyString(didlJson)) {
      throw new Error(`${NRCSP_PREFIX} response form xml2js is invalid.`)
    }
    let originalItems = []
    // handle single container/item (caused by xml2js explicitArray: false) item 
    // and no container / item
    const path = ['DIDL-Lite']
    path.push(itemName)
    if (isValidProperty(didlJson, path)) {
      const itemsOrOne = didlJson[path[0]][path[1]]
      if (Array.isArray(itemsOrOne)) { 
        originalItems = itemsOrOne.slice()
      } else { // single item  - convert to array
        originalItems.push(itemsOrOne) 
      }
    } else {
      originalItems = [] // empty 
    }

    // transform properties Album related
    const transformedItems = originalItems.map(item => {
      const didlBrowseItem = {
        id: '',
        title: '',
        artist: '',
        uri: '',
        artUri: '',
        metadata: '',
        sid: '',
        serviceName: '',
        upnpClass: '',
        processingType: '' // for later usage
      }
      if (isValidProperty(item, ['id'])) {
        didlBrowseItem.id = item['id']
      } else {
        throw new Error(`${NRCSP_PREFIX} id is missing`) // should never happen
      }
      if (isValidProperty(item, ['dc:title'])) {
        didlBrowseItem.title = item['dc:title']
      } else {
        throw new Error(`${NRCSP_PREFIX} title is missing`) // should never happen
      }
      if (isValidProperty(item, ['dc:creator'])) {
        didlBrowseItem.artist = item['dc:creator']
      }
      if (isValidProperty(item, ['res', tag])) {
        didlBrowseItem.uri = item['res'][tag]
        didlBrowseItem.sid = module.exports.getMusicServiceId(item.res[tag])
        didlBrowseItem.serviceName = module.exports.getMusicServiceName(didlBrowseItem.sid)
      }
      if (isValidProperty(item, ['upnp:class'])) {
        didlBrowseItem.upnpClass = item['upnp:class']
      }
      // artURI (cover) maybe an array (one for each track) then choose first
      let artUri = ''
      if (isValidProperty(item, ['upnp:albumArtURI'])) {
        artUri = item['upnp:albumArtURI']
        if (Array.isArray(artUri)) {
          if (artUri.length > 0) {
            didlBrowseItem.artUri = artUri[0]
          }
        } else {
          didlBrowseItem.artUri = artUri
        }
      }

      // special case My Sonos favorites. It include metadata in DIDL-lite format.
      // these metadata include the original title, original upnp:class (processingType)
      if (isValidProperty(item, ['r:resMD'])) {
        didlBrowseItem.metadata = item['r:resMD']
      }
      return didlBrowseItem
    })
    return transformedItems  // properties see transformedItems definition
  },

  /** 
   * Returns an array of groups extracted from action "GetZoneGroupState" output.
   * @param  {string}  groupXml Browse response property Result (DIDL-Light string in xml format)
   *
   * @returns {Promise<groups[]>} Promise, array of groups, should not be empty array.
   *                   
   * @throws {error} if any parameter is missing
   * @throws {error} from method xml2js and invalid response (missing id, title)
   * 
   */
  groupXmlToArray: async function (groupXml) {
    if (!isTruthyAndNotEmptyString(groupXml)) {
      throw new Error(`${NRCSP_PREFIX} groupXml input is missing`)
    }
    
    const tag = '' // not needed
    const parseXMLArgs = { mergeAttrs: true, explicitArray: false, charkey: tag } 
    // documentation: https://www.npmjs.com/package/xml2js#options  -- don't change option!
    const groupJson = await xml2js.parseStringPromise(groupXml, parseXMLArgs)    
    if (!isTruthyAndNotEmptyString(groupJson)) {
      throw new Error(`${NRCSP_PREFIX} response form xml2js is invalid.`)
    }
    if (!isValidProperty(groupJson, ['ZoneGroupState', 'ZoneGroups'])) {
      throw new Error(`${NRCSP_PREFIX} response form xml2js is invalid.`)
    }
    
    return groupJson.ZoneGroupState.ZoneGroups 
  },

  /**  Get music service id (sid) from Transport URI.
   * @param  {string} xuri such as (masked)
   * "x-rincon-cpcontainer:1004206ccatalog%2falbums%***%2f%23album_desc?sid=201&flags=8300&sn=14"
   *
   * @returns {string} service id or if not found empty string
   *
   * prerequisites: uri is string where the sid is in between "?sid=" and "&flags="
   */
  getMusicServiceId: (xuri) => {
    let sid = '' // default even if uri undefined.
    if (isTruthyAndNotEmptyString(xuri)) {
      const positionStart = xuri.indexOf('?sid=') + '$sid='.length
      const positionEnd = xuri.indexOf('&flags=')
      if (positionStart > 1 && positionEnd > positionStart) {
        sid = xuri.substring(positionStart, positionEnd)
      }
    }
    return sid
  },

  /**  Get service name for given service id.
   * @param  {string} sid service id (integer) such as "201" or blank 
   * 
   * @returns {string} service name such as "Amazon Music" or empty string
   *
   * @uses database of services (map music service id  to musics service name)
   */
  getMusicServiceName: (sid) => {
    let serviceName = '' // default even if sid is blank
    if (sid !== '') {
      const list = module.exports.MUSIC_SERVICES
      const index = list.findIndex((service) => {
        return (service.sid === sid)
      })
      if (index >= 0) {
        serviceName = list[index].name
      }  
    } 
    return serviceName
  },

  /**  Get TuneIn radioId from Transport URI - only for Music Service TuneIn 
   * @param  {string} xuri uri such as x-sonosapi-stream:s24903?sid=254&flags=8224&sn=0
   * 
   * @returns {string} TuneIn radio id or if not found empty
   *
   * prerequisite: xuri with radio id is in between "x-sonosapi-stream:" and "?sid=254"
   */
  getRadioId: (xuri) => {
    let radioId = ''
    if (xuri.startsWith('x-sonosapi-stream:') && xuri.includes('sid=254')) {
      const end = xuri.indexOf('?sid=254')
      const start = 'x-sonosapi-stream:'.length
      radioId = xuri.substring(start, end)
    }
    return radioId
  },

  /**  Get UpnP class from string metadata. 
   * @param  {string} metadata DIDL-Lite metadata 
   * 
   * @returns {string} Upnp class such as "object.container.album.musicAlbum"
   *
   * prerequisites: metadata containing xml tag <upnp:class>
   */
  getUpnpClass: (metadata) => {
    let upnpClass = '' // default
    if (isTruthyAndNotEmptyString(metadata)) {
      const positionStart = metadata.indexOf('<upnp:class>') + '<upnp:class>'.length
      const positionEnd = metadata.indexOf('</upnp:class>')
      if (positionStart >= 0 && positionEnd > positionStart) {
        upnpClass = metadata.substring(positionStart, positionEnd)
      }
    }
    return upnpClass
  },

  /** Encodes special HTML characters such as < to &lt;.
   * @param  {string} htmlData original HTML data
   * @return {string} data without any <, >, &, ', "
   */

  encodeHtml: htmlData => {
    return htmlData.replace(/[<>&'"]/g, singleChar => {
      switch (singleChar) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"':  return '&quot;'
      }
    })
  }
}
