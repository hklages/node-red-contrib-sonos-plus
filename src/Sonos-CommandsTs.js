/**
 * Collection - now based on sonos ts  - of  special SONOS commands for group/My Sonos handling
 * Handles communication above SOAP level.
 *
 * @module Sonos-CommandsTs
 * 
 * @author Henning Klages
 * 
 * @since 2021-02-15
 */ 

'use strict'

const {
  PACKAGE_PREFIX
} = require('./Globals.js')

const { xGetVolume, xGetMutestate, xGetPlaybackstate, xGetMediaInfo, xGetPositionInfo,
  xSetVolume, xSetMutestate, xPlay, xSelectTrack, xSetPlayerAVTransport, xPositionInTrack
} = require('./Sonos-Extensions.js')

const { isTruthyPropertyTs, isTruthyStringNotEmptyTs, isTruthyTs, decodeHtmlEntityTs
} = require('./HelperTS.js')

const parser = require('fast-xml-parser')

const debug = require('debug')(PACKAGE_PREFIX +':Sonos-CommandsTs')

module.exports = {

  /** Get group data for a given player.   
   * @param {string} tsPlayer sonos-ts player
   * @param {string} [playerName] SONOS-Playername such as Kitchen 
   * 
   * @returns {promise<object>}  returns object:
   *  { groupId, playerIndex, coordinatorIndex, members[]<playerGroupData> } 
   *
   * @throws {error} getGroupsAllTs
   * @throws {error} extractGroupTs 
   */
  getGroupCurrentTs: async function (tsPlayer, playerName) {
    const allGroups = await module.exports.getGroupsAllTs(tsPlayer)
    // eslint-disable-next-line max-len
    const thisGroup = await module.exports.extractGroupTs(tsPlayer.urlObject.hostname, allGroups, playerName)
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
  getGroupsAllTs: async function (anyTsPlayer) {
    debug('method >>%s', 'getGroupsAllFast')
    
    // get the data from SONOS player and transform to JavaScript Objects
    const householdPlayers = await anyTsPlayer.GetZoneGroupState()
    
    // select only ZoneGroupState not the other attributes and check
    if (!isTruthyPropertyTs(householdPlayers, ['ZoneGroupState'])) {
      throw new Error(`${PACKAGE_PREFIX} property ZoneGroupState is missing`)
    }
    const decoded = await decodeHtmlEntityTs(householdPlayers.ZoneGroupState)
    const attributeNamePrefix = '_'
    const options = { ignoreAttributes: false, attributeNamePrefix }
    const groups = await parser.parse(decoded, options) 
    if (!isTruthyTs(groups)) {
      throw new Error(`${PACKAGE_PREFIX} response form parse xml is invalid.`)
    }
    if (!isTruthyPropertyTs(groups, ['ZoneGroupState', 'ZoneGroups', 'ZoneGroup'])) {
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
    let urlObject // type URL JavaScript build in
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
  extractGroupTs: async function (playerUrlHost, allGroupsData, playerName) {
    debug('method >>%s', 'extractGroupTs')
    
    // this ensures that playerName overrules given playerUrlHostname
    const searchByPlayerName = isTruthyStringNotEmptyTs(playerName)

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
          // we compare by URL.hostname such as '192.168.178.35'
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
   * @param  {object} player.urlObject  URL JavaScript build in object
   * @param  {string} player.playerName SONOS-Playername
   * @param  {object} options
   * @param  {boolean} [options.snapVolumes = false] capture all players volume
   * @param  {boolean} [options.snapMutestates = false] capture all players mute state
   *
   * @returns {promise<Snapshot>} group snapshot object
   * 
   * @throws {error} if invalid response from SONOS player
  */
  xCreateGroupSnapshot: async function (playersInGroup, options) {
    const snapshot = {}
    snapshot.membersData = []
    let member
    for (let index = 0; index < playersInGroup.length; index++) {
      member = { // default
      // url.origin because it may stored in flow variable
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
  xRestoreGroupSnapshot: async function (snapshot) {
    // restore content
    // urlSchemeAuthority because we do create/restore
    const coordinatorUrlObject = new URL(snapshot.membersData[0].urlSchemeAuthority)
    const metadata = snapshot.CurrentURIMetadata
    await xSetPlayerAVTransport(coordinatorUrlObject,
      {
        'CurrentURI': snapshot.CurrentURI,
        'CurrentURIMetaData': metadata
      })

    let track
    if (isTruthyPropertyTs(snapshot, ['Track'])) {
      track = parseInt(snapshot['Track'])
    }
    let nrTracks
    if (isTruthyPropertyTs(snapshot, ['NrTracks'])) {
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
    let urlObject // type URL (JavaScript build in)
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
}
