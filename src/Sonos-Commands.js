'use strict'

const { isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString, getNestedProperty, hhmmss2msec, NRCSP_ERRORPREFIX } = require('./Helper.js')
const { encodeXml, sendToPlayerV1 } = require('./Soap.js')
const xml2js = require('xml2js')
const { GenerateMetadata } = require('sonos').Helpers

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
    'object.container.playlistContainer#playlistItem'
  ],

  // ========================================================================
  //
  //                          COMPLEX COMMANDS
  //
  // ========================================================================
  
  /**  Play notification on a group using coordinator. Coordinator is index 0
   * @param  {object}  node current node - for debugging
   * @param  {array}   membersAsPlayersPlus array of node-sonos player object with baseUrl,
   *                   coordinator has index 0
   *                   length = 1 is allowed if independent
   * @param  {object}  options options
   * @param  {string}  options.uri  uri
   * @param  {string}  [options.metadata]  metadata - will be generated if missing
   * @param  {string}  options.volume volume during notification - if -1 don't use, range 1 .. 99
   * @param  {boolean} options.sameVolume all player in group play at same volume level
   * @param  {boolean} options.automaticDuration duration will be received from player
   * @param  {string}  options.duration format hh:mm:ss
   * @return {promise} true
   *
   * @throws if invalid response from setAVTransportURI, play,
   */

  // TODO Notion player labeling
  playGroupNotification: async function (node, membersAsPlayerPlus, options) {
    const WAIT_ADJUSTMENT = 2000

    // generate metadata if not provided
    let metadata
    if (!isValidProperty(options, ['metadata'])) {
      metadata = GenerateMetadata(options.uri).metadata
    } else {
      metadata = options.metadata
    }
    node.debug('metadata >>' + JSON.stringify(metadata))

    // create snapshot state/volume/content
    // getCurrentState will return playing for a non-coordinator player even if group is playing
    const coordinatorIndex = 0
    const snapshot = {}
    const state = await membersAsPlayerPlus[coordinatorIndex].getCurrentState()
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    node.debug('wasPlaying >>' + snapshot.wasPlaying)
    snapshot.mediaInfo = await membersAsPlayerPlus[coordinatorIndex].avTransportService().GetMediaInfo()
    snapshot.positionInfo = await membersAsPlayerPlus[0].avTransportService().GetPositionInfo()
    snapshot.memberVolumes = []
    if (options.volume !== -1) {
      snapshot.memberVolumes[0] = await membersAsPlayerPlus[coordinatorIndex].getVolume()
    }
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < membersAsPlayerPlus.length; index++) {
        snapshot.memberVolumes[index] = await membersAsPlayerPlus[index].getVolume()
      }
    }
    node.debug('Snapshot created - now start playing notification')

    // set AVTransport
    let args = {  InstanceID: 0, CurrentURI: encodeXml(options.uri),  CurrentURIMetaData: '' }
    if (metadata !== '') {
      args.CurrentURIMetaData = encodeXml(metadata)
    }
    // no check - always returns true
    await module.exports.executeActionV6(membersAsPlayerPlus[coordinatorIndex].baseUrl,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
      args)


    if (options.volume !== -1) {
      await membersAsPlayerPlus[coordinatorIndex].setVolume(options.volume)
      node.debug('same Volume' + options.sameVolume)
      if (options.sameVolume) { // all other members, starting at 1
        for (let index = 1; index < membersAsPlayerPlus.length; index++) {
          await membersAsPlayerPlus[index].setVolume(options.volume)
        }
      }
    }
    // no check - always returns true
    await module.exports.executeActionV6(membersAsPlayerPlus[coordinatorIndex].baseUrl,
      '/MediaRenderer/AVTransport/Control', 'Play',
      { InstanceID: 0, Speed: 1 })
   
    node.debug('Playing notification started - now figuring out the end')

    // waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = hhmmss2msec(options.duration)
    if (options.automaticDuration) {
      const positionInfo = await membersAsPlayerPlus[coordinatorIndex].avTransportService().GetPositionInfo()
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
      await membersAsPlayerPlus[coordinatorIndex].setVolume(snapshot.memberVolumes[coordinatorIndex])
    }
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < membersAsPlayerPlus.length; index++) {
        await membersAsPlayerPlus[index].setVolume(snapshot.memberVolumes[index])
      }
    }
    if (!options.uri.includes('x-sonos-vli')) { // that means initiated by Spotify or Amazon Alexa - can not recover) {
      await membersAsPlayerPlus[coordinatorIndex].setAVTransportURI({
        uri: snapshot.mediaInfo.CurrentURI,
        metadata: snapshot.mediaInfo.CurrentURIMetaData,
        onlySetUri: true // means don't play
      })
    }
    if (snapshot.positionInfo.Track && snapshot.positionInfo.Track > 1 && snapshot.mediaInfo.NrTracks > 1) {
      await membersAsPlayerPlus[coordinatorIndex].selectTrack(snapshot.positionInfo.Track)
        .catch(() => {
          node.debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.positionInfo.RelTime && snapshot.positionInfo.TrackDuration !== '0:00:00') {
      node.debug('Setting back time to >>' + JSON.stringify(snapshot.positionInfo.RelTime))
      await membersAsPlayerPlus[coordinatorIndex].avTransportService().Seek({ InstanceID: 0, Unit: 'REL_TIME', Target: snapshot.positionInfo.RelTime })
        .catch(() => {
          node.debug('Reverting back track time failed, happens for some music services (radio or stream).')
        })
    }
    if (snapshot.wasPlaying) {
      if (!options.uri.includes('x-sonos-vli')) {
        await membersAsPlayerPlus[coordinatorIndex].play()
      }
    }
  },

  /**  Play notification on a single joiner - a player in a group not being coordinator.
   * @param  {object}  node current node - for debugging
   * @param  {object}  coordinatorPlus coordinator in group as node-sonos player object with baseUrl
   * @param  {object}  joinerPlus jointer in group
   * @param  {object}  options options
   * @param  {string}  options.uri  uri
   * @param  {string}  [options.metadata]  metadata - will be generated if missing
   * @param  {string}  options.volume volume during notification. - 1 means don't touch. integer 1 .. 99
   * @param  {boolean} options.automaticDuration
   * @param  {string}  options.duration format hh:mm:ss
   * @return {promise} true
   *
   * @throws all from setAVTransportURI(), avTransportService()*, play, setVolume
   *
   * Hint: joiner will leave group, play notification and rejoin the group. State will be imported from group.
   */

  // TODO Notion player labeling
  playJoinerNotification: async function (node, coordinatorPlus, joinerPlus, options) {
    const WAIT_ADJUSTMENT = 2000

    // generate metadata if not provided
    let metadata
    if (!isValidProperty(options, ['metadata'])) {
      metadata = GenerateMetadata(options.uri).metadata
    } else {
      metadata = options.metadata
    }
    node.debug('metadata >>' + JSON.stringify(metadata))

    // create snapshot state/volume/content
    // getCurrentState will return playing for a non-coordinator player even if group is playing
    const snapshot = {}
    const state = await coordinatorPlus.getCurrentState() // joiner does not show valid state!
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    snapshot.mediaInfo = await joinerPlus.avTransportService().GetMediaInfo()
    if (options.volume !== -1) {
      snapshot.joinerVolume = await joinerPlus.getVolume()
    }
    node.debug('Snapshot created - now start playing notification')

    // set the joiner to notification - joiner will leave group!
    let args = {  InstanceID: 0, CurrentURI: encodeXml(options.uri),  CurrentURIMetaData: '' }
    if (metadata !== '') {
      args.CurrentURIMetaData = encodeXml(metadata)
    }
    await module.exports.executeActionV6(joinerPlus.baseUrl,
      '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI',
      args)

    // no check - always returns true
    await module.exports.executeActionV6(joinerPlus.baseUrl,
      '/MediaRenderer/AVTransport/Control', 'Play',
      { InstanceID: 0, Speed: 1 })

    if (options.volume !== -1) {
      await joinerPlus.setVolume(options.volume)
    }
    node.debug('Playing notification started - now figuring out the end')

    // waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = hhmmss2msec(options.duration)
    if (options.automaticDuration) {
      const positionInfo = await joinerPlus.avTransportService().GetPositionInfo()
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
      await joinerPlus.setVolume(snapshot.joinerVolume)
    }
    await joinerPlus.setAVTransportURI({
      uri: snapshot.mediaInfo.CurrentURI,
      metadata: snapshot.mediaInfo.CurrentURIMetaData,
      onlySetUri: true // means don't play
    })
    if (snapshot.wasPlaying) {
      await joinerPlus.play()
    }
  },

  /**  Creates snapshot of group.
   * @param  {object}  node current node - for debugging
   * @param  {array}   membersAsPlayersPlus array of node-sonos player objects, coordinator/selected player has index 0
   *                   members.length = 1 in case independent
   * @param  {object}  options
   * @param  {boolean} [options.snapVolumes = false] capture all players volume
   * @param  {boolean} [options.snapMutestates = false] capture all players mute state
   *
   * @return {promise} group snapshot object: { memberData: object, isPlaying: boolean, }
   * memberData is array of all members (coordinator is index 0) as object: {urlHostname, port, sonosName, volume, mutestate }
   * @throws if invalid response from SONOS player
   *
  */
  // TODO Notion capture group member
  // TODO Notion player labeling
  createGroupSnapshot: async function (node, membersAsPlayersPlus, options) {
    // getCurrentState will return playing for a non-coordinator player even if group is playing

    const snapshot = {}

    // player ip, port, ... and volume, mutestate in an array
    snapshot.memberData = []
    let playersVolume
    let playersMutestate
    let memberSimple
    for (let index = 0; index < membersAsPlayersPlus.length; index++) {
      memberSimple = { urlHostname: membersAsPlayersPlus[index].host, urlPort: membersAsPlayersPlus[index].port, baseUrl: membersAsPlayersPlus[index].baseUrl }
      snapshot.memberData.push(memberSimple)
      playersVolume = -1 // means not captured
      if (options.snapVolumes) {
        playersVolume = await membersAsPlayersPlus[index].getVolume()
      }
      playersMutestate = null // means not captured
      if (options.snapMutestates) {
        playersMutestate = await membersAsPlayersPlus[index].getMuted()
        playersMutestate = (playersMutestate ? 'on' : 'off')
      }
      snapshot.memberData[index].volume = playersVolume
      snapshot.memberData[index].mutestate = playersMutestate
    }

    const coordinatorIndex = 0
    snapshot.playbackstate = await membersAsPlayersPlus[coordinatorIndex].getCurrentState()
    snapshot.wasPlaying = (snapshot.playbackstate === 'playing' || snapshot.playbackstate === 'transitioning')
    const mediaData = await membersAsPlayersPlus[coordinatorIndex].avTransportService().GetMediaInfo()
    const positionData = await membersAsPlayersPlus[coordinatorIndex].avTransportService().GetPositionInfo()
    Object.assign(snapshot, { CurrentURI: mediaData.CurrentURI, CurrentURIMetadata: mediaData.CurrentURIMetaData, NrTracks: mediaData.NrTracks })
    Object.assign(snapshot, { Track: positionData.Track, RelTime: positionData.RelTime, TrackDuration: positionData.TrackDuration })
    return snapshot
  },

  /**  Restore snapshot of group.
   * @param  {object}  node current node - for debugging
   * @param  {object}  snapshot
   * @param  {array}   membersAsPlayersPlus array of node-sonos player objects, coordinator/selected player has index 0
   *                   members.length = 1 in case independent
   *
   * @return {promise} true
   *
   * @throws if invalid response from SONOS player
   *
   */

  // TODO Notion capture group member
  // TODO Notion player labeling
  // TODO Notion await error handling
  restoreGroupSnapshot: async function (node, membersAsPlayersPlus, snapshot) {
    // restore content: URI and track
    const coordinatorIndex = 0
    await membersAsPlayersPlus[coordinatorIndex].setAVTransportURI({ // using node-sonos
      uri: snapshot.CurrentURI,
      metadata: snapshot.CurrentURIMetadata,
      onlySetUri: true
    })
    if (snapshot.Track && snapshot.Track > 1 && snapshot.NrTracks > 1) {
      await membersAsPlayersPlus[coordinatorIndex].selectTrack(snapshot.Track)
        .catch(() => {
          node.debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.RelTime && snapshot.TrackDuration !== '0:00:00') {
      node.debug('Setting back time to >>', JSON.stringify(snapshot.RelTime))
      await membersAsPlayersPlus[coordinatorIndex].avTransportService().Seek({ InstanceID: 0, Unit: 'REL_TIME', Target: snapshot.RelTime })
        .catch(() => {
          node.debug('Reverting back track time failed, happens for some music services (radio or stream).')
        })
    }
    // restore volume/mute if captured.
    let volume
    let mutestate
    let digit
    for (let index = 0; index < membersAsPlayersPlus.length; index++) {
      volume = snapshot.memberData[index].volume
      if (volume !== -1) {
        await membersAsPlayersPlus[index].setVolume(volume)
      }
      mutestate = snapshot.memberData[index].mutestate
      if (mutestate != null) {
        digit = (mutestate === 'on')
        await membersAsPlayersPlus[index].setMuted(digit)
      }
    }
    return true
  },

  /** Get array of all SONOS player data in same group as player. Coordinator is first in array. hidden player are ignored!
   * @param  {object} sonosPlayer valid player object
   * @param  {string} [playerName] valid player name. If missing search is based on sonosPlayer ip address!
   * @return {promise} returns object
   *          object.playerIndex
   *          object.members[]
   *          members[]: urlHostname, urlPort, baseUrl, uuid, sonosName. First member is coordinator
   *
   * @throws if getAllGroups returns invalid value
   *         if player name not found in any group
   */
  getGroupMemberDataV2: async function (sonosPlayer, playerName) {
    // playerName !== '' then use playerName
    const searchByName = isTruthyAndNotEmptyString(playerName)
    const allGroupsData = await sonosPlayer.getAllGroups()
    if (!isTruthyAndNotEmptyString(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data undefined`)
    }
    if (!Array.isArray(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data is not array`)
    }
    // find our players group in groups output
    // allGroupsData is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, baseUrl, coordinator (uuid)
    // ZoneGroupMembers is an array of all members with properties ip address and more
    let playerGroupIndex = -1 // indicator for no player found
    let name
    let playerUrl
    let usedPlayerHostname
    let visible
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
        visible = !allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Invisible
        if (searchByName) {
          name = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName
          if (name === playerName && visible) {
            playerGroupIndex = groupIndex
            playerUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
            usedPlayerHostname = playerUrl.hostname
            break
          }
        } else {
          // extract hostname (eg 192.168.178.1) from Location field
          playerUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
          if (playerUrl.hostname === sonosPlayer.host && visible) {
            playerGroupIndex = groupIndex
            usedPlayerHostname = playerUrl.hostname
            break
          }
        }
      }
      if (playerGroupIndex >= 0) {
        break
      }
    }
    if (playerGroupIndex === -1) {
      throw new Error(`${NRCSP_ERRORPREFIX} could not find given player (must be visible) in any group`)
    }
    // reorder members that coordinator is at position 0
    let members = await module.exports.sortedGroupArray(allGroupsData, playerGroupIndex)

    // only accept visible player (in stereopair there is one invisible)
    members = members.filter(member => member.invisible === false)

    // find our player index in members - that helps to figure out role: coordinator, joiner, independent
    const playerIndex = members.findIndex((member) => member.urlHostname === usedPlayerHostname)

    return { playerIndex: playerIndex, members: members, groupId: allGroupsData[playerGroupIndex].ID, groupName: allGroupsData[playerGroupIndex].Name }
  },

  /** Get array of all players in household. 
   * @param  {object} sonosPlayer valid player object
   * @return {promise} returns array of all groups. Every group is array of members. First member is coordinator
   *          members[]: urlHostname, urlPort, baseUrl, uuid, sonosName, isCoordinator, groupIndex
   *
   * @throws if getAllGroups returns invalid value
   *         if player name not found in any group
   */
  getAllPlayerList: async function (sonosPlayer) {
    
    const allGroupsData = await sonosPlayer.getAllGroups()
    if (!isTruthyAndNotEmptyString(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data undefined`)
    }
    if (!Array.isArray(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data is not array`)
    }
    
    // allGroupsData is an array of groups. Each group has properties Coordinator(eg. RINCON_5CAAFD00223601400), host (eg. 192.168.178.35),
    // port (eg 1400), ID (eg RINCON_5CAAFD00223601400:434), Name (eg. Küche), ZoneGroupMembers
    // ZoneGroupMembers is an array of all members with properties UUID (eg RINCON_5CAAFD00223601400), ZoneName (eg. Küche), 
    // Location(eg. http://192.168.178.37:1400/xml/device_description.xmlLocation), Invisible (optional, only if true) and more ...
    let player
    let playerUrl
    let visible
    let playerList = []
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
        visible = true
        if (Object.prototype.hasOwnProperty.call(allGroupsData[groupIndex].ZoneGroupMember[memberIndex],'Invisible')) {
          visible = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Invisible
        } 
        if (visible) {
          playerUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
          player = {
            sonosName: allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName,
            urlHostname: playerUrl.hostname,
            urlPort: playerUrl.port,
            baseUrl: `http://${playerUrl.hostname}:${playerUrl.port}`,
            uuid: allGroupsData[groupIndex].ZoneGroupMember[memberIndex].UUID,
            isCoordinator: (allGroupsData[groupIndex].Coordinator === allGroupsData[groupIndex].ZoneGroupMember[memberIndex].UUID),
            groupIndex: groupIndex
          }
          playerList.push(player)
        }
      }
    }
    return playerList
  },

  /**  Get array of all My Sonos items - maximum 200. Includes SONOS-Playlists (maximum 999)
   * @param   {string} sonosPlayerBaseUrl SONOS Player baseUrl (eg http://192.168.178.37:1400)
   *
   * @return {promise} array of My Sonos items - could be empty
   *                   {title, artUri, uri, metadata, sid, serviceName, radioId, upnpClass, processingType}
   *
   * @throws if invalid SONOS player response, error during parsing 
   *
   * Restriction: Maximum number of My Sonos items: 200, maximum number of SONOS-Playlists 999.
   * Restrictions: MusicLibrary/ Sonos playlists without service id.
   * Restrictions: Audible Audiobooks are missing.
   * Restrictions: Pocket Casts Podcasts without uri, only metadata
   */
  getMySonosV3: async function (sonosPlayerBaseUrl) {
    // get all My Sonos items (ObjectID FV:2) - maximum 200, but not Sonos playlists
    const browseFv = await module.exports.executeActionV6(sonosPlayerBaseUrl,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      { ObjectID: 'FV:2', BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0, RequestedCount: 200, SortCriteria: '' })
    if (!isValidPropertyNotEmptyString(browseFv, ['NumberReturned'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} invalid response from Browse FV:2 command - missing NumberReturned value`)
    }
    if (browseFv.NumberReturned === '0') {
      throw new Error(`${NRCSP_ERRORPREFIX} Could not find any My Sonos item (please add at least one)`)
    }
    
    const listMySonos = await module.exports.didlXmlToArray(browseFv.Result, 'item')
    if (!isTruthyAndNotEmptyString(listMySonos)) {
      throw new Error(`${NRCSP_ERRORPREFIX} response form parsing Browse FV-2 is invalid.`)
    }
    let mySonosPlusPl = []
    // TuneIn radio stations: Radio id, baseUrl to albumArtUri
    mySonosPlusPl = listMySonos.map(item => {
      let  artUri = ''  
      if (isValidPropertyNotEmptyString(item, ['artUri'])) {
        artUri = item['artUri']
        if (typeof artUri === 'string' && artUri.startsWith('/getaa')) {
          artUri = sonosPlayerBaseUrl + artUri
        } 
      }
      item.artUri = artUri
      
      if (isValidProperty(item, ['uri'])) {
        item.radioId = module.exports.getRadioId(item.uri)
      }
      if (isValidProperty(item, ['sid'])) {
        item.serviceName = module.exports.getMusicServiceName(item.sid)
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
        item.processingType = 'unsupported'
      }

      return item
    })

    // get all SONOS-Playlists
    const newListPlaylists = await module.exports.getSonosPlaylistsV2(sonosPlayerBaseUrl)

    return mySonosPlusPl.concat(newListPlaylists)
  },

  /** Get array of all SONOS-Playlists - maximum 999. Adds baseUrl to artUri if starts with /getaa
   * @param  {string} sonosPlayerBaseUrl valid SONOS player base url such as http://192.168.178.35:1400
   *
   * @return {promise} array of playlists as object - could be empty
   * { title:, artist:, uri:, artUri:, id:, metadata:, sid:, upnpClass:, processingType: }
   *
   * @throws invalid return from Browse, invalid didlXmlToArray
   *
   */
  getSonosPlaylistsV2: async function (sonosPlayerBaseUrl) {
    const browsePlaylist = await module.exports.executeActionV6(sonosPlayerBaseUrl,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      { ObjectID: 'SQ:', BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0, RequestedCount: 999, SortCriteria: '' })
    if (!isValidPropertyNotEmptyString(browsePlaylist, ['NumberReturned'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} invalid response from Browse SQ: command - missing NumberReturned value`)
    }
    let  newPlaylistsArray = []
    if (browsePlaylist.NumberReturned !== '0') {
      if (!isValidPropertyNotEmptyString(browsePlaylist, ['Result'])) {
        throw new Error(`${NRCSP_ERRORPREFIX} invalid response from Browse SQ: command - missing Result value`)
      }

      // container
      const playlistArray = await module.exports.didlXmlToArray(browsePlaylist.Result, 'container')
      if (!isTruthyAndNotEmptyString(playlistArray)) {
        throw new Error(`${NRCSP_ERRORPREFIX} response form parsing Browse SQ is invalid.`)
      }
      
      // add baseUrl to artUri
      newPlaylistsArray = playlistArray.map(item => {
        let  artUri = ''  
        if (isValidPropertyNotEmptyString(item, ['artUri'])) {
          artUri = item['artUri']
          if (typeof artUri === 'string' && artUri.startsWith('/getaa')) {
            artUri = sonosPlayerBaseUrl + artUri
          } 
        }
        item.artUri = artUri
        item.processingType = 'queue'
        return item
      })
    }

    return newPlaylistsArray
  },
  
  
  /** Get array of all SONOS-Queue items - maximum 200. Adds baseUrl to artUri if starts with /getaa and processingType.
   * @param  {string} sonosPlayerBaseUrl valid SONOS player base url such as http://192.168.178.35:1400
   *
   * @return {promise} array of items as object - could be empty
   * { title:, artist:, uri:, artUri:, id:, metadata:, sid:, upnpClass:, processingType: }
   *
   * @throws invalid return from Browse, invalid didlXmlToArray
   *
   */
  getQueueV2: async function (sonosPlayerBaseUrl) {
    const browseQueue = await module.exports.executeActionV6(sonosPlayerBaseUrl,
      '/MediaServer/ContentDirectory/Control', 'Browse',
      { ObjectID: 'Q:0', BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0, RequestedCount: 200, SortCriteria: '' })
    if (!isValidPropertyNotEmptyString(browseQueue, ['NumberReturned'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} invalid response from Browse Q:0 command - missing NumberReturned value`)
    }
    
    let newQueueArray = []
    if (browseQueue.NumberReturned !== '0') {
      if (!isValidPropertyNotEmptyString(browseQueue, ['Result'])) {
        throw new Error(`${NRCSP_ERRORPREFIX} invalid response from Browse Q:0 command - missing Result value`)
      }
      // item
      const queueArray = await module.exports.didlXmlToArray(browseQueue.Result, 'item')
      if (!isTruthyAndNotEmptyString(queueArray)) {
        throw new Error(`${NRCSP_ERRORPREFIX} response form parsing Browse Q:0 is invalid.`)
      }

      // add baseUrl to artUri
      newQueueArray = queueArray.map((item) => {
        let  artUri = ''  
        if (isValidPropertyNotEmptyString(item, ['artUri'])) {
          artUri = item['artUri']
          if (typeof artUri === 'string' && artUri.startsWith('/getaa')) {
            artUri = sonosPlayerBaseUrl + artUri
          } 
        }
        item.artUri = artUri
        item.processingType = 'queue'
        return item
      })
    }
    return newQueueArray
  },


  // ========================================================================
  //
  //                          EXECUTE UPNP ACTION COMMAND
  //
  // ========================================================================

  /**  Execute action version 6 - handles get and set. 
   * Version 6 needs Sonos-ActionsV6.json, no default input args and endpoint as first key
   * 
   * @param  {string} baseUrl the player base url such as http://192.168.178.37:1400
   * @param  {string} endpoint the endpoint name such as /MediaRenderer/AVTransport/Control
   * @param  {string} actionName the action name such as Seek
   * @param  {object} actionInArgs all arguments - throws error if one argument is missing!
   *
   * @return {promise} set action: true | get action: object with all outArgs
   *
   * Everything OK if statusCode === 200 and body includes expected response value (set) or value (get)
   *  
   * @throws not all actionArgs, http return invalid status or not 200, missing body, unexpected response
   * 
   * @access ACTIONS_TEMPLATESV6 key endpoint, key action property {array} inArgs, {array} outArgs
   *
   */
  executeActionV6: async function (baseUrl, endpoint, actionName, actionInArgs) {
    // get action in, out properties from json file
    const endpointActions = module.exports.ACTIONS_TEMPLATESV6[endpoint]
    const { inArgs, outArgs } = endpointActions[actionName]
    
    // actionInArgs must have all properties
    let path = []
    inArgs.forEach(property => {
      path = []
      path.push(property)
      if (!isValidProperty(actionInArgs, path)) {
        throw new Error(`${NRCSP_ERRORPREFIX} property ${property} is missing}`)
      }
    })
    
    // generate serviceName from endpoint - its always the second last
    // SONOS endpoint is either /<device>/<serviceName>/Control or /<serviceName>/Control
    const tmp = endpoint.split('/')  
    const serviceName = tmp[tmp.length - 2]
  
    const response = await sendToPlayerV1(baseUrl, endpoint, serviceName, actionName, actionInArgs)

    // Everything OK if statusCode === 200 and body includes expected response value or requested value
    if (!isValidProperty(response, ['statusCode'])) {
      // This should never happen. Just to avoid unhandled exception.
      throw new Error(`${NRCSP_ERRORPREFIX} status code from sendToPlayer is invalid - response.statusCode >>${JSON.stringify(response)}`)
    }
    if (response.statusCode !== 200) {
      // This should not happen as long as axios is being used. Just to avoid unhandled exception.
      throw new Error(`${NRCSP_ERRORPREFIX} status code is not 200: ${response.statusCode} - response >>${JSON.stringify(response)}`)
    }
    if (!isValidProperty(response, ['body'])) {
      // This should not happen. Just to avoid unhandled exception.
      throw new Error(`${NRCSP_ERRORPREFIX} body from sendToPlayer is invalid - response >>${JSON.stringify(response)}`)
    }

    // Convert XML to JSON
    const parseXMLArgs = { mergeAttrs: true, explicitArray: false, charkey: '' } 
    // documentation: https://www.npmjs.com/package/xml2js#options  -- don't change option!
    const bodyXml = await xml2js.parseStringPromise(response.body, parseXMLArgs)

    // RESPONSE
    // The key to the core data is ['s:Envelope','s:Body',`u:${actionName}Response`]
    // There are 2 cases: 
    //   1.   no output argument thats typically in a "set" action: expected response is just an envelope with
    //            .... 'xmlns:u' = `urn:schemas-upnp-org:service:${serviceName}:1`  
    //   2.   one or more values typically in a "get" action: in addition the values outArgs are included.
    //            .... 'xmlns:u' = `urn:schemas-upnp-org:service:${serviceName}:1` 
    //            and in addition the properties from outArgs
    //   
    const key = ['s:Envelope', 's:Body']
    key.push(`u:${actionName}Response`)

    // check body response
    if (!isValidProperty(bodyXml, key)) {
      throw new Error(`${NRCSP_ERRORPREFIX} body from sendToPlayer is invalid - response >>${JSON.stringify(response)}`)
    }
    let result = getNestedProperty(bodyXml, key)
    if (!isValidProperty(result, ['xmlns:u'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} xmlns:u property is missing`)
    }
    const expectedResponseValue = `urn:schemas-upnp-org:service:${serviceName}:1`  
    if (result['xmlns:u'] !== expectedResponseValue) {
      throw new Error(`${NRCSP_ERRORPREFIX} unexpected response from player: urn:schemas ... is missint `)
    }
    
    if (outArgs.length === 0) { // case 1 
      result = true
    } else {
      // check whether all outArgs exist and return them as object!
      outArgs.forEach(property => { 
        path = []
        path.push(property)
        if (!isValidProperty(result, path)) {
          throw new Error(`${NRCSP_ERRORPREFIX} response property ${property} is missing}`)
        }
      })
      delete result['xmlns:u'] // thats not needed
    }
    if (outArgs.length === 1) {
      result = result[outArgs[0]]
    }
    return result
  },

  // ========================================================================
  //
  //                         HELPERS
  //
  // ========================================================================

  /** Find searchString in My Sonos items, property title - without filter.
   * @param  {Array} items array of objects {title: , uri: , metadata}
   * @param  {string} searchString search string for title property
   * @return {promise} object {title, uri, metadata}
   *
   * @throws error if string not found
   */

  // TODO Notion use build in
  findStringInMySonosTitleV1: async function (items, searchString) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].title.includes(searchString)) {
        return {
          title: items[i].title,
          uri: items[i].uri,
          metadata: items[i].metadata,
          queue: (items[i].processingType === 'queue')
        }
      }
    }
    // not found
    throw new Error(`${NRCSP_ERRORPREFIX} No title matching search string >>${searchString}`)
  },

  /** Creates a list of items/container from given Browse output. 
   * @param   {string}  didlXml Browse response property Result (DIDL-Light string in xml format)
   * @param   {string}  itemName property in DIDL lite holding the data such as "item" or "container"
   *
   * @return {promise} Array of objects. Empty if Browse does not provide data.
   * { title:, artist:, uri:, artUri:, id:, metadata:, sid:, upnpClass: }
   * artUri: cover picture, sid: music service id, id: object Id
   *                   
   * @throws parameter missing, xml2js errors, invalid response from xmls2js, missing title, id
   * 
   * Details: Browse provides the results (Result, ... ) in form of a DIDL-Lite xml format. 
   * The <DIDL-Lite> includes several attributes such as xmlns:dc" and a container holding the items. 
   * The name of the container such as "item" or "container" depends on the Browse type (ObjectId)
   * and has to be specified in parameter itemName. The items in the container includes also xml tag content. 
   * The uri is a xml tag content of res, so we have to define tag = uriIdentifier.
   * Furthermore the didl-xml includes some escape character - must be removed.
   */

  didlXmlToArray: async function (didlXml, itemName) {
    if (!isTruthyAndNotEmptyString(didlXml)) {
      throw new Error(`${NRCSP_ERRORPREFIX} DIDL-Light input is missing`)
    }
    if (!isTruthyAndNotEmptyString(itemName)) {
      throw new Error(`${NRCSP_ERRORPREFIX} item name such as container is missing`)
    }
    // TODO is necessary? const cleanDidlXml = didlXml.replace('\"', '"') // unescape double quotes!
    const tag = 'uriIdentifier' // uri is text content (_) xml tag content from <res> 
    const parseXMLArgs = { mergeAttrs: true, explicitArray: false, charkey: tag } 
    // documentation: https://www.npmjs.com/package/xml2js#options  -- don't change option!
    const didlJson = await xml2js.parseStringPromise(didlXml, parseXMLArgs)
    
    if (!isTruthyAndNotEmptyString(didlJson)) {
      throw new Error(`${NRCSP_ERRORPREFIX} response form xml2js is invalid.`)
    }
    let originalItems = []
    // handle single container/item (caused by xml2js explicitArray: false) item and no container/item
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
    let transformedItems = originalItems.map(item => {
      let newItem = {
        id: '',
        title: '',
        artist: '',
        uri: '',
        artUri: '',
        metadata: '',
        sid: '',
        upnpClass: ''
      }
      if (isValidProperty(item, ['id'])) {
        newItem.id = item['id']
      } else {
        throw new Error(`${NRCSP_ERRORPREFIX} id is missing`) // should never happen
      }
      if (isValidProperty(item, ['dc:title'])) {
        newItem.title = item['dc:title']
      } else {
        throw new Error(`${NRCSP_ERRORPREFIX} title is missing`) // should never happen
      }
      if (isValidProperty(item, ['dc:creator'])) {
        newItem.artist = item['dc:creator']
      }
      if (isValidProperty(item, ['res',tag])) {
        newItem.uri = item['res'][tag]
        newItem.sid = module.exports.getMusicServiceId(item.res[tag])
      }
      
      if (isValidProperty(item, ['upnp:class'])) {
        newItem.upnpClass = item['upnp:class']
      }

      // artURI (cover) maybe an array (one for each track) then choose first
      let artUri = ''
      if (isValidProperty(item, ['upnp:albumArtURI'])) {
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
      if (isValidProperty(item, ['r:resMD'])) {
        newItem.metadata = item['r:resMD']
      }
      return newItem
    })

    return transformedItems  // properties see transformedItems definition
  },

  /**  Returns a sorted array with all group members. Coordinator is in first place.
  * @param {array} allGroupsData output form sonos getAllGroups()
  * @param {number} groupIndex pointing to the specific group 0 ... allGroupsData.length-1
  * @return {promise} array of objects (player) in that group
  *      player: { urlHostname: "192.168.178.37", urlPort: 1400, baseUrl: "http://192.168.178.37:1400", invisible: boolean
  *         sonosName: "Küche", uuid: RINCON_xxxxxxx }
  *
  * @throws if index out of range
  *
  */

  sortedGroupArray: async function (allGroupsData, groupIndex) {
    if (groupIndex < 0 || groupIndex >= allGroupsData.length) {
      throw new Error(`${NRCSP_ERRORPREFIX} index is out of range`)
    }

    const members = []
    const coordinatorUrlHostname = allGroupsData[groupIndex].host
    members.push({ // first push coordinator - sonosName will be updated later!
      urlHostname: coordinatorUrlHostname,
      urlPort: allGroupsData[groupIndex].port,
      baseUrl: `http://${coordinatorUrlHostname}:${allGroupsData[groupIndex].port}`
    })

    let memberUrl
    let invisible
    for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
      memberUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
      invisible = false
      if (allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Invisible) {
        invisible = (allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Invisible === '1')
      }
      if (memberUrl.hostname !== coordinatorUrlHostname) {
        members.push({
          urlHostname: memberUrl.hostname,
          urlPort: memberUrl.port,
          baseUrl: `http://${memberUrl.hostname}:${memberUrl.port}`,
          sonosName: allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName,
          uuid: allGroupsData[groupIndex].ZoneGroupMember[memberIndex].UUID,
          invisible: invisible
        })
      } else {
        // update coordinator on position 0 with name
        members[0].sonosName = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName
        members[0].uuid = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].UUID
        members[0].invisible = invisible
      }
    }
    return members
  },

  /**  Get music service id (sid) from uri.
   * @param  {string} xuri uri such as x-rincon-cpcontainer:1004206ccatalog%2falbums%2fB07NW3FSWR%2f%23album_desc?sid=201&flags=8300&sn=14
   *
   * @return {string} service id or if not found empty string
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

  /**  Get service name for given service id
   * @param  {string} sid service id (integer) or blank
   * 
   * @return {string} service name or if not found empty string
   *
   * @uses database of services (map music service id  to musics service name)
   */

  getMusicServiceName: (sid) => {
    let serviceName = '' // default even if sid is blank
    if (sid !== '') {
      const list = module.exports.MUSIC_SERVICES
      const index = list.findIndex((service) => {
        if (service.sid=== sid) {
          return true
        }
      })
      if (index >= 0) {
        serviceName = list[index].name
      }  
    } 
    return serviceName
  },

  /**  Get radioId from uri - only for TuneIn (Music servic id 254)
   * @param  {string} xuri uri such as x-sonosapi-stream:s24903?sid=254&flags=8224&sn=0
   * 
   * @return {string} service id or if not found empty
   *
   * prerequisite: uri is string where the radio id  is in between "x-sonosapi-stream:"" and "?sid=254"
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

  /**  Get UpnP class.
   * @param  {string} metadata metadata must exist!
   * 
   * @return {string} UpnP class or empty string
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
  }
}
