'use strict';

const NrcspSoap = require('./Soap.js');
const NrcspHelper = require('./Helper.js');

module.exports = {

  // SONOS related data
  MEDIA_TYPES: ['all', 'Playlist', 'Album', 'Track'],
  ACTIONS_TEMPLATES: require('./Sonos-Actions.json'),
  SERVICES: require('./Sonos-Services.json'),

  UNPN_CLASSES_UNSUPPORTED: ['object.container.podcast.#podcastContainer', 'object.container.albumlist'],
  UPNP_CLASSES_STREAM: ['object.item.audioItem.audioBroadcast'],
  UPNP_CLASSES_QUEUE: ['object.container.album.musicAlbum', 'object.container.playlistContainer', 'object.item.audioItem.musicTrack', 'object.container.playlistContainer#playlistItem'],

  // ======================  SONOS COMBINED COMMANDS

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
    const result = await module.exports.getCmd(sonosPlayer.baseUrl, 'Browse');
    const list = await module.exports.parseBrowseFavoritesResults(result);

    // Music library items have special albumArt, without host
    // We have to add the baseurl
    list.forEach((item, i) => {
      if (NrcspHelper.isValidProperty(item, ['albumArt'])) {
        if (item.albumArt.startsWith('/getaa')) {
          item.albumArt = sonosPlayer.baseUrl + item.albumArt;
        }
      }
    });
    return list;
  },

  /**  queues My Sonos item (aka adds all tracks to SONOS queue): single song, album, playlist
  * @param  {object} sonosPlayer Sonos Player
  * @param  {string} uri  uri
  * @param  {string} meta  meta data
  * array of my Sonos items as object.
  */
  queue: async function (sonosPlayer, uri, meta) {
    // copy action parameter and update
    const modifiedArgs = { EnqueuedURI: NrcspSoap.encodeXml(uri), EnqueuedURIMetaData: NrcspSoap.encodeXml(meta) };
    return module.exports.setCmd(sonosPlayer.baseUrl, 'AddURIToQueue', modifiedArgs);
  },

  /**  stream uri
  * @param  {object} sonosPlayer Sonos Player
  * @param  {string} uri  uri
  * @param  {string} meta  meta data
  */
  stream: async function (sonosPlayer, uri, meta) {
    // TODO NOT WORKING
    // copy action parameter and update
    const modifiedArgs = { EnqueuedURI: NrcspSoap.encodeXml(uri) };
    if (meta !== '') {
      modifiedArgs.EnqueuedURIMetaData = NrcspSoap.encodeXml(meta);
    }
    return module.exports.setCmd(sonosPlayer.baseUrl, 'SetAVTransportURI', modifiedArgs);
  },

  /**  set action with new arg object
  * @param  {string} baseUrl the player base url: http://, ip address, seperator : and property
  * @param  {string} actionName the action name
  * @param  {object} modifiedArgs only those properties being modified
  * @returns {promise} true if succesfull
  */
  setCmd: async function (baseUrl, actionName, newArgs) {
    // copy action parameter and update
    const actionParameter = module.exports.ACTIONS_TEMPLATES[actionName];
    Object.assign(actionParameter.args, newArgs);
    const { path, name, action, args } = actionParameter;
    const response = await NrcspSoap.sendToPlayerV1(baseUrl, path, name, action, args);

    // check response - select/transform item properties
    let bodyXml;
    if (response.statusCode === 200) { // maybe not necessary as promise will throw error
      bodyXml = await NrcspSoap.parseSoapBodyV1(response.body, '');
    } else {
      throw new Error('n-r-c-s-p: status code: ' + response.statusCode + '-- body:' + JSON.stringify(response.body));
    }

    if (!NrcspHelper.isValidProperty(bodyXml, actionParameter.responsePath)) {
      throw new Error('n-r-c-s-p: invalid response from sonos player');
    }
    const result = actionParameter.responsePath.reduce((object, path) => {
      return (object)[path];
    }, bodyXml);

    if (result !== actionParameter.responseValue) {
      throw new Error('n-r-c-s-p: got error message from player: ' + JSON.stringify(bodyXml));
    }
    return true;
  },

  /**  set action with new value.
  * @param  {string} baseUrl the player base url: http://, ip address, seperator : and property
  * @param  {string} actionName the action name
  * @param  {string} value new value (optional)
  * @returns {promise} result from action
  */
  getCmd: async function (baseUrl, actionName) {
    // copy action parameter and update
    const actionParameter = module.exports.ACTIONS_TEMPLATES[actionName];
    const { path, name, action, args } = actionParameter;
    const response = await NrcspSoap.sendToPlayerV1(baseUrl, path, name, action, args);

    // check response - select/transform item properties
    let bodyXml;
    if (response.statusCode === 200) { // maybe not necessary as promise will throw error
      bodyXml = await NrcspSoap.parseSoapBodyV1(response.body, '');
    } else {
      throw new Error('n-r-c-s-p: status code: ' + response.statusCode + '-- body:' + JSON.stringify(response.body));
    }

    // check response - select/transform item properties
    const paths = actionParameter.responsePath;
    const result = paths.reduce((object, element) => {
      return (object || {})[element];
    }, bodyXml);
    // TODO please verify!
    if (typeof result !== 'string') { // Caution: this check does only work for primitive values (not objects)
      throw new Error('n-r-c-s-p: could not get value from player');
    }
    return result;
  },

  // ======================  HELPERS

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
    let service = { name: 'unknown', sid: '' };
    // Why: Apart from service there can also be My Sonos item from Music Library
    if (filter.serviceName !== 'all' && filter.serviceName !== 'MusicLibrary') {
      service = module.exports.SERVICES.find(o => o.name === filter.serviceName);
      if (!service) {
        throw new Error('n-r-c-s-p: service currently not supported > ' + filter.serviceName);
      }
    }
    if (!module.exports.MEDIA_TYPES.includes(filter.mediaType)) {
      throw new Error('n-r-c-s-p: invalid media type ' + filter.mediaType);
    }
    // Why: In upnp class playlist has small letters Album, Track but playlist
    const correctedMediaType = (filter.mediaType === 'Playlist' ? 'playlist' : filter.mediaType);
    for (var i = 0; i < items.length; i++) {
      if ((items[i].title.includes(searchString)) &&
        (items[i].processingType === filter.processingType) &&
        (items[i].upnpClass.includes(correctedMediaType) || filter.mediaType === 'all') &&
        (items[i].sid === service.sid || filter.serviceName === 'all' || (filter.serviceName === 'MusicLibrary' && items[i].sid === ''))) {
        console.log('found: ' + items[i].uri);
        return { title: items[i].title, uri: items[i].uri, metaData: items[i].metaData };
      }
    }
    // not found
    console.log('does not found matching item');
    throw new Error('n-r-c-s-p: No title machting msg.topic found. Modify msg.topic');
  },

  /** Extract list with title, albumArt, uri, metadata, sid, upnpClass and processingType from given input
  * @param  {object} body is Browse response from SONOS player
  * @returns {promise} Array of objects (see above) in JSON format. May return empty array
  * All params must exist!
  */

  parseBrowseFavoritesResults: async function (body) {
    const cleanXml = body.replace('\\"', '');
    const tag = 'uriIdentifier';
    const result = await NrcspSoap.parseSoapBodyV1(cleanXml, tag);
    const list = [];
    let sid, upnpClass, processingType;
    const original = result['DIDL-Lite'].item;
    for (var i = 0; i < original.length; i++) {
      sid = '';
      if (NrcspHelper.isValidProperty(original[i], ['res', tag])) {
        sid = module.exports.getSid(original[i].res[tag]);
      }
      upnpClass = '';
      if (NrcspHelper.isValidProperty(original[i], ['r:resMD'])) {
        upnpClass = module.exports.getUpnpClass(original[i]['r:resMD']);
      }
      processingType = 'unsupported';
      if (module.exports.UPNP_CLASSES_STREAM.includes(upnpClass)) {
        processingType = 'stream';
      }
      if (module.exports.UPNP_CLASSES_QUEUE.includes(upnpClass)) {
        processingType = 'queue';
      }
      console.log(JSON.stringify(original[0]));
      list.push(
        {
          title: original[i]['dc:title'],
          albumArt: original[i]['upnp:albumArtURI'],
          uri: original[i].res[tag],
          metaData: original[i]['r:resMD'],
          sid: sid,
          upnpClass: upnpClass,
          processingType: processingType
        });
    }
    return list;
  },

  /**  Get sid from uri.
  * @param  {string} uri uri e.g. x-rincon-cpcontainer:1004206ccatalog%2falbums%2fB07NW3FSWR%2f%23album_desc?sid=201&flags=8300&sn=14
  * @returns {string} service id or if not found empty
  *
  * prereq: uri is string where the sid is in between ?sid= and &flags=
  */

  getSid: (uri) => {
    let sid = ''; // default even if uri undefined.
    if (NrcspHelper.isTruthyAndNotEmptyString(uri)) {
      const positionStart = uri.indexOf('?sid=') + '$sid='.length;
      const positionEnd = uri.indexOf('&flags=');
      if (positionStart > 1 && (positionEnd > (positionStart))) {
        sid = uri.substring(positionStart, positionEnd);
      }
    }
    return sid;
  },

  /**  Get UpnP class. If not found provide empty string.
  * @param  {string} metaData metaData must exist!
  * @return {string} UpnP class
  *
  * prereq: uri is string where the UPnP class is in in xml tag <upnp:class>
  */

  getUpnpClass: (metaData) => {
    let upnpClass = ''; // default
    if (NrcspHelper.isTruthyAndNotEmptyString(metaData)) {
      const positionStart = metaData.indexOf('<upnp:class>') + '<upnp:class>'.length;
      const positionEnd = metaData.indexOf('</upnp:class>');
      if (positionStart > 1 && (positionEnd > (positionStart))) {
        upnpClass = metaData.substring(positionStart, positionEnd);
      }
    }
    return upnpClass;
  }
};
