'use strict'

const { isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString, getNestedProperty, hhmmss2msec, NRCSP_ERRORPREFIX } = require('./Helper.js')
const { encodeXml, sendToPlayerV1, parseSoapBodyV1 } = require('./Soap.js')
const { GenerateMetadata } = require('sonos').Helpers

module.exports = {
  // SONOS related data
  MEDIA_TYPES: ['all', 'Playlist', 'Album', 'Track'],
  PLAYER_WITH_TV: ['Sonos Beam', 'Sonos Playbar', 'Sonos Playbase'],
  MIME_TYPES: ['.mp3', '.mp4', '.flac', '.m4a', '.ogg', '.wma'],
  ACTIONS_TEMPLATES: require('./Sonos-Actions.json'),
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

  /**  Revised default sonos api playNotification function
   * @param  {object}  node current node
   * @param  {array}   membersAsPlayersPlus array of sonos players with baseUrl, coordinator/selected player has index 0
   *                   members.length = 1 in case independent
   * @param  {object}  options options
   * @param  {string}  options.uri  uri
   * @param  {string}  options.metadata  metadata - will be generated if missing
   * @param  {string}  options.volume volumen during notification
   * @param  {boolean} options.onlyWhenPlaying
   * @param  {boolean} options.sameVolume all player in group play with same volume level
   * @param  {boolean} options.automaticDuration
   * @param  {string}  options.duration format hh:mm:ss
   * @return {promise} true/false
   *
   *
   *    DEPRECIATED -
   *
   */

  // TODO has to be overwork - mixture of different calls: members[].xxx and function(members[])
  // TODO maybe part better in Node file not commands
  playNotificationRevised: async function (node, membersAsPlayerPlus, options) {
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
    const state = await membersAsPlayerPlus[0].getCurrentState()
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    node.debug('wasPlaying >>' + snapshot.wasPlaying)
    if (!snapshot.wasPlaying && options.onlyWhenPlaying === true) {
      node.debug('player was not playing and onlyWhenPlaying was true')
      return
    }
    snapshot.mediaInfo = await membersAsPlayerPlus[0].avTransportService().GetMediaInfo()
    snapshot.positionInfo = await membersAsPlayerPlus[0].avTransportService().GetPositionInfo()
    snapshot.memberVolumes = []
    snapshot.memberVolumes[0] = await membersAsPlayerPlus[0].getVolume()
    if (options.sameVolume) { // all other members, starting at 1
      let vol
      for (let index = 1; index < membersAsPlayerPlus.length; index++) {
        vol = await membersAsPlayerPlus[index].getVolume()
        snapshot.memberVolumes[index] = vol
      }
    }
    node.debug('Snapshot created - now start playing notification')
    let response = await module.exports.setAVTransportURI(membersAsPlayerPlus[0].baseUrl, options.uri, metadata)
    if (!response) {
      throw new Error('n-r-c-s-p: setAVTransportURI response is false')
    }
    response = await module.exports.play(membersAsPlayerPlus[0].baseUrl)
    if (!response) {
      throw new Error('n-r-c-s-p: play response is false')
    }
    await membersAsPlayerPlus[0].setVolume(options.volume)
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < membersAsPlayerPlus.length; index++) {
        await membersAsPlayerPlus[index].setVolume(options.volume)
      }
    }
    node.debug('Playing notification started - now figuring out the end')

    // waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = hhmmss2msec(options.duration)
    if (options.automaticDuration) {
      const positionInfo = await membersAsPlayerPlus[0].avTransportService().GetPositionInfo()
      if (isValidProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = hhmmss2msec(positionInfo.TrackDuration) + WAIT_ADJUSTMENT
        node.debug('Did retrieve duration from SONOS player')
      } else {
        node.debug('Could NOT retrieve duration from SONOS player - using default/specified lenght')
      }
    }
    node.debug('duration >>' + JSON.stringify(waitInMilliseconds))
    await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](waitInMilliseconds)
    node.debug('notification finished - now starting to restore')

    // return to previous state = restore snapshot
    await membersAsPlayerPlus[0].setVolume(snapshot.memberVolumes[0])
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < membersAsPlayerPlus.length; index++) {
        await membersAsPlayerPlus[index].setVolume(snapshot.memberVolumes[index])
      }
    }
    await membersAsPlayerPlus[0].setAVTransportURI({ // using node-sonos
      uri: snapshot.mediaInfo.CurrentURI,
      metadata: snapshot.mediaInfo.CurrentURIMetaData,
      onlySetUri: true
    })
    if (snapshot.positionInfo.Track && snapshot.positionInfo.Track > 1 && snapshot.mediaInfo.NrTracks > 1) {
      await membersAsPlayerPlus[0].selectTrack(snapshot.positionInfo.Track)
        .catch(reason => {
          node.debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.positionInfo.RelTime && snapshot.positionInfo.TrackDuration !== '0:00:00') {
      node.debug('Setting back time to >>', JSON.stringify(snapshot.positionInfo.RelTime))
      await membersAsPlayerPlus[0].avTransportService().Seek({ InstanceID: 0, Unit: 'REL_TIME', Target: snapshot.positionInfo.RelTime })
        .catch(reason => {
          node.debug('Reverting back track time failed, happens for some music services (radio or stream).')
        })
    }
    if (snapshot.wasPlaying) membersAsPlayerPlus[0].play()
  },

  /**  Play notification on a group using coordinator. Coordinator is index 0
   * @param  {object}  node current node - for debugging
   * @param  {array}   membersAsPlayersPlus array of node-sonos player object with baseUrl,
   *                   coordinator has index 0
   *                   length = 1 is allowed if independend.
   * @param  {object}  options options
   * @param  {string}  options.uri  uri
   * @param  {string}  [options.metadata]  metadata - will be generated if missing
   * @param  {string}  options.volume volumen during notification - if -1 dont use, range 1 .. 99
   * @param  {boolean} options.sameVolume all player in group play at same volume level
   * @param  {boolean} options.automaticDuration duration will be received from player
   * @param  {string}  options.duration format hh:mm:ss
   * @return {promise} true
   *
   * @throws if invalid response from setAVTransportURI, play,
   */

  // TODO has to be overwork - mixture of different calls: members[].xxx and function(members[])
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

    let response = await module.exports.setAVTransportURI(membersAsPlayerPlus[coordinatorIndex].baseUrl, options.uri, metadata)
    if (!response) {
      throw new Error('n-r-c-s-p: setAVTransportURI response is invalid')
    }
    response = await module.exports.play(membersAsPlayerPlus[coordinatorIndex].baseUrl)
    if (!response) {
      throw new Error('n-r-c-s-p: play response is false')
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
    node.debug('Playing notification started - now figuring out the end')

    // waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds = hhmmss2msec(options.duration)
    if (options.automaticDuration) {
      const positionInfo = await membersAsPlayerPlus[coordinatorIndex].avTransportService().GetPositionInfo()
      if (isValidProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = hhmmss2msec(positionInfo.TrackDuration) + WAIT_ADJUSTMENT
        node.debug('Did retrieve duration from SONOS player')
      } else {
        node.debug('Could NOT retrieve duration from SONOS player - using default/specified lenght')
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
    await membersAsPlayerPlus[coordinatorIndex].setAVTransportURI({
      uri: snapshot.mediaInfo.CurrentURI,
      metadata: snapshot.mediaInfo.CurrentURIMetaData,
      onlySetUri: true // means dont play
    })
    if (snapshot.positionInfo.Track && snapshot.positionInfo.Track > 1 && snapshot.mediaInfo.NrTracks > 1) {
      await membersAsPlayerPlus[coordinatorIndex].selectTrack(snapshot.positionInfo.Track)
        .catch(reason => {
          node.debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.positionInfo.RelTime && snapshot.positionInfo.TrackDuration !== '0:00:00') {
      node.debug('Setting back time to >>' + JSON.stringify(snapshot.positionInfo.RelTime))
      await membersAsPlayerPlus[coordinatorIndex].avTransportService().Seek({ InstanceID: 0, Unit: 'REL_TIME', Target: snapshot.positionInfo.RelTime })
        .catch(reason => {
          node.debug('Reverting back track time failed, happens for some music services (radio or stream).')
        })
    }
    if (snapshot.wasPlaying) {
      await membersAsPlayerPlus[coordinatorIndex].play()
    }
  },

  /**  Play notification on a single joiner - a player in a group not beeing coordinator.
   * @param  {object}  node current node - for debugging
   * @param  {object}  coordinatorPlus coordinator in group as node-sonos player object with baseUrl
   * @param  {object}  joinerPlus jointer in group
   * @param  {object}  options options
   * @param  {string}  options.uri  uri
   * @param  {string}  [options.metadata]  metadata - will be generated if missing
   * @param  {string}  options.volume volumen during notification. - 1 means dont touch. integer 1 .. 99
   * @param  {boolean} options.automaticDuration
   * @param  {string}  options.duration format hh:mm:ss
   * @return {promise} true
   *
   * @throws all from setAVTransportURI(), avTransportService()*, play, setVolume
   *
   * Hint: joiner will leave group, play notification and rejoin the group. State will be imported from group.
   */

  // TODO has to be overwork - mixture of different calls: members[].xxx and function(members[])
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
    let response = await module.exports.setAVTransportURI(joinerPlus.baseUrl, options.uri, metadata)
    if (!response) {
      throw new Error('n-r-c-s-p: setAVTransportURI response is false')
    }
    response = await module.exports.play(joinerPlus.baseUrl)
    if (!response) {
      throw new Error('n-r-c-s-p: play response is false')
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
        node.debug('Could NOT retrieve duration from SONOS player - using default/specified lenght')
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
      onlySetUri: true // means dont play
    })
    if (snapshot.wasPlaying) {
      await joinerPlus.play()
    }
  },

  /** Get array of all SONOS queue items. Adds baseUrl to albumArtURL
   * @param  {object} sonosPlayer valid player object
   * @return {promise} array of items:
   *
   * @throws all getQueue
   *
   */
  getGroupQueue: async function (sonosPlayer) {
    const queue = await sonosPlayer.getQueue()
    if (!isTruthyAndNotEmptyString(queue)) {
      throw new Error('n-r-c-s-p: undefined getqueue response received')
    }

    if (!isValidPropertyNotEmptyString(queue, ['returned'])) {
      throw new Error('n-r-c-s-p: undefined queue size received')
    }

    let tracksArray = []
    if (queue.returned === '0') {
      /// keep the []
    } else {
      if (!isValidPropertyNotEmptyString(queue, ['items'])) {
        throw new Error('n-r-c-s-p: did not receive any items')
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
  // TODO capture also the group id for verifcation
  // TODO has to be overwork - mixture of different calls: members[].xxx and function(members[])
  // TODO await error handling
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
        playersMutestate = (playersMutestate ? 'On' : 'Off')
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

  // TODO next release with group identifier to ensure that group is not mixed up
  // TODO has to be overwork - mixture of different calls: members[].xxx and function(members[])
  // TODO await error handling
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
        .catch(reason => {
          node.debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.RelTime && snapshot.TrackDuration !== '0:00:00') {
      node.debug('Setting back time to >>', JSON.stringify(snapshot.RelTime))
      await membersAsPlayersPlus[coordinatorIndex].avTransportService().Seek({ InstanceID: 0, Unit: 'REL_TIME', Target: snapshot.RelTime })
        .catch(reason => {
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
        digit = (mutestate === 'On')
        await membersAsPlayersPlus[index].setMuted(digit)
      }
    }
    return true
  },

  /** Get array of all SONOS player data in same group as player. Coordinator is first in array.
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
    if (!isTruthyAndNotEmptyString(allGroupsData[0])) {
      throw new Error('n-r-c-s-p: undefined all groups data received')
    }
    // find our players group in groups output
    // allGroupsData is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, baseUrl, coordinater (uuid)
    // ZoneGroupMembers is an array of all members with properties ip address and more
    let playerGroupIndex = -1 // indicator for no player found
    let name
    let playerUrl
    let usedPlayerHostname
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
        if (searchByName) {
          name = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName
          if (name === playerName) {
            playerGroupIndex = groupIndex
            playerUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
            usedPlayerHostname = playerUrl.hostname
            break
          }
        } else {
          // extact hostname (eg 192.168.178.1) from Locaton field
          playerUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
          if (playerUrl.hostname === sonosPlayer.host) {
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
      throw new Error('n-r-c-s-p: could not find given player in any group')
    }

    // create array of members with data {urlHostname: "192.168.178.37", urlPort: 1400, baseUrl: "http://192.168.178.37:1400",
    //                                    sonosName: "Küche", uuid: RINCON_xxxxxxx}. Coordinator is first!
    const members = []
    const coordinatorUrlHostname = allGroupsData[playerGroupIndex].host
    members.push({ // first push coordinator - sonosName will be updated later!
      urlHostname: coordinatorUrlHostname,
      urlPort: allGroupsData[playerGroupIndex].port,
      baseUrl: `http://${coordinatorUrlHostname}:${allGroupsData[playerGroupIndex].port}`
    })

    let memberUrl
    for (let memberIndex = 0; memberIndex < allGroupsData[playerGroupIndex].ZoneGroupMember.length; memberIndex++) {
      memberUrl = new URL(allGroupsData[playerGroupIndex].ZoneGroupMember[memberIndex].Location)
      if (memberUrl.hostname !== coordinatorUrlHostname) {
        members.push({
          urlHostname: memberUrl.hostname,
          urlPort: memberUrl.port,
          baseUrl: `http://${memberUrl.hostname}:${memberUrl.port}`,
          sonosName: allGroupsData[playerGroupIndex].ZoneGroupMember[memberIndex].ZoneName,
          uuid: allGroupsData[playerGroupIndex].ZoneGroupMember[memberIndex].UUID
        })
      } else {
        // update coordinator on positon 0 with name
        members[0].sonosName = allGroupsData[playerGroupIndex].ZoneGroupMember[memberIndex].ZoneName
        members[0].uuid = allGroupsData[playerGroupIndex].ZoneGroupMember[memberIndex].UUID
      }
    }

    // find our player index in members - that helps to figure out role: coordinator, joiner, independent
    const playerIndex = members.findIndex((member) => member.urlHostname === usedPlayerHostname)
    return { playerIndex: playerIndex, members: members, groupId: allGroupsData[playerGroupIndex].ID, groupName: allGroupsData[playerGroupIndex].Name }
  },

  /**  Get array of all My Sonos items (objects). Version 2 includes Sonos playlists
   * @param   {string} sonosPlayerBaseUrl Sonos Player baseUrl (eg http://192.168.178.37:1400)
   *
   * @return {promise} array of My Sonos items - could be emtpy
   *                   {title, albumArt, uri, metadata, sid, id (in case of a Sonos playlist), upnpClass, processingType}
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
    // TODO check whether limit 100 is a problem or better use 200, 500, 1000?

    // get all My Sonos items - but not Sonos playlists (ObjectID FV:2)
    const response = await module.exports.getCmd(sonosPlayerBaseUrl, 'Browse')
    if (!isTruthyAndNotEmptyString(response)) {
      throw new Error(`n-r-c-s-p: Browse FV-2 response is invalid. Response >>${JSON.stringify(response)}`)
    }
    const listMySonos = await module.exports.parseMySonosWithoutSonosPlaylistsResult(response)
    if (!isTruthyAndNotEmptyString(listMySonos)) {
      throw new Error(`n-r-c-s-p: response form parsing Browse FV-2 invalid. Response >>${JSON.stringify(listMySonos)}`)
    }
    // Music library items have special albumArt, without host
    // We have to add the baseurl
    listMySonos.forEach(item => {
      if (isValidProperty(item, ['albumArt'])) {
        if (item.albumArt.startsWith('/getaa')) {
          item.albumArt = sonosPlayerBaseUrl + item.albumArt
        }
      }
    })

    // get all Sonos playlists (ObjectID SQ)
    // response = await module.exports.getCmd(sonosPlayerBaseUrl, 'BrowseSQ')
    // if (!isTruthyAndNotEmptyString(response)) {
    //   throw new Error(`n-r-c-s-p: browse SQ response is invalid. Response >>${JSON.stringify(response)}`)
    // }
    // const listSonosPlaylists = await module.exports.parseSonosPlaylistsResult(response)
    // if (!isTruthyAndNotEmptyString(listSonosPlaylists)) {
    //   throw new Error(`n-r-c-s-p: response form parsing Browse SQ invalid. Response >>${JSON.stringify(listSonosPlaylists)}`)
    // }

    const listSonosPlaylists = await module.exports.getAllSonosPlaylists(sonosPlayerBaseUrl)
    return listMySonos.concat(listSonosPlaylists)
  },

  /**  Get array of all Sonos playlists (objects). Caution: Upper limit 100
   * @param  {string} sonosPlayerBaseUrl Sonos Player baseUrl (eg http://192.168.178.37:1400)
   *
   * @return {promise} array of Sonos playlists - could be emtpy
   *                   {title, albumArt(array), sid (empty string), uri, metadata(empty string), upnpClass, processingType}
   *
   * @throws if invalid SONOS player response
   *          if parsing went wrong
   *
   */
  getAllSonosPlaylists: async function (sonosPlayerBaseUrl) {
    const response = await module.exports.getCmd(sonosPlayerBaseUrl, 'BrowseSQ')
    if (!isTruthyAndNotEmptyString(response)) {
      throw new Error(`${NRCSP_ERRORPREFIX} browse SQ response is invalid. Response >>${JSON.stringify(response)}`)
    }
    const listSonosPlaylists = await module.exports.parseSonosPlaylistsResult(response)
    if (!isTruthyAndNotEmptyString(listSonosPlaylists)) {
      throw new Error(`${NRCSP_ERRORPREFIX} response form parsing Browse SQ is invalid. Response >>${JSON.stringify(listSonosPlaylists)}`)
    }

    return listSonosPlaylists
  },

  // ========================================================================
  //
  //             BASIC COMMAND
  //             They change only the arguments and use standard services
  //
  // ========================================================================

  /**  Queues the My Sonos item (aka adds all tracks to SONOS queue): single song, album, playlist.
   * @param  {string} sonosPlayerBaseUrl Sonos player baseUrl
   * @param  {string} uri  uri
   * @param  {string} meta  meta data
   */
  queue: async function (sonosPlayerBaseUrl, uri, meta) {
    const modifiedArgs = {
      EnqueuedURI: encodeXml(uri),
      EnqueuedURIMetaData: encodeXml(meta)
    }
    return module.exports.setCmd(sonosPlayerBaseUrl, 'AddURIToQueue', modifiedArgs)
  },

  /**  Saves the SONOS queue to a Sonos playlist.
   * @param  {string} sonosPlayerBaseUrl Sonos player baseUrl
   * @param  {string} title
   */
  saveQueue: async function (sonosPlayerBaseUrl, title) {
    const modifiedArgs = {
      Title: title
    }
    return module.exports.setCmd(sonosPlayerBaseUrl, 'SaveQueue', modifiedArgs)
  },

  /**  Start playing the curren uri (must have been set before - either stream or track in queue).
   * @param  {string} sonosPlayerBaseUrl Sonos player baseUrl
   * @return {promise} true or false
   */
  play: async function (sonosPlayerBaseUrl) {
    return module.exports.setCmd(sonosPlayerBaseUrl, 'Play')
  },

  /**  Set AVTransportURI (but does not play)
   * @param  {string} sonosPlayerBaseUrl Sonos player baseUrl
   * @param  {string} uri  uri
   * @param  {string} meta  meta data
   *
   * @return {promise} setCMD
   */
  setAVTransportURI: async function (sonosPlayerBaseUrl, uri, metadata) {
    const modifiedArgs = { CurrentURI: encodeXml(uri) }
    if (metadata !== '') {
      modifiedArgs.CurrentURIMetaData = encodeXml(metadata)
    }
    return module.exports.setCmd(sonosPlayerBaseUrl, 'SetAVTransportURI', modifiedArgs)
  },

  /**  Get transport info - means state.
  *  @param  {string} sonosPlayerBaseUrl Sonos player baseUrl
  *  @return {promise} current state
  *
  * CAUTION: non-coordinator player in a group will always return playing even when the group is stopped
   */
  getTransportInfo: async function (sonosPlayerBaseUrl) {
    return module.exports.getCmd(sonosPlayerBaseUrl, 'GetTransportInfo')
  },

  /**  Get group mute state.
  *  @param  {string} sonosPlayerBaseUrl Sonos player baseUrl
  *
  *  @return {promise} current group mute state: On, Off
  *
  * CAUTION: non-coordinator player will return an error
   */
  getGroupMute: async function (sonosPlayerBaseUrl) {
    const isMuted = await module.exports.getCmd(sonosPlayerBaseUrl, 'GetGroupMute')
    return (isMuted === '1' ? 'On' : 'Off')
  },

  /**  Get group volume state.
  *  @param  {string} sonosPlayerBaseUrl Sonos player baseUrl
  *  @return {promise} current volume 0 ... 100
  *
  * CAUTION: non-coordinator player will return an error
   */
  getGroupVolume: async function (sonosPlayerBaseUrl) {
    return module.exports.getCmd(sonosPlayerBaseUrl, 'GetGroupVolume')
  },

  /**  Set group mute state.
   * @param  {string} sonosPlayerBaseUrl Sonos player baseUrl
   * @param  {boolean} muteState  the new state
   *
   * @return {promise}
   */
  setGroupMute: async function (sonosPlayerBaseUrl, muteState) {
    const modifiedArgs = { DesiredMute: (muteState ? '1' : '0') }

    return module.exports.setCmd(sonosPlayerBaseUrl, 'SetGroupMute', modifiedArgs)
  },

  /**  Set relative group volume.
   * @param  {string} sonosPlayerBaseUrl Sonos player baseUrl
   * @param  {number} volumeRelative  volume adjustment +/- 0 .. 100
   *
   * @return {promise}
   */
  setGroupVolumeRelative: async function (sonosPlayerBaseUrl, volumeRelative) {
    const modifiedArgs = { Adjustment: volumeRelative }

    return module.exports.setCmd(sonosPlayerBaseUrl, 'SetRelativeGroupVolume', modifiedArgs)
  },

  // ========================================================================
  //
  //                          SET GET COMMANDS
  //
  // ========================================================================

  /**  Set action with new arg object.
   * @param  {string} baseUrl the player base url: http://, ip address, seperator : and property
   * @param  {string} actionName the action name
   * @param  {object} modifiedArgs only those properties being modified
   *
   * @return {promise} true if succesfull
   */
  setCmd: async function (baseUrl, actionName, newArgs) {
    // copy action parameter and update
    const actionParameter = module.exports.ACTIONS_TEMPLATES[actionName]
    Object.assign(actionParameter.args, newArgs)
    const { path, name, action, args } = actionParameter
    const response = await sendToPlayerV1(baseUrl, path, name, action, args)
    // check response - select/transform item properties
    if (!isValidProperty(response, ['statusCode'])) {
      throw new Error(`n-r-c-s-p: invalid status code from sendToPlayer - response.statusCode >>${JSON.stringify(response)}`)
    }
    if (response.statusCode !== 200) {
      throw new Error(`n-r-c-s-p: status code not 200: ${response.statusCode} - response >>${JSON.stringify(response)}`)
    }
    if (!isValidProperty(response, ['body'])) {
      throw new Error(`n-r-c-s-p: invalid body from sendToPlayer - response >>${JSON.stringify(response)}`)
    }
    const bodyXml = await parseSoapBodyV1(response.body, '')

    // check response - select/transform item properties
    const key = actionParameter.responsePath
    if (!isValidProperty(bodyXml, key)) {
      throw new Error(`n-r-c-s-p: invalid body from sendToPlayer - response >>${JSON.stringify(response)}`)
    }
    const result = getNestedProperty(bodyXml, key)

    if (result !== actionParameter.responseValue) {
      throw new Error(`n-r-c-s-p: unexpected response from player >>${JSON.stringify(result)}`)
    }
    return true
  },

  /**  Get action with new value.
   * @param  {string} baseUrl the player base url: http://, ip address, seperator : and property
   * @param  {string} actionName the action name
   * @return {promise} value from action
   *
   * PREREQ: Expectation is that the value is of type string - otherwise an error is
   */
  getCmd: async function (baseUrl, actionName) {
    // copy action parameter and update
    const actionParameter = module.exports.ACTIONS_TEMPLATES[actionName]
    const { path, name, action, args } = actionParameter
    const response = await sendToPlayerV1(baseUrl, path, name, action, args)

    // check response - select/transform item properties
    if (!isValidProperty(response, ['statusCode'])) {
      throw new Error(`n-r-c-s-p: invalid status code from sendToPlayer - response >>${JSON.stringify(response)}`)
    }
    if (response.statusCode !== 200) {
      throw new Error(`n-r-c-s-p: status code not 200: ${response.statusCode} - response >>${JSON.stringify(response)}`)
    }
    if (!isValidProperty(response, ['body'])) {
      throw new Error(`n-r-c-s-p: invalid body (UPNP) from sendToPlayer - response >>${JSON.stringify(response)}`)
    }
    const bodyXml = await parseSoapBodyV1(response.body, '')
    // check response - select/transform item properties
    const key = actionParameter.responsePath
    if (!isValidProperty(bodyXml, key)) {
      throw new Error(`n-r-c-s-p: invalid body XML from sendToPlayer - response >>${JSON.stringify(response)}`)
    }
    const result = getNestedProperty(bodyXml, key)
    if (typeof result !== 'string') {
      // Caution: this check does only work for primitive values (not objects)
      console.log('response >>' + JSON.stringify(result)) // please leave for debugging
      throw new Error('n-r-c-s-p: could not get string value from player')
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
    throw new Error('n-r-c-s-p: No title machting msg.topic found. Modify msg.topic')
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
      throw new Error(`${NRCSP_ERRORPREFIX} reponse form parseSoapBodyV1 is invalid. Response >>${JSON.stringify(result)}`)
    }
    const list = []
    let sid, upnpClass, processingType
    const original = result['DIDL-Lite'].item
    for (var i = 0; i < original.length; i++) {
      sid = ''
      if (isValidProperty(original[i], ['res', tag])) {
        sid = module.exports.getSid(original[i].res[tag])
      }
      upnpClass = ''
      if (isValidProperty(original[i], ['r:resMD'])) {
        upnpClass = module.exports.getUpnpClass(original[i]['r:resMD'])
      }
      processingType = 'unsupported'
      if (module.exports.UPNP_CLASSES_STREAM.includes(upnpClass)) {
        processingType = 'stream'
      }
      if (module.exports.UPNP_CLASSES_QUEUE.includes(upnpClass)) {
        processingType = 'queue'
      }
      list.push({
        title: original[i]['dc:title'],
        albumArt: original[i]['upnp:albumArtURI'],
        uri: original[i].res[tag],
        metadata: original[i]['r:resMD'],
        sid: sid,
        upnpClass: upnpClass,
        processingType: processingType
      })
    }
    return list
  },

  /** Creates a list of items from given Browse output - Sonos playlists SQ:
   * @param   {string}  sonosPlaylistsSoapString string is Browse response, favorites from SONOS player
   *
   * @return {promise} Array of objects (see above) in JSON format. May return empty array
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
      throw new Error(`${NRCSP_ERRORPREFIX} reponse form parseSoapBody is invalid. Response >>${JSON.stringify(result)}`)
    }
    const list = []
    const container = result['DIDL-Lite'].container
    let upnpClass, processingType, id, albumArtURI, firstTrackArtURI
    for (var i = 0; i < container.length; i++) {
      if (isValidProperty(container[i], ['id'])) {
        id = container[i].id
      } else { // should never happen
        throw new Error(`${NRCSP_ERRORPREFIX} id is missing`)
      }
      upnpClass = ''
      if (isValidProperty(container[i], ['upnp:class'])) {
        upnpClass = container[i]['upnp:class']
      }
      processingType = 'unsupported'
      if (module.exports.UPNP_CLASSES_STREAM.includes(upnpClass)) {
        processingType = 'stream'
      }
      if (module.exports.UPNP_CLASSES_QUEUE.includes(upnpClass)) {
        processingType = 'queue'
      }
      firstTrackArtURI = ''
      if (isValidProperty(container[i], ['upnp:albumArtURI'])) {
        albumArtURI = container[i]['upnp:albumArtURI']
        if (Array.isArray(albumArtURI)) {
          if (albumArtURI.length > 0) {
            firstTrackArtURI = albumArtURI[0]
          }
        }
      } else {
        throw new Error(`${NRCSP_ERRORPREFIX} AlbumARTURI is missing`)
      }

      list.push({
        title: container[i]['dc:title'],
        albumArt: firstTrackArtURI,
        uri: container[i].res[tag],
        metadata: '',
        sid: '',
        id: id,
        upnpClass: upnpClass,
        processingType: processingType
      })
    }
    return list
  },

  /**  Get sid from uri.
   * @param  {string} uri uri e.g. x-rincon-cpcontainer:1004206ccatalog%2falbums%2fB07NW3FSWR%2f%23album_desc?sid=201&flags=8300&sn=14
   * @return {string} service id or if not found empty
   *
   * prereq: uri is string where the sid is in between ?sid= and &flags=
   */

  getSid: uri => {
    let sid = '' // default even if uri undefined.
    if (isTruthyAndNotEmptyString(uri)) {
      const positionStart = uri.indexOf('?sid=') + '$sid='.length
      const positionEnd = uri.indexOf('&flags=')
      if (positionStart > 1 && positionEnd > positionStart) {
        sid = uri.substring(positionStart, positionEnd)
      }
    }
    return sid
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
