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

const { PACKAGE_PREFIX } = require('./Globals.js')

const { getMutestate: xGetMutestate, getPlaybackstate: xGetPlaybackstate, 
  getVolume: xGetVolume, setMutestate: xSetMutestate, setVolume: xSetVolume,
  getMediaInfo: xGetMediaInfo, getPositionInfo: xGetPositionInfo,
  setAvTransport: xSetAvTransport, selectTrack: xSelectTrack,
  positionInTrack: xPositionInTrack, play: xPlay
} = require('./Sonos-Extensions.js')

const { isTruthyProperty: xIsTruthyProperty, isTruthyStringNotEmpty: xIsTruthyStringNotEmpty,
  isTruthyPropertyStringNotEmpty: xIsTruthyPropertyStringNotEmpty,
  isTruthy: xIsTruthy, decodeHtmlEntity: xDecodeHtmlEntity
} = require('./HelperTS.js')

const parser = require('fast-xml-parser')

const debug = require('debug')(`${PACKAGE_PREFIX}Sonos-CommandsTs`)

module.exports = {
  
  MUSIC_SERVICES: require('./Db-MusicServices.json'),

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

  /** Get array of all My Sonos Favorite items (except SONOS-Playlist)
   * @param {object} tsPlayer sonos-ts player
   * @param {number} requestedCount integer, 1 to ... (no validation)
   *
   * @returns {Promise<DidlBrowseItem[]>} all My Sonos items as array, could be empty
   *
   * @throws {error} invalid return from Browse, decodeHtmlEntityTs, parser.parse
   */  
  // TODO in error
  getMySonosFavorites: async function (tsPlayer, requestedCount) { 
    debug('method >>%s', 'getMySonosFavorites')
    const favorites = await tsPlayer.ContentDirectoryService.Browse({
      ObjectID: 'FV:2', BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0,
      RequestedCount: requestedCount, SortCriteria: ''
    })

    // TODO check existence
    const decodedFavorites = xDecodeHtmlEntity(favorites.Result)
    // leave uri metadata r:resMD as as string.
    const parsedFavorites = parser.parse(decodedFavorites, {
      'attributeNamePrefix': '_',
      'stopNodes': ['r:resMD'],
      'parseNodeValue': false,
      'ignoreAttributes': false,
    })

    // favorites have tag: <item>
    // TODO check all elements DIDL-Lite, item ...)
    const allFavorites = parsedFavorites['DIDL-Lite'].item
    const allFavoritesWithTitle = allFavorites.map((item) => {
      return {
        'id': '', // TODO necessary?
        // title might be of type number (example album 25 form Adele) - convert it to string
        // title must be HTML entity decoded because we search
        'title': xDecodeHtmlEntity(String(item['dc:title'])),
        'artist': '', // TODO necessary?
        'uri': item['res'], // keep HTML entity encoded, URI encoded
        'metadata': item['r:resMD'], // keep HTML entity encoded, URI encoded
        'artUri': item['upnp:albumArtURI'], // is array or single item!
        'sid': '', // TODO
        'serviceName': '', // TODO
        'upnpclass': item['upnp:class'], // is always 'object.itemobject.item.sonos-favorite'
        'processingType': '' // TODO has 
      }
    })

    return allFavoritesWithTitle
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
    if (!xIsTruthyProperty(browsePlaylist, ['NumberReturned'])) { 
      throw new Error(`${PACKAGE_PREFIX} invalid response Browse SQ: - missing NumberReturned`)
    }
    let transformedItems = [] // no Sonos Playlists
    if (browsePlaylist.NumberReturned > 0) {
      if (!xIsTruthyPropertyStringNotEmpty(browsePlaylist, ['Result'])) {
        throw new Error(`${PACKAGE_PREFIX} invalid response Browse SQ: - missing Result`)
      }
      // eslint-disable-next-line max-len
      transformedItems = await module.exports.parseBrowseDidlXmlToArray(browsePlaylist.Result, 'container')
      transformedItems = transformedItems.map((item) => {
        if (item.artUri.startsWith('/getaa')) {
          item.artUri = tsPlayer.urlObject.origin + item.artUri
        }
        return item
      })
    }
    return transformedItems
  },

  /** 
   * Returns an array of items (DidlBrowseItem) extracted from action "Browse" output.
   * @param  {string} browseDidlXml DIDL-Light string in xml format from Browse (original!)
   * @param  {string}  itemName DIDL-Light property holding the data. Such as "item" or "container"
   *
   * @returns {Promise<DidlBrowseItem[]>} Promise, array of {@link Sonos-CommandsTs#DidlBrowseItem},
   *  maybe empty array.
   *                   
   * @throws {error} if any parameter is missing
   * @throws {error} from method xml2js and invalid response (missing id, title)
   * 
   * Browse provides the results (property Result) in form of a DIDL-Lite xml format. 
   * The <DIDL-Lite> includes several attributes such as xmlns:dc" and entries 
   * all named "container" or "item". These include xml tags such as 'res'. 
   */
  parseBrowseDidlXmlToArray: async function (browseDidlXml, itemName) {
    if (!xIsTruthyStringNotEmpty(browseDidlXml)) {
      throw new Error(`${PACKAGE_PREFIX} DIDL-Light input is missing`)
    }
    if (!xIsTruthyStringNotEmpty(itemName)) {
      throw new Error(`${PACKAGE_PREFIX} item name such as container is missing`)
    }
    const decoded = await xDecodeHtmlEntity(browseDidlXml)
    const didlJson = await parser.parse(decoded, {
      'ignoreAttributes': false,
      'attributeNamePrefix': '_',
      'parseNodeValue': false // this is important - example Title 49 will otherwise be converted
    })  
    if (!xIsTruthyProperty(didlJson, ['DIDL-Lite'])) {
      throw new Error(`${PACKAGE_PREFIX} invalid response Browse: missing DIDL-Lite`)
    }

    let originalItems = []
    // single items are not of type array (fast-xml-parser)
    const path = ['DIDL-Lite', itemName]
    if (xIsTruthyProperty(didlJson, path)) {
      const itemsOrOne = didlJson[path[0]][path[1]]
      if (Array.isArray(itemsOrOne)) { 
        originalItems = itemsOrOne.slice()
      } else { // single item  - convert to array
        originalItems.push(itemsOrOne) 
      }
    } 

    // transform properties Album related
    const transformedItems = await Promise.all(originalItems.map(async (item) => {
      const newItem = {
        'id': '',
        'title': '',
        'artist': '',
        'album': '',
        'uri': '',
        'artUri': '',
        'metadata': '',
        'sid': '',
        'serviceName': '',
        'upnpClass': '',
        'processingType': 'queue' // has to be updated in calling program
      }
      if (!xIsTruthyProperty(item, ['_id'])) {
        throw new Error(`${PACKAGE_PREFIX} id is missing`) // should never happen
      }
      newItem.id = item['_id']

      if (!xIsTruthyProperty(item, ['dc:title'])) {
        throw new Error(`${PACKAGE_PREFIX} title is missing`) // should never happen
      }
      if (xIsTruthyProperty(item, ['dc:creator'])) {
        newItem.artist = item['dc:creator']
      }
      if (!xIsTruthyProperty(item, ['dc:title'])) {
        throw new Error(`${PACKAGE_PREFIX} title is missing`) // should never happen
      }
      newItem.title = await xDecodeHtmlEntity(String(item['dc:title'])) // clean title for search
      if (xIsTruthyProperty(item, ['dc:creator'])) {
        newItem.artist = item['dc:creator']
      }
      if (xIsTruthyProperty(item, ['res', '#text'])) {
        newItem.uri = item['res']['#text'] // HTML entity encoded, URI encoded
        newItem.sid = module.exports.getMusicServiceId(newItem.uri)
        newItem.serviceName = module.exports.getMusicServiceName(newItem.sid)
      }
      if (xIsTruthyProperty(item, ['upnp:class'])) {
        newItem.upnpClass = item['upnp:class']
      }
      // artURI (cover) maybe an array (one for each track) then choose first
      let artUri = ''
      if (xIsTruthyProperty(item, ['upnp:albumArtURI'])) {
        artUri = item['upnp:albumArtURI']
        if (Array.isArray(artUri)) {
          if (artUri.length > 0) {
            newItem.artUri = artUri[0]
          }
        } else {
          newItem.artUri = artUri
        }
      }
      // special case My Sonos favorites. It include metadata in DIDL-lite format.
      // these metadata include the original title, original upnp:class (processingType)
      if (xIsTruthyProperty(item, ['r:resMD'])) {
        newItem.metadata = item['r:resMD']
      }
      return newItem
    })
    )
    return transformedItems  // properties see transformedItems definition
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
    debug('method >>%s', 'getMusicServiceId')
    let sid = '' // default even if uri undefined.
    if (xIsTruthyStringNotEmpty(xuri)) {
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
    debug('method >>%s', 'getMusicServiceName')
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
}
