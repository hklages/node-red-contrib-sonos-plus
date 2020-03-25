'use strict'

const { isValidProperty, isTruthyAndNotEmptyString, getNestedProperty, hhmmss2msec } = require('./Helper.js')
const { encodeXml, sendToPlayerV1, parseSoapBodyV1 } = require('./Soap.js')
const { GenerateMetadata } = require('sonos').Helpers

module.exports = {
  // SONOS related data
  MEDIA_TYPES: ['all', 'Playlist', 'Album', 'Track'],
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
    'object.container.playlistContainer#playlistItem'
  ],

  // ======================  SONOS COMBINED COMMANDS

  /**  Revised default sonos api playNotification function
   * @param  {object}  node current node
   * @param  {array}   members array of sonos players, coordinator/selected player has index 0
   *                            members.length = 1 in case independent or client
   * @param  {object}  options options
   * @param  {string}  options.uri  uri
   * @param  {string}  options.metadata  metadata - will be generated if missing
   * @param  {string}  options.volume volumen during notification
   * @param  {boolean} options.onlyWhenPlaying
   * @param  {boolean} options.sameVolume all player in group play with same volume level
   * @param  {boolean} options.automaticDuration
   * @param  {string}  options.duration format hh:mm:ss
   * @returns {promise} true/false
   *
   */
  playNotificationRevised: async function (node, members, options) {
    // generate metadata if not provided
    if (!isValidProperty(options, ['metadata'])) {
      options.metadata = GenerateMetadata(options.uri).metadata
    }

    // create snapshot state/volume/content
    const snapshot = {}
    const state = await members[0].getCurrentState()
    snapshot.wasPlaying = (state === 'playing' || state === 'transitioning')
    node.debug('wasPlaying >>' + snapshot.wasPlaying)
    if (!snapshot.wasPlaying && options.onlyWhenPlaying === true) {
      node.debug('player was not playing and onlyWhenPlaying was true')
      return
    }
    snapshot.mediaInfo = await members[0].avTransportService().GetMediaInfo()
    snapshot.positionInfo = await members[0].avTransportService().GetPositionInfo()
    snapshot.memberVolumes = []
    snapshot.memberVolumes[0] = await members[0].getVolume()
    if (options.sameVolume) { // all other members, starting at 1
      let vol
      for (let index = 1; index < members.length; index++) {
        vol = await members[index].getVolume()
        snapshot.memberVolumes[index] = vol
      }
    }

    // play notification and set volume
    await members[0].setAVTransportURI({
      uri: options.uri,
      onlyWhenPlaying: options.onlyWhenPlaying,
      metadata: options.metadata
    })
    await members[0].setVolume(options.volume)
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < members.length; index++) {
        await members[index].setVolume(options.volume)
      }
    }

    // waiting either based on SONOS estimation, per default or user specified
    let waitInMilliseconds
    if (options.automaticDuration) {
      const positionInfo = await members[0].avTransportService().GetPositionInfo()
      if (isValidProperty(positionInfo, ['TrackDuration'])) {
        waitInMilliseconds = hhmmss2msec(positionInfo.TrackDuration)
      }
    } else {
      waitInMilliseconds = hhmmss2msec(options.duration)
    }
    await setTimeout[Object.getOwnPropertySymbols(setTimeout)[0]](waitInMilliseconds)
    // return to previous state = restore snapshot
    await members[0].setVolume(snapshot.memberVolumes[0])
    if (options.sameVolume) { // all other members, starting at 1
      for (let index = 1; index < members.length; index++) {
        await members[index].setVolume(snapshot.memberVolumes[index])
      }
    }
    await members[0].setAVTransportURI({
      uri: snapshot.mediaInfo.CurrentURI,
      metadata: snapshot.mediaInfo.CurrentURIMetaData,
      onlySetUri: true
    })
    if (snapshot.positionInfo.Track && snapshot.positionInfo.Track > 1 && snapshot.mediaInfo.NrTracks > 1) {
      await members[0].selectTrack(snapshot.positionInfo.Track)
        .catch(reason => {
          node.debug('Reverting back track failed, happens for some music services.')
        })
    }
    if (snapshot.positionInfo.RelTime && snapshot.positionInfo.TrackDuration !== '0:00:00') {
      node.debug('Setting back time to >>', JSON.stringify(snapshot.positionInfo.RelTime))
      await members[0].avTransportService().Seek({ InstanceID: 0, Unit: 'REL_TIME', Target: snapshot.positionInfo.RelTime }).catch(reason => {
        node.debug('Reverting back track time failed, happens for some music services (radio or stream).')
      })
    }
    if (snapshot.wasPlaying) members[0].play()
  },

  /**  get array of all My Sonos items as object.
   * @param  {object} sonosPlayer Sonos Player
   * @returns {promise} array of My Sonos items
   *
   * Restrictions: Sonos Favorites itmes are missing.
   * Restrictions: MusicLibrary without service id.
   * Restrictions: Audible Audiobooks are missing.
   * Restrictions: Pocket Casts Podcasts without uri, only metaData
   */
  getAllMySonosItems: async function (sonosPlayer) {
    // receive data from player
    const result = await module.exports.getCmd(sonosPlayer.baseUrl, 'Browse')
    const list = await module.exports.parseBrowseFavoritesResults(result)

    // Music library items have special albumArt, without host
    // We have to add the baseurl
    list.forEach(item => {
      if (isValidProperty(item, ['albumArt'])) {
        if (item.albumArt.startsWith('/getaa')) {
          item.albumArt = sonosPlayer.baseUrl + item.albumArt
        }
      }
    })
    return list
  },

  /**  queues My Sonos item (aka adds all tracks to SONOS queue): single song, album, playlist
   * @param  {object} sonosPlayer Sonos Player
   * @param  {string} uri  uri
   * @param  {string} meta  meta data
   * array of my Sonos items as object.
   */
  queue: async function (sonosPlayer, uri, meta) {
    // copy action parameter and update
    const modifiedArgs = {
      EnqueuedURI: encodeXml(uri),
      EnqueuedURIMetaData: encodeXml(meta)
    }
    return module.exports.setCmd(sonosPlayer.baseUrl, 'AddURIToQueue', modifiedArgs)
  },

  /**  stream uri
   * @param  {object} sonosPlayer Sonos Player
   * @param  {string} uri  uri
   * @param  {string} meta  meta data
   */
  stream: async function (sonosPlayer, uri, meta) {
    // TODO NOT WORKING
    // copy action parameter and update
    const modifiedArgs = { EnqueuedURI: encodeXml(uri) }
    if (meta !== '') {
      modifiedArgs.EnqueuedURIMetaData = encodeXml(meta)
    }
    return module.exports.setCmd(sonosPlayer.baseUrl, 'SetAVTransportURI', modifiedArgs)
  },

  /**  set action with new arg object
   * @param  {string} baseUrl the player base url: http://, ip address, seperator : and property
   * @param  {string} actionName the action name
   * @param  {object} modifiedArgs only those properties being modified
   * @returns {promise} true if succesfull
   */
  setCmd: async function (baseUrl, actionName, newArgs) {
    // copy action parameter and update
    const actionParameter = module.exports.ACTIONS_TEMPLATES[actionName]
    Object.assign(actionParameter.args, newArgs)
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
   * @returns {promise} value from action
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
      throw new Error(`n-r-c-s-p: invalid body from sendToPlayer - response >>${JSON.stringify(response)}`)
    }
    const bodyXml = await parseSoapBodyV1(response.body, '')

    // check response - select/transform item properties
    const key = actionParameter.responsePath
    if (!isValidProperty(bodyXml, key)) {
      throw new Error(`n-r-c-s-p: invalid body from sendToPlayer - response >>${JSON.stringify(response)}`)
    }
    const result = getNestedProperty(bodyXml, key)
    if (typeof result !== 'string') {
      // Caution: this check does only work for primitive values (not objects)
      throw new Error('n-r-c-s-p: could not get string value from player')
    }
    return result
  },

  // ======================  HELPERS

  /** Get ip address for a given player name.
   * @param  {string} playerName SONOS player
   * @param  {object} sonosBasePlayer valid player object
   * @return {promise} ip address of the leading SONOS player in that group
   *
   * @prereq sonosBasePlayer has valid ip address
   *
   * @throws exception: getAllGroups returns invalid value
   *         exception: player name not found
   */
  getIpAddressByPlayername: async function (playerName, sonosBasePlayer) {
    const groups = await sonosBasePlayer.getAllGroups()
    // Find our players group, check whether player is coordinator, get ip address
    //
    // groups is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, Coordinater (uuid)
    // ZoneGroupMembers is an array of all members with properties ip address and more

    if (!isTruthyAndNotEmptyString(groups)) {
      throw new Error('n-r-c-s-p: undefined all groups information received')
    }
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < groups[groupIndex].ZoneGroupMember.length; memberIndex++) {
        if (groups[groupIndex].ZoneGroupMember[memberIndex].ZoneName === playerName) {
          // found player for given playerName
          return groups[groupIndex].host
        }
      }
    }
    throw new Error('n-r-c-s-p: could not find given player name in any group')
  },

  /** Get array of all sonosPlayer-data in same group. Coordinator is first in array.
   * @param  {object} sonosPlayer valid player object
   * @return {promise} array of all players urlHostname, urlPort, uuid, name in that group. First member is coordinator
   *
   * @prereq sonosPlayer is validated.
   *
   * @throws exception: getAllGroups returns invalid value
   *         exception: player ip not found in any group
   */
  getGroupMembersData: async function (sonosPlayer) {
    const allGroupsData = await sonosPlayer.getAllGroups()

    if (!isTruthyAndNotEmptyString(allGroupsData)) {
      throw new Error('n-r-c-s-p: undefined all groups data received')
    }

    // find our players group in groups output
    // allGroupsData is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, coordinater (uuid)
    // ZoneGroupMembers is an array of all members with properties ip address and more
    let playerGroupIndex = -1 // indicator for no player found
    let playerUrl
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
        // extact hostname (eg 192.168.178.1) from Locaton field
        playerUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
        if (playerUrl.hostname === sonosPlayer.host) {
          playerGroupIndex = groupIndex
          break
        }
      }
      if (playerGroupIndex >= 0) {
        break
      }
    }
    if (playerGroupIndex === -1) {
      throw new Error('n-r-c-s-p: could not find given player in any group')
    }

    // create array of members with data {urlHostname: "192.168.178.1", urlPort: 1400, sonosName: "Küche", uudi: RINCON_xxxxxxx}. Coordinator is first!
    const members = []
    const coordinatorHostname = allGroupsData[playerGroupIndex].host
    members.push({
      urlHostname: coordinatorHostname,
      urlPort: allGroupsData[playerGroupIndex].port,
      uuid: allGroupsData[playerGroupIndex].Coordinator
    }) // push coordinator
    let memberUrl
    for (let memberIndex = 0; memberIndex < allGroupsData[playerGroupIndex].ZoneGroupMember.length; memberIndex++) {
      memberUrl = new URL(allGroupsData[playerGroupIndex].ZoneGroupMember[memberIndex].Location)
      if (memberUrl.hostname !== coordinatorHostname) {
        members.push({
          urlHostname: memberUrl.hostname,
          urlPort: memberUrl.port,
          sonosName: allGroupsData[playerGroupIndex].ZoneGroupMember[memberIndex].ZoneName,
          uuid: allGroupsData[playerGroupIndex].ZoneGroupMember[memberIndex].UUID
        })
      } else {
        // update coordinator on positon 0 with name
        members[0].sonosName = allGroupsData[playerGroupIndex].ZoneGroupMember[memberIndex].ZoneName
      }
    }
    return members
  },

  /** find searchString in My Sonos items, property title
   * @param  {Array} items array of objects with property title, ...
   * @param  {string} searchString search string for title property
   * @param  {object} filter filter to reduce returned item playlist
   * @param  {string} filter.processingType
   * @param  {string} filter.mediaType media type Album, Track, playlist
   * @param  {string} filter.serviceName service name according to SERVICE_NAME
   * @return {promise} object {title, uri, metaData} or null if not found
   */

  findStringInMySonosTitle: async function (items, searchString, filter) {
    // get service id from filter.serviceName or set '' if all.
    let service = { name: 'unknown', sid: '' }
    // Why: Apart from service there can also be My Sonos item from Music Library
    if (filter.serviceName !== 'all' && filter.serviceName !== 'MusicLibrary') {
      service = module.exports.SERVICES.find(o => o.name === filter.serviceName)
      if (!service) {
        throw new Error('n-r-c-s-p: service currently not supported > ' + filter.serviceName)
      }
    }
    if (!module.exports.MEDIA_TYPES.includes(filter.mediaType)) {
      throw new Error('n-r-c-s-p: invalid media type ' + filter.mediaType)
    }
    // Why: In upnp class playlist has small letters Album, Track but playlist
    const correctedMediaType = filter.mediaType === 'Playlist' ? 'playlist' : filter.mediaType
    for (var i = 0; i < items.length; i++) {
      if (items[i].title.includes(searchString) &&
        items[i].processingType === filter.processingType &&
        (items[i].upnpClass.includes(correctedMediaType) || filter.mediaType === 'all') &&
        (items[i].sid === service.sid ||
          filter.serviceName === 'all' ||
          (filter.serviceName === 'MusicLibrary' && items[i].sid === ''))) {
        return {
          title: items[i].title,
          uri: items[i].uri,
          metaData: items[i].metaData
        }
      }
    }
    // not found
    throw new Error('n-r-c-s-p: No title machting msg.topic found. Modify msg.topic')
  },

  /** Extract list with title, albumArt, uri, metadata, sid, upnpClass and processingType from given input
   * @param  {object} body is Browse response from SONOS player
   * @returns {promise} Array of objects (see above) in JSON format. May return empty array
   * All params must exist!
   */

  parseBrowseFavoritesResults: async function (body) {
    const cleanXml = body.replace('\\"', '')
    const tag = 'uriIdentifier'
    const result = await parseSoapBodyV1(cleanXml, tag)
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
        metaData: original[i]['r:resMD'],
        sid: sid,
        upnpClass: upnpClass,
        processingType: processingType
      })
    }
    return list
  },

  /**  Get sid from uri.
   * @param  {string} uri uri e.g. x-rincon-cpcontainer:1004206ccatalog%2falbums%2fB07NW3FSWR%2f%23album_desc?sid=201&flags=8300&sn=14
   * @returns {string} service id or if not found empty
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
   * @param  {string} metaData metaData must exist!
   * @return {string} UpnP class
   *
   * prereq: uri is string where the UPnP class is in in xml tag <upnp:class>
   */

  getUpnpClass: metaData => {
    let upnpClass = '' // default
    if (isTruthyAndNotEmptyString(metaData)) {
      const positionStart = metaData.indexOf('<upnp:class>') + '<upnp:class>'.length
      const positionEnd = metaData.indexOf('</upnp:class>')
      if (positionStart > 1 && positionEnd > positionStart) {
        upnpClass = metaData.substring(positionStart, positionEnd)
      }
    }
    return upnpClass
  }
}
