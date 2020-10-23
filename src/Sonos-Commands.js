'use strict'

const { isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString, getNestedProperty, hhmmss2msec, NRCSP_ERRORPREFIX } = require('./Helper.js')
const { encodeXml, sendToPlayerV1, parseSoapBodyV1 } = require('./Soap.js')
const { GenerateMetadata } = require('sonos').Helpers

module.exports = {
  // SONOS related data
  MEDIA_TYPES: ['all', 'Playlist', 'Album', 'Track'],
  MIME_TYPES: ['.mp3', '.mp4', '.flac', '.m4a', '.ogg', '.wma'],
  ACTIONS_TEMPLATESV2: require('./Sonos-ActionsV3.json'),
  SERVICES: require('./Sonos-Services.json'),

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
    const modifiedArgs = { CurrentURI: encodeXml(options.uri) }
    if (metadata !== '') {
      modifiedArgs.CurrentURIMetaData = encodeXml(metadata)
    }
    let response = await module.exports.executeAction(membersAsPlayerPlus[coordinatorIndex].baseUrl, 'SetAVTransportURI', modifiedArgs)
    if (!response) {
      throw new Error(`${NRCSP_ERRORPREFIX} setAVTransportURI response is invalid`)
    }

    if (options.volume !== -1) {
      await membersAsPlayerPlus[coordinatorIndex].setVolume(options.volume)
      node.debug('same Volume' + options.sameVolume)
      if (options.sameVolume) { // all other members, starting at 1
        for (let index = 1; index < membersAsPlayerPlus.length; index++) {
          await membersAsPlayerPlus[index].setVolume(options.volume)
        }
      }
    }
    response = await module.exports.executeAction(membersAsPlayerPlus[coordinatorIndex].baseUrl, 'Play', {})
   
    if (!response) {
      throw new Error(`${NRCSP_ERRORPREFIX} play response is false`)
    }
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
    const modifiedArgs = { CurrentURI: encodeXml(options.uri) }
    if (metadata !== '') {
      modifiedArgs.CurrentURIMetaData = encodeXml(metadata)
    }
    let response = await module.exports.executeAction(joinerPlus.baseUrl, 'SetAVTransportURI', modifiedArgs)
    if (!response) {
      throw new Error(`${NRCSP_ERRORPREFIX} setAVTransportURI response is invalid`)
    }
    response = await module.exports.executeAction(joinerPlus.baseUrl, 'Play', {})
    if (!response) {
      throw new Error(`${NRCSP_ERRORPREFIX} play response is false`)
    }
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

  /** Get array of all SONOS queue items. Adds baseUrl to albumArtURL
   * @param  {object} sonosPlayer valid sonos player object with baseUrl
   *
   * @return {promise} array of items:
   *
   * @throws all getQueue
   *
   */
  getPlayerQueue: async function (sonosPlayer) {
    const queue = await sonosPlayer.getQueue()
    if (!isTruthyAndNotEmptyString(queue)) {
      throw new Error(`${NRCSP_ERRORPREFIX} getqueue response undefined`)
    }

    if (!isValidPropertyNotEmptyString(queue, ['returned'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue size is undefined`)
    }

    let tracksArray = []
    if (queue.returned === '0') {
      /// keep the []
    } else {
      if (!isValidPropertyNotEmptyString(queue, ['items'])) {
        throw new Error(`${NRCSP_ERRORPREFIX} did not receive any items`)
      }
      tracksArray = queue.items
    }

    tracksArray.forEach(function (track) {
      if (!isValidPropertyNotEmptyString(track, ['albumArtURL'])) {
        // ignore this item
      } else {
        track.albumArtURI = track.albumArtURL
        track.albumArtURL = sonosPlayer.baseUrl + track.albumArtURI
      }
    })
    return tracksArray
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
    // allGroupsData is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, baseUrl, coordinater (uuid)
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
          // extact hostname (eg 192.168.178.1) from Locaton field
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


  /**  Get array of all My Sonos items (objects). Version 2 includes SONOS playlists
   * @param   {string} sonosPlayerBaseUrl SONOS Player baseUrl (eg http://192.168.178.37:1400)
   *
   * @return {promise} array of My Sonos items - could be emtpy
   *                   {title, albumArt, uri, metadata, sid, id (in case of a SONOS playlist), upnpClass, processingType}
   *
   * @throws if invalid SONOS player response
   * if parsing went wrong
   *
   * Restrictions: MusicLibrary/ Sonos playlists without service id.
   * Restrictions: Audible Audiobooks are missing.
   * Restrictions: Pocket Casts Podcasts without uri, only metadata
   */
  getAllMySonosItemsV2: async function (sonosPlayerBaseUrl) {
    // receive data from player - uses default action for Favorites defined in Sonos-Actions, also only 100 entries!
    // TODO Notion limit 100
    // get all My Sonos items - but not Sonos playlists (ObjectID FV:2)
    let modifiedArgs = { ObjectID: 'FV:2' } // My Sonos but not SONOS Playlists
    const response = await module.exports.executeAction(sonosPlayerBaseUrl, 'Browse', modifiedArgs)
    if (!isTruthyAndNotEmptyString(response)) {
      throw new Error(`${NRCSP_ERRORPREFIX} Browse FV-2 response is invalid. Response >>${JSON.stringify(response)}`)
    }
    const listMySonos = await module.exports.parseMySonosWithoutSonosPlaylistsResult(response)
    if (!isTruthyAndNotEmptyString(listMySonos)) {
      throw new Error(`${NRCSP_ERRORPREFIX} response form parsing Browse FV-2 is invalid. Response >>${JSON.stringify(listMySonos)}`)
    }
    // Add TuneIn Radio id in case of TuneIn and
    // Music library items have special albumArt, without host
    // We have to add the baseurl
    listMySonos.forEach(item => {
      if (isValidProperty(item, ['uri'])) {
        item.radioId = module.exports.getRadioId(item.uri)
      }
      if (isValidProperty(item, ['albumArt'])) {
        // double check album art
        if (typeof item.albumArt === 'string' && item.albumArt.startsWith('/getaa')) {
          item.albumArt = sonosPlayerBaseUrl + item.albumArt
        }
      }
    })

    modifiedArgs = { ObjectID: 'SQ:' }  // SONOS Playlists
    const responseBrowse = await module.exports.executeAction(sonosPlayerBaseUrl, 'Browse', modifiedArgs)
    if (!isTruthyAndNotEmptyString(responseBrowse)) {
      throw new Error(`${NRCSP_ERRORPREFIX} browse SQ response is invalid. Response >>${JSON.stringify(responseBrowse)}`)
    }
    const playLists = await module.exports.parseSonosPlaylistsResult(responseBrowse)
    if (!isTruthyAndNotEmptyString(playLists)) {
      throw new Error(`${NRCSP_ERRORPREFIX} response form parsing Browse SQ is invalid. Response >>${JSON.stringify(playLists)}`)
    }
    return listMySonos.concat(playLists)
  },


  // ========================================================================
  //
  //                          EXECUTE UPNP ACTION COMMAND
  //
  // ========================================================================

  /**  Execute action - handles get and set. Version 2 needs Sonos-ActionsV3.JSON
   * @param  {string} baseUrl the player base url such as http://192.168.178.37:1400
   * @param  {string} actionName the action name such as Seek
   * @param  {object} modifiedArgs only those properties being modified - defaults see SonosActionsV2.JSON
   *
   * @return {promise} set action: true/false | get action: value from action
   *
   * Everything OK if statusCode === 200 and body includes expected response value (set) or value (get)
   */
  executeAction: async function (baseUrl, actionIdentifier, newArgs) {
    // get action defaults from definition file and update with new arguments
    const actionParameter = module.exports.ACTIONS_TEMPLATESV2[actionIdentifier] 
    const { endpoint, args } = actionParameter
    Object.assign(args, newArgs) 

    // generate serviceName from endpoint - its always the second last
    // SONOS endpoint is either /<device>/<serviceName>/Control or /<serviceName>/Control
    const tmp = endpoint.split('/')  
    const serviceName = tmp[tmp.length - 2]
  
    const response = await sendToPlayerV1(baseUrl, endpoint, serviceName, actionIdentifier, args)

    // check response statusCode:
    // Everything OK if statusCode === 200 and body includes expected response value or requested value
    if (!isValidProperty(response, ['statusCode'])) {
      // This should never happen. Avoiding unhandled exception.
      throw new Error(`${NRCSP_ERRORPREFIX} status code from sendToPlayer is invalid - response.statusCode >>${JSON.stringify(response)}`)
    }
    if (response.statusCode !== 200) {
      // This should not happen as long as axios is being used. Avoiding unhandled exception.
      throw new Error(`${NRCSP_ERRORPREFIX} status code is not 200: ${response.statusCode} - response >>${JSON.stringify(response)}`)
    }
    if (!isValidProperty(response, ['body'])) {
      // This should not happen. Avoiding unhandled exception.
      throw new Error(`${NRCSP_ERRORPREFIX} body from sendToPlayer is invalid - response >>${JSON.stringify(response)}`)
    }
    const bodyXml = await parseSoapBodyV1(response.body, '')
    // check body response  - generate key (as string array) to access the relevant response
    // in case of set: also the expectedResponseValue 
    const key = ['s:Envelope', 's:Body'] // for response
    key.push(`u:${actionIdentifier}Response`)
    // eslint-disable-next-line no-prototype-builtins
    const isGetAction = actionParameter.hasOwnProperty('returnValueName')  
    let expectedResponseValue // only needed in case of not isGetAction
    if (isGetAction) {
      key.push(actionParameter.returnValueName)
      // no expected response value
    } else {
      key.push('xmlns:u')    
      expectedResponseValue = `urn:schemas-upnp-org:service:${serviceName}:1`
    }
    if (!isValidProperty(bodyXml, key)) {
      throw new Error(`${NRCSP_ERRORPREFIX} body from sendToPlayer is invalid - response >>${JSON.stringify(response)}`)
    }
    let result = getNestedProperty(bodyXml, key)
    if (isGetAction) {
      if (typeof result !== 'string') {
        // Caution: this check does only work for primitive values (not objects)
        throw new Error(`${NRCSP_ERRORPREFIX} could not get string value from player`)
      }
    } else {
      if (result !== expectedResponseValue) {
        throw new Error(`${NRCSP_ERRORPREFIX} response from player not expected >>${JSON.stringify(result)}`)
      }
      result = true
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

  /** Creates a list of items from given Browse FV:2 (My Sonos but without Sonos playlists) output.
   * @param   {string}  favoritesSoapString string is Browse response, favorites from SONOS player
   *
   * @return {promise} Array of objects (see above) in JSON format. May return empty array
   *                    {title, albumArt, uri, metadata, sid, upnpClass, processingType}
   *
   * @throws if parseSoapBody is in error
   */

  parseMySonosWithoutSonosPlaylistsResult: async function (favoritesSoapString) {
    const cleanXml = favoritesSoapString.replace('\\"', '')
    const tag = 'uriIdentifier'
    const result = await parseSoapBodyV1(cleanXml, tag)
    if (!isTruthyAndNotEmptyString(result)) {
      throw new Error(`${NRCSP_ERRORPREFIX} response form parseSoapBodyV1 is invalid. Response >>${JSON.stringify(result)}`)
    }
    const list = []
    let sid, upnpClass, processingType, albumArtUriData, albumArtUri
    if (isValidProperty(result, ['DIDL-Lite', 'item'])) {
      const item = result['DIDL-Lite'].item
      let itemList = [] // parseSoapBodyV1 does not create array in case of one item! See parseSoapBodyV1 options
      if (!Array.isArray(item)) {
        itemList.push(item)
      } else {
        itemList = item
      }
      for (var i = 0; i < itemList.length; i++) {
        sid = ''
        if (isValidProperty(itemList[i], ['res', tag])) {
          sid = module.exports.getSid(itemList[i].res[tag])
        }
        upnpClass = ''
        if (isValidProperty(itemList[i], ['r:resMD'])) {
          upnpClass = module.exports.getUpnpClass(itemList[i]['r:resMD'])
        }
        processingType = 'unsupported'
        if (module.exports.UPNP_CLASSES_STREAM.includes(upnpClass)) {
          processingType = 'stream'
        }
        if (module.exports.UPNP_CLASSES_QUEUE.includes(upnpClass)) {
          processingType = 'queue'
        }
        // albumArtUri may be an array - then provide only first item
        albumArtUri = ''
        if (isValidProperty(itemList[i], ['upnp:albumArtURI'])) {
          albumArtUriData = itemList[i]['upnp:albumArtURI']
          if (typeof albumArtUriData === 'string') {
            albumArtUri = albumArtUriData
          } else if (Array.isArray(albumArtUriData)) {
            if (albumArtUriData.length > 0) {
              albumArtUri = albumArtUri[0]
            }
          }
        }

        list.push({
          title: itemList[i]['dc:title'],
          albumArt: albumArtUri,
          uri: itemList[i].res[tag],
          metadata: itemList[i]['r:resMD'],
          sid: sid,
          upnpClass: upnpClass,
          processingType: processingType
        })
      }
    }
    return list
  },

  /** Creates a list of items from given Browse output - Sonos playlists SQ:.
   * @param   {string}  sonosPlaylistsSoapString string is Browse response, favorites from SONOS player
   *
   * @return {promise} Array of objects (see above) in JSON format. Empty array if no sonos playlists exists.
   *                    {title, albumArt (of first track), uri, metadata (empty string), sid (empty string), id, upnpClass, processingType}
   *
   * @throws if parseSoapBody is in error
   *         if id is missing
   *         if AlbumART missing
   */

  parseSonosPlaylistsResult: async function (sonosPlaylistsSoapString) {
    const cleanXml = sonosPlaylistsSoapString.replace('\\"', '')
    const tag = 'uriIdentifier'
    const result = await parseSoapBodyV1(cleanXml, tag)
    if (!isTruthyAndNotEmptyString(result)) {
      throw new Error(`${NRCSP_ERRORPREFIX} response form parseSoapBody is invalid. Response >>${JSON.stringify(result)}`)
    }
    const list = [] // no sonos playlists
    if (isValidProperty(result, ['DIDL-Lite', 'container'])) {
      const container = result['DIDL-Lite'].container
      let itemList = [] // parseSoapBodyV1 does not create array in case of one item! See parseSoapBodyV1 options
      if (!Array.isArray(container)) {
        itemList.push(container)
      } else {
        itemList = container
      }
      let upnpClass, processingType, id, albumArtUri, firstTrackArtUri
      for (var i = 0; i < itemList.length; i++) {
        if (isValidProperty(itemList[i], ['id'])) {
          id = itemList[i].id
        } else { // should never happen
          throw new Error(`${NRCSP_ERRORPREFIX} id is missing`)
        }
        upnpClass = ''
        if (isValidProperty(itemList[i], ['upnp:class'])) {
          upnpClass = itemList[i]['upnp:class']
        }
        processingType = 'unsupported'
        if (module.exports.UPNP_CLASSES_STREAM.includes(upnpClass)) {
          processingType = 'stream'
        }
        if (module.exports.UPNP_CLASSES_QUEUE.includes(upnpClass)) {
          processingType = 'queue'
        }
        firstTrackArtUri = ''
        // albumArtURI is an array (album art for each track)
        if (isValidProperty(itemList[i], ['upnp:albumArtURI'])) {
          albumArtUri = itemList[i]['upnp:albumArtURI']
          if (Array.isArray(albumArtUri)) {
            if (albumArtUri.length > 0) {
              firstTrackArtUri = albumArtUri[0]
            }
          }
        }
        list.push({
          title: itemList[i]['dc:title'],
          albumArt: firstTrackArtUri,
          uri: itemList[i].res[tag],
          metadata: '',
          sid: '',
          id: id,
          upnpClass: upnpClass,
          processingType: processingType
        })
      }
    }
    return list
  },

  /** Creates a list of items from given Browse output. 
   * @param   {string}  browseResult string is Browse response
   *
   * @return {promise} Array of objects. Empty if Browse does not provide data.
   *                   
   * @throws if parseSoapBody is in error
   *         
   */

  extractContainers: async function (didlString) {
    const cleanXml = didlString.replace('\\"', '') // unescape double quotes!
    const tag = 'uriIdentifier' // uri is character content (_) from <res> 
    const didlJson = await parseSoapBodyV1(cleanXml, tag)

    if (didlJson === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} Function parseSoapBodyV2 provides empty string}`)
    }
    let containerArray = []
    let container
    // handle single container (caused by parseSoapBody) item and no container item
    if (isValidProperty(didlJson, ['DIDL-Lite', 'container'])) {
      container = didlJson['DIDL-Lite']['container']
      if (Array.isArray(container)) { 
        containerArray = container.slice()
      } else { // single container item  - convert to array
        containerArray.push(container) 
      }
    } else {
      containerArray = []
    }

    // transform properties 
    let itemList = containerArray.map(element => {
      let item = {}
      if (isValidProperty(element, ['id'])) {
        item.id = element['id']
      }
      if (isValidProperty(element, ['upnp:class'])) {
        item.upnpClass = element['upnp:class']
      }
      if (isValidProperty(element, ['dc:title'])) {
        item.title = element['dc:title']
      }
      if (isValidProperty(element, ['dc:creator'])) {
        item.artist = element['dc:creator']
      }
      if (isValidProperty(element, ['res',tag])) {
        item.uri = element['res'][tag]
      }
      return item
    })

    return itemList
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

  /**  Get sid from uri.
   * @param  {string} xuri uri such as x-rincon-cpcontainer:1004206ccatalog%2falbums%2fB07NW3FSWR%2f%23album_desc?sid=201&flags=8300&sn=14
   * @return {string} service id or if not found empty
   *
   * prerequisites: uri is string where the sid is in between ?sid= and &flags=
   */

  getSid: xuri => {
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

  /**  Get radioId from uri.
   * @param  {string} xuri uri such as x-sonosapi-stream:s24903?sid=254&flags=8224&sn=0
   * @return {string} service id or if not found empty
   *
   * prereq: uri is string where the sid is in between ?sid= and &flags=
   */

  getRadioId: xuri => {
    let radioId = ''
    if (xuri.startsWith('x-sonosapi-stream:') && xuri.includes('sid=254')) {
      const end = xuri.indexOf('?sid=254')
      const start = 'x-sonosapi-stream:'.length
      radioId = xuri.substring(start, end)
    }
    return radioId
  },
  /**  Get UpnP class. If not found provide empty string.
   * @param  {string} metadata metadata must exist!
   * @return {string} UpnP class
   *
   * prereq: uri is string where the UPnP class is in in xml tag <upnp:class>
   */

  getUpnpClass: metadata => {
    let upnpClass = '' // default
    if (isTruthyAndNotEmptyString(metadata)) {
      const positionStart = metadata.indexOf('<upnp:class>') + '<upnp:class>'.length
      const positionEnd = metadata.indexOf('</upnp:class>')
      if (positionStart > 1 && positionEnd > positionStart) {
        upnpClass = metadata.substring(positionStart, positionEnd)
      }
    }
    return upnpClass
  }
}
