const SonosHelper = require('./SonosHelper.js');
const helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  /**  Create Manage Queue Node and subscribe to messages.
  * @param  {Object} config current node configuration data
  */
  function SonosManageQueueNode (config) {
    RED.nodes.createNode(this, config);
    const sonosFunction = 'setup subscribe';

    const node = this;
    const configNode = RED.nodes.getNode(config.confignode);

    if (!helper.validateConfigNode(configNode)) {
      helper.nrcspFailure(node, null, new Error('n-r-c-s-p: invalid config node'), sonosFunction);
      return;
    }

    // clear node status
    node.status({});
    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received');

      // if ip address exist use it or get it via discovery based on serialNum
      if (!(typeof configNode.ipaddress === 'undefined' || configNode.ipaddress === null ||
        (typeof configNode.ipaddress === 'number' && isNaN(configNode.ipaddress)) || configNode.ipaddress.trim().length < 7)) {
        // exisiting ip address - fastes solution, no discovery necessary
        node.debug('using IP address of config node');
        processInputMsg(node, msg, configNode.ipaddress);
      } else {
        // have to get ip address via disovery with serial numbers
        helper.nrcspWarning(node, sonosFunction, 'No ip address', 'Providing ip address is recommended');
        if (!(typeof configNode.serialnum === 'undefined' || configNode.serialnum === null ||
                (typeof configNode.serialnum === 'number' && isNaN(configNode.serialnum)) || (configNode.serialnum.trim()).length < 19)) {
          helper.discoverSonosPlayerBySerial(node, configNode.serialnum, (err, ipAddress) => {
            if (err) {
              helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: discovery failed'), sonosFunction);
              return;
            }
            if (ipAddress === null) {
              helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: could not find any player by serial'), sonosFunction);
            } else {
              // setting of nodestatus is done in following call handelIpuntMessage
              node.debug('Found sonos player');
              processInputMsg(node, msg, ipAddress);
            }
          });
        } else {
          helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: invalid config node - invalid serial'), sonosFunction);
        }
      }
    });
  }

  // -------------------------------------------------------------------------

  /**  Validate sonos player and input message then dispatch further.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function processInputMsg (node, msg, ipaddress) {
    const sonosFunction = 'handle input msg';
    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null ||
      (typeof sonosPlayer === 'number' && isNaN(sonosPlayer)) || sonosPlayer === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined sonos player. Check configuration'), sonosFunction);
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (typeof msg.payload === 'undefined' || msg.payload === null ||
      (typeof msg.payload === 'number' && isNaN(msg.payload)) || msg.payload === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined payload'), sonosFunction);
      return;
    }

    let command = String(msg.payload);
    command = command.toLowerCase();

    // dispatch
    if (command === 'insert_uri') {
      insertUri(node, msg, sonosPlayer);
    } else if (command === 'insert_spotify_uri') {
      insertSpotifyUri(node, msg, sonosPlayer);
    } else if (command === 'insert_prime_playlisturi') {
      insertPrimePlaylistUri(node, msg, sonosPlayer);
    } else if (command === 'insert_prime_playlist') {
      // TODO Remove in future
      helper.nrcspWarning(node, sonosFunction, 'Command depreciated', 'Please use insert_prime_playlisturi');
    } else if (command === 'insert_spotify') {
      insertMySonosSpotify(node, msg, sonosPlayer, false);
    } else if (command === 'insert_spotify_playlist') {
      insertMySonosSpotify(node, msg, sonosPlayer, true);
    } else if (command === 'insert_amazonprime_playlist') {
      insertMySonosAmazonPrimePlaylist(node, msg, sonosPlayer);
    } else if (command === 'insert_sonos_playlist') {
      insertSonosPlaylist(node, msg, sonosPlayer);
    } else if (command === 'insert_musiclibrary_playlist') {
      insertMusicLibraryPlaylist(node, msg, sonosPlayer);
    } else if (command === 'activate_queue') {
      activateQueue(node, msg, sonosPlayer);
    } else if (command === 'play_song') {
      playSong(node, msg, sonosPlayer, msg.topic);
    } else if (command === 'flush_queue') {
      flushQueue(node, msg, sonosPlayer);
    } else if (command === 'remove_song') {
      removeSongFromQueue(node, msg, sonosPlayer);
    } else if (command === 'set_queuemode') {
      setQueuemode(node, msg, sonosPlayer);
    } else if (command === 'get_queue') {
      getQueue(node, msg, sonosPlayer);
    } else if (command === 'get_spotify') {
      getMySonosSpotify(node, msg, sonosPlayer);
    } else if (command === 'get_amazonprime_playlists') {
      getMySonosAmazonPrimePlaylists(node, msg, sonosPlayer);
    } else if (command === 'get_sonos_playlists') {
      getSonosPlaylists(node, msg, sonosPlayer);
    } else if (command === 'get_musiclibrary_playlists') {
      getMusicLibraryPlaylists(node, msg, sonosPlayer);
    } else if (command === 'get_queuemode') {
      getQueuemode(node, msg, sonosPlayer);
    } else {
      helper.nrcspWarning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(command));
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /**  Insert defined uri at end of SONOS queue. Can be used for single songs, playlists, .... Does NOT activate queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *                 topic valid uri
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, no modifications!
  */
  function insertUri (node, msg, sonosPlayer) {
    const sonosFunction = 'insert uri';

    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    const uri = msg.topic;

    sonosPlayer.queue(uri)
      .then(response => {
        // will response something like {"FirstTrackNumberEnqueued":"1","NumTracksAdded":"1","NewQueueLength":"1"}
        node.debug('response:' + JSON.stringify(response));
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Insert Spotify uri at end of SONOS queue. Can be used for single songs, album, playlists, .... Does NOT activate queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *                 topic valid uri see examples
  *                 region valid region, 4 digits EU 2311, US 3079. DEFAULT is EU
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, no modifications!
  * Valid examples
  * spotify:track:5AdoS3gS47x40nBNlNmPQ8
  * spotify:album:1TSZDcvlPtAnekTaItI3qO
  * spotify:artistTopTracks:1dfeR4HaWDbWqFHLkxsg1d
  * spotify:user:spotify:playlist:37i9dQZEVXbMDoHDwVN2tF'
  */
  function insertSpotifyUri (node, msg, sonosPlayer) {
    const sonosFunction = 'insert spotify uri';

    // validate msg.topic as spotify uri
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    const uri = msg.topic;
    if (!(uri.startsWith('spotify:track:') || uri.startsWith('spotify:album:') ||
        uri.startsWith('spotify:artistTopTracks:') || uri.startsWith('spotify:user:spotify:playlist:'))) {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: topic must be track, album, artistTopTracks or playlist'), sonosFunction);
      return;
    }

    // validate msg.region as region - default is EU 2311. US would be 3079?
    const Sonos = require('sonos');
    sonosPlayer.setSpotifyRegion(Sonos.SpotifyRegion.EU);
    if (typeof msg.region === 'undefined' || msg.region === null ||
    (typeof msg.region === 'number' && isNaN(msg.region)) || msg.region === '') {
      const Sonos = require('sonos');
      sonosPlayer.setSpotifyRegion(Sonos.SpotifyRegion.EU);
    } else {
      const regex = /^\d{4}$/;
      if ((msg.region).match(regex)) {
        sonosPlayer.setSpotifiyRegion(msg.region);
      } else {
        helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: invalid region specified - must be 4 digits'), sonosFunction);
        return;
      }
    }

    sonosPlayer.queue(uri)
      .then(response => {
        // will response something like {"FirstTrackNumberEnqueued":"1","NumTracksAdded":"1","NewQueueLength":"1"}
        node.debug('response:' + JSON.stringify(response));
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Insert all songs of specified Amazon Prime playlist (URI format) into SONOS queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *           topic uri of playlist (very specific format)
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, no modification
  */
  function insertPrimePlaylistUri (node, msg, sonosPlayer) {
    // https://github.com/bencevans/node-sonos/issues/308 ThomasMirlacher
    const sonosFunction = 'insert prime playlist';

    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined prime playlist'), sonosFunction);
      return;
    }
    if (!msg.topic.startsWith('x-rincon-cpcontainer:')) {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: invalid prime playlist'), sonosFunction);
      return;
    }

    const uri = msg.topic;
    const newUri = String(uri).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const parsed = newUri.match(/^(x-rincon-cpcontainer):(.*)\?(.*)/).splice(1);
    // TODO Region? Does that work everywhere?
    const region = 51463;
    const title = 'Amazon Prime Playlist';
    const metadata = `
      <DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
      <item id="${parsed[1]}" restricted="true">
      <dc:title>${title}</dc:title>
      <upnp:class>object.container.playlistContainer</upnp:class>
      <desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON${region}_X_#Svc${region}-0-Token</desc>
      </item>
      </DIDL-Lite>`;
    sonosPlayer.queue({ uri, metadata })
      .then(response => {
        // response something like {"FirstTrackNumberEnqueued":"54","NumTracksAdded":"52","NewQueueLength":"105"}
        node.debug('response:' + JSON.stringify(response));
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Insert all songs from matching My Sonos Spotify items (first match, topic string) into SONOS queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *        topic: part of the title name; is search string
  *        region: valid region, 4 digits EU 2311, US 3079. DEFAULT is EU
  * @param  {Object} sonosPlayer Sonos Player
  * @param  {Boolean} onlyPlaylists yes if only playlists should be searched
  * @output {Object} Success: msg, no modification
  */
  function insertMySonosSpotify (node, msg, sonosPlayer, onlyPlaylists) {
    let sonosFunction = 'insert spotify';
    if (onlyPlaylists) {
      sonosFunction = 'insert spotify playlist';
    }
    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }

    // validate msg.region - default is EU 2311. US would be 3079?
    if (typeof msg.region === 'undefined' || msg.region === null ||
    (typeof msg.region === 'number' && isNaN(msg.region)) || msg.region === '') {
      const Sonos = require('sonos');
      sonosPlayer.setSpotifyRegion(Sonos.SpotifyRegion.EU);
    } else {
      const regex = /^\d{4}$/;
      if ((msg.region).match(regex)) {
        sonosPlayer.setSpotifiyRegion(msg.region);
      } else {
        helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: invalid region specified - must be 4 digits'), sonosFunction);
        return;
      }
    }

    sonosPlayer.getFavorites()
      .then(response => {
        // get array of all Spotify playlists and return
        const SERVICE_IDENTIFIER = 'spotify%3a';
        const playlistArray = []; // will hold all playlist items
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getFavorites response received');
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: Could not find any My Sonos items or player not reachable');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined favorite list received');
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list');
        }
        let playlistUri = '';
        // node.debug('favorites:' + JSON.stringify(response.items));
        let itemTitle;
        for (let i = 0; i < parseInt(response.items.length); i++) {
          if (typeof response.items[i].uri === 'undefined' || response.items[i].uri === null ||
            (typeof response.items[i].uri === 'number' && isNaN(response.items[i].uri)) || response.items[i].uri === '') {
            helper.nrcspWarning(node, sonosFunction, 'item does NOT have uri property', 'item does NOT have uri property - ignored');
          } else {
            playlistUri = response.items[i].uri;
            if (playlistUri.indexOf(SERVICE_IDENTIFIER) > 0) {
              // found prime playlist
              playlistUri = response.items[i].uri;
              if (typeof response.items[i].title === 'undefined' || response.items[i].title === null ||
                (typeof response.items[i].title === 'number' && isNaN(response.items[i].title)) || response.items[i].title === '') {
                helper.nrcspWarning(node, sonosFunction, 'item does NOT have Title property', 'item does NOT have Title property - ignored');
                itemTitle = 'unknown';
              } else {
                itemTitle = response.items[i].title;
              }
              playlistArray.push({ title: itemTitle, uri: playlistUri });
            }
          }
        }
        if (playlistArray.length === 0) {
          throw new Error('n-r-c-s-p: could not find any spotify item');
        }
        return playlistArray;
      })
      .then((playlistArray) => {
        // find topic in title and return uri
        node.debug('playlist array: ' + JSON.stringify(playlistArray));
        let position = -1;
        for (let i = 0; i < playlistArray.length; i++) {
          if ((playlistArray[i].title).indexOf(msg.topic) > -1) {
            position = i;
            break;
          }
        }
        if (position === -1) {
          throw new Error('n-r-c-s-p: could not find playlist name in playlists');
        } else {
          return playlistArray[position].uri;
        }
      })
      .then((uri) => {
        // create new uri for queue command (%3a is :)
        // from:
        // playlist: x-rincon-cpcontainer:1006206cspotify%3aplaylist%3a37i9dQZEVXbMDoHDwVN2tF?sid=9&flags=8300&sn=16
        // album: x-rincon-cpcontainer:1004206cspotify%3aalbum%3a1xn54DMo2qIqBuMqHtUsFd?sid=9&flags=8300&sn=16
        // track: x-sonos-spotify:spotify%3atrack%3a1rgnBhdG2JDFTbYkYRZAku?sid=9&flags=8224&sn=16
        // to
        // spotify:user:spotify:playlist:37i9dQZEVXbMDoHDwVN2tF'
        // spotify:album:1xn54DMo2qIqBuMqHtUsFd
        // spotify:track:1rgnBhdG2JDFTbYkYRZAku?sid

        // convert from .. to
        const spotifySplit = uri.split('%3a');
        if (spotifySplit.length < 2) {
          throw new Error('n-r-c-s-p: invalid uri syntax: %3a' + JSON.stringify(uri));
        }
        const spotifyType = spotifySplit[1];
        let spotifyId = spotifySplit[2];
        const idEnd = spotifyId.indexOf('?sid');
        if (spotifySplit.length < 0) {
          throw new Error('n-r-c-s-p: invalid uri syntax - ?: ' + JSON.stringify(uri));
        }
        spotifyId = spotifyId.substring(0, idEnd);
        let newUri;
        switch (spotifyType) {
          case 'playlist':
            newUri = `spotify:user:spotify:playlist:${spotifyId}`;
            break;
          case 'album':
            if (onlyPlaylists) {
              throw new Error('n-r-c-s-p: album found but no playlist');
            } else {
              newUri = `spotify:album:${spotifyId}`;
            }
            break;
          case 'track':
            if (onlyPlaylists) {
              throw new Error('n-r-c-s-p: album found but no playlist');
            } else {
              newUri = `spotify:track:${spotifyId}`;
            }
            break;
          default:
            throw new Error('n-r-c-s-p: invalid spotify type: ' + spotifyType);
        }
        node.debug('uri> ' + JSON.stringify(newUri));
        return newUri;
      })
      .then((newUri) => { return sonosPlayer.queue(newUri); })
      .then((response) => {
        // response something like {"FirstTrackNumberEnqueued":"54","NumTracksAdded":"52","NewQueueLength":"105"}
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }
  /**  Insert all songs from matching My Sonos Amazon Prime Playlist  (first match, topic string) into SONOS queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *        topic: part of the title name; is search string
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, no modification
  */
  function insertMySonosAmazonPrimePlaylist (node, msg, sonosPlayer) {
    const sonosFunction = 'insert amazon prime playlist';

    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }

    sonosPlayer.getFavorites()
      .then(response => {
        // get array of playlists and return
        const SERVICE_IDENTIFIER = 'prime_playlist';
        const playlistArray = []; // will hold all playlist items
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getFavorites response received');
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: Could not find any My Sonos items or player not reachable');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined favorite list received');
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list');
        }
        let playlistUri = '';
        node.debug('favorites:' + JSON.stringify(response.items));
        let itemTitle;
        for (let i = 0; i < parseInt(response.items.length); i++) {
          if (typeof response.items[i].uri === 'undefined' || response.items[i].uri === null ||
            (typeof response.items[i].uri === 'number' && isNaN(response.items[i].uri)) || response.items[i].uri === '') {
            helper.nrcspWarning(node, sonosFunction, 'item does NOT have uri property', 'item does NOT have uri property - ignored');
          } else {
            playlistUri = response.items[i].uri;
            if (playlistUri.indexOf(SERVICE_IDENTIFIER) > 0) {
              // found prime playlist
              playlistUri = response.items[i].uri;
              if (typeof response.items[i].title === 'undefined' || response.items[i].title === null ||
                (typeof response.items[i].title === 'number' && isNaN(response.items[i].title)) || response.items[i].title === '') {
                helper.nrcspWarning(node, sonosFunction, 'item does NOT have Title property', 'item does NOT have Title property - ignored');
                itemTitle = 'unknown';
              } else {
                itemTitle = response.items[i].title;
              }
              playlistArray.push({ title: itemTitle, uri: playlistUri });
            }
          }
        }
        if (playlistArray.length === 0) {
          throw new Error('n-r-c-s-p: could not find any amazon prime playlist');
        }
        return playlistArray;
      })
      .then((playlistArray) => {
        // find topic in title and return uri
        node.debug('playlist array: ' + JSON.stringify(playlistArray));
        let position = -1;
        for (let i = 0; i < playlistArray.length; i++) {
          if ((playlistArray[i].title).indexOf(msg.topic) > -1) {
            position = i;
            break;
          }
        }
        if (position === -1) {
          throw new Error('n-r-c-s-p: could not find playlist name in playlists');
        } else {
          return playlistArray[position].uri;
        }
      })
      .then((uri) => {
        // create DIDL from uri and queue
        if (!uri.startsWith('x-rincon-cpcontainer:')) {
          throw new Error('n-r-c-s-p: invalid prime playlist');
        }
        const newUri = String(uri).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        const parsed = newUri.match(/^(x-rincon-cpcontainer):(.*)\?(.*)/).splice(1);
        node.debug('new uri ' + JSON.stringify(newUri));
        // TODO Region? Does that work everywhere?
        const region = 51463;
        const title = 'Amazon Prime Playlist';
        const metadata = `
          <DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
          <item id="${parsed[1]}" restricted="true">
          <dc:title>${title}</dc:title>
          <upnp:class>object.container.playlistContainer</upnp:class>
          <desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON${region}_X_#Svc${region}-0-Token</desc>
          </item>
          </DIDL-Lite>`;
        return { uri, metadata };
      })
      .then((obj) => { return sonosPlayer.queue(obj); })
      .then((response) => {
        // response something like {"FirstTrackNumberEnqueued":"54","NumTracksAdded":"52","NewQueueLength":"105"}
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Insert all songs from matching SONOS playlist (first match, topic string) into SONOS queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *        topic: part of the title name; is search string
  *        size: maximum amount of playlists being loaded from SONOS player - optinal, default 100
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg , no modifications!
  */
  function insertSonosPlaylist (node, msg, sonosPlayer) {
    const sonosFunction = 'insert sonos playlist';

    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }

    // validate msg.size and use default if not available
    let listDimension = 100; // default
    if (typeof msg.size === 'undefined' || msg.size === null ||
    (typeof msg.size === 'number' && isNaN(msg.size)) || msg.size === '') {
      node.debug('msg.size undefined - use default size 100');
    } else {
      listDimension = parseInt(msg.size);
      if (Number.isInteger(listDimension)) {
        if (listDimension > 0) {
          node.debug('msg.size will be used: ' + listDimension);
        } else {
          helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: msg.size is not positve: ' + msg.size), sonosFunction);
          return;
        }
      } else {
        helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: msg.size is not an integer: ' + msg.size), sonosFunction);
        return;
      }
    }
    // listDimension is either 100 (default) or a positive integer

    sonosPlayer.getMusicLibrary('sonos_playlists', { start: 0, total: listDimension })
      .then(response => {
        // validate response
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined playlists list received');
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: Could not find any playlists or player not reachable');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined playlists list received');
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list');
        }
        const playlistArray = response.items;
        if (playlistArray.length === 0) {
          throw new Error('n-r-c-s-p: no SONOS playlist available');
        }
        node.debug('length:' + playlistArray.length);
        if (playlistArray.length === listDimension) {
          helper.nrcspWarning(node, sonosFunction, 'There may be more playlists.', 'Please use/modify msg.size');
        }
        return playlistArray;
      })
      .then((playlistArray) => {
        // find topic in title and return uri
        node.debug('playlist array: ' + JSON.stringify(playlistArray));
        let position = -1;
        for (let i = 0; i < playlistArray.length; i++) {
          if ((playlistArray[i].title).indexOf(msg.topic) > -1) {
            position = i;
            break;
          }
        }
        if (position === -1) {
          throw new Error('n-r-c-s-p: could not find playlist name in playlists');
        } else {
          // Should have format file:///jffs/settings/savedqueues ...
          node.debug('founde uri: ' + JSON.stringify(playlistArray[position].uri));
          return playlistArray[position].uri;
        }
      })
      .then((uri) => { return sonosPlayer.queue(uri); })
      .then(() => {
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Insert all songs from matching Music Libary playlist (first match, topic string) into SONOS queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *        topic: part of the title name; is search string
  *        size: maximum amount of playlists being loaded from SONOS player - optional, default is 100
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, no modifications!
  */
  function insertMusicLibraryPlaylist (node, msg, sonosPlayer) {
    const sonosFunction = 'insert music library playlist';

    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }

    // validate msg.size and use default if not available
    let listDimension = 100; // default
    if (typeof msg.size === 'undefined' || msg.size === null ||
    (typeof msg.size === 'number' && isNaN(msg.size)) || msg.size === '') {
      node.debug('msg.size undefined - use default size 100');
    } else {
      listDimension = parseInt(msg.size);
      if (Number.isInteger(listDimension)) {
        if (listDimension > 0) {
          node.debug('msg.size will be used: ' + listDimension);
        } else {
          helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: msg.size is not positve:' + msg.size), sonosFunction);
          return;
        }
      } else {
        helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: msg.size is not an integer: ' + msg.size), sonosFunction);
        return;
      }
    }
    // listDimension is either 100 (default) or a positive integer

    sonosPlayer.getMusicLibrary('playlists', { start: 0, total: listDimension })
      .then(response => {
        // get array of playlists and return
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getMusicLibrary response received');
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: Could not find any playlists or player not reachable');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined playlists list received');
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list');
        }
        const playlistArray = response.items;
        if (playlistArray.length === 0) {
          throw new Error('n-r-c-s-p: no music libary playlist found');
        }
        node.debug('length:' + playlistArray.length);
        if (playlistArray.length === listDimension) {
          helper.nrcspWarning(node, sonosFunction, 'There may be more playlists.', 'Please use/modify msg.size');
        }
        return playlistArray;
      })
      .then((playlistArray) => {
        // find topic in title and return uri
        node.debug('playlist array: ' + JSON.stringify(playlistArray));
        let position = -1;
        for (let i = 0; i < playlistArray.length; i++) {
          if ((playlistArray[i].title).indexOf(msg.topic) > -1) {
            position = i;
            break;
          }
        }
        if (position === -1) {
          throw new Error('n-r-c-s-p: could not find playlist name in playlists');
        } else {
          // Should have format x-file-cifs: ...
          node.debug('founde uri: ' + JSON.stringify(playlistArray[position].uri));
          return playlistArray[position].uri;
        }
      })
      .then((uri) => { return sonosPlayer.queue(uri); })
      .then(() => {
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Activate SONOS queue and start playing first song, optionally set volume
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *               volume is optional
  * @param  {Object} sonosPlayer sonos player Object
  * @output {Object} Success: msg, no modifications!
  */
  function activateQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'activate queue';
    sonosPlayer.getQueue()
      .then(response => {
        // validiate queue ist not empty
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined get queue response received');
        }
        if (response === false) {
          // queue is empty
          throw new Error('n-r-c-s-p: queue is empty');
        }
        // queue not empty
        return true;
      })
      .then(() => { return sonosPlayer.selectQueue(); })
      .then(() => {
        // optionally change volume
        // validate volume: integer, betweent 1 and 99
        if (typeof msg.volume === 'undefined' || msg.volume === null ||
        (typeof msg.volume === 'number' && isNaN(msg.volume)) || msg.volume === '') {
          // do NOT change volume - just return
          return true;
        }
        const newVolume = parseInt(msg.volume);
        if (Number.isInteger(newVolume)) {
          if (newVolume > 0 && newVolume < 100) {
            // change volume
            node.debug('msg.volume is in range 1...99: ' + newVolume);
            return sonosPlayer.setVolume(newVolume);
          } else {
            node.debug('msg.volume is not in range: ' + newVolume);
            throw new Error('n-r-c-s-p: msg.volume is out of range 1...99: ' + newVolume);
          }
        } else {
          node.debug('msg.volume is not number');
          throw new Error('n-r-c-s-p: msg.volume is not a number: ' + JSON.stringify(msg.volume));
        }
      })
      .then(() => { // show success
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Play song with specified index (msg.topic) in SONOS queue. Activates also SONOS Queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message with topic: first, last, <positiv number between 1 and queueSize>
  * @param  {Object} sonosPlayer sonos player object
  * @output {Object} Success: msg, no modifications!
  */
  function playSong (node, msg, sonosPlayer) {
    const sonosFunction = 'play song';

    let validatedPosition;
    sonosPlayer.getQueue()
      .then(response => {
        // get queue size - ensure not empty
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getqueue response received');
        }
        if (response === false) {
          // queue is empty
          throw new Error('n-r-c-s-p: queue is empty');
        }
        if (typeof response.returned === 'undefined' || response.returned === null ||
          (typeof response.returned === 'number' && isNaN(response.returned)) || response.returned === '' || isNaN(response.returned)) {
          throw new Error('n-r-c-s-p: undefined queue size received');
        }
        // queue not empty
        node.debug(`queue contains ${parseInt(response.returned)} songs`);
        return parseInt(response.returned); // Caution: will convert for example 1.3 to 1
      })
      .then((queueSize) => {
        // queueSize is integer!
        // validate message topic. Remark: at this position because we need queue size
        if (typeof msg.topic === 'undefined' || msg.topic === null ||
          (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
          throw new Error('n-r-c-s-p: undefined index (msg.topic)');
        }
        let position = String(msg.topic).trim();
        if (position === 'last') {
          position = queueSize;
        } else if (position === 'first') {
          position = 1;
        } else {
          if (isNaN(position)) {
            throw new Error('n-r-c-s-p: index (msg.topic) is not number');
          }
          position = parseInt(position); // make integer
          node.debug('queue size: ' + queueSize + ' / position: ' + position);
          if (position < 1 || position > queueSize) {
            throw new Error('n-r-c-s-p: index (msg.topic) is out of range: ' + String(position));
          }
        }
        // position is in range 1 ... queueSize
        validatedPosition = position;
        return true;
      })
      .then(() => { return sonosPlayer.selectQueue(); })
      .then(() => { return sonosPlayer.selectTrack(validatedPosition); })
      .then((response) => {
        node.debug('result from select track: ' + JSON.stringify(response));
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Flushes queue - removes all songs from queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message with topic
  * @param  {Object} sonosPlayer sonos player Object
  * @output {Object} Success: msg, no modifications
  */
  function flushQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'flush queue';
    sonosPlayer.flush()
      .then(response => {
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /** Removes song with specified index (msg.topic) from SONOS queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *        topic: index between 1 and length of queue, or first, last
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, no modifications!
  */
  function removeSongFromQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'remove song from queue';

    let validatedPosition;
    sonosPlayer.getQueue()
      .then(response => {
        // get queue size - ensure not empty
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getqueue response received');
        }
        if (response === false) {
          // queue is empty
          throw new Error('n-r-c-s-p: queue is empty!');
        }
        if (typeof response.returned === 'undefined' || response.returned === null ||
          (typeof response.returned === 'number' && isNaN(response.returned)) || response.returned === '' || isNaN(response.returned)) {
          throw new Error('n-r-c-s-p: undefined queue size received');
        }
        // queue not empty
        node.debug(`queue contains ${parseInt(response.returned)} songs`);
        return parseInt(response.returned); // Caution: will convert for example 1.3 to 1
      })
      .then((queueSize) => {
        // queueSize is integer!
        // validate message topic. Remark: at this position because we need queue size
        if (typeof msg.topic === 'undefined' || msg.topic === null ||
          (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
          throw new Error('n-r-c-s-p: undefined topic');
        }
        let position = String(msg.topic).trim();
        if (position === 'last') {
          position = queueSize;
        } else if (position === 'first') {
          position = 1;
        } else {
          if (isNaN(position)) {
            throw new Error('n-r-c-s-p: topic is not number');
          }
          position = parseInt(position); // make integer
          node.debug('queue size: ' + queueSize + ' / position: ' + position);
          if (position < 1 || position > queueSize) {
            throw new Error('n-r-c-s-p: topic is out of range');
          }
        }
        // position is in range 1 ... queueSize
        validatedPosition = position;
        return true;
      })
      .then(() => { return sonosPlayer.removeTracksFromQueue(validatedPosition, 1); })
      .then(response => {
        node.debug('result from remove track: ' + JSON.stringify(response));
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Set queue mode: 'NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'
  * @param  {Object} node current node
  * @param  {Object} msg incoming message, msg.payload and msg.topic are beeing used
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg
  */
  function setQueuemode (node, msg, sonosPlayer) {
    const sonosFunction = 'set queuemode';

    // check topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    const playmodes = ['NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'];
    if (playmodes.indexOf(msg.topic) === -1) {
      helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: this topic is not allowed ' + msg.topic), sonosFunction);
      return;
    }

    sonosPlayer.getQueue()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: could not get queue data from player'); // promise implicitly rejected
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: queue is empty'); // promise implicitly rejected
        }
        // SONOS queue is NOT empty!
        return true; // promise implicitly resolved
      })
      .then(() => { return sonosPlayer.avTransportService().GetMediaInfo(); })
      .then(mediaInfo => {
        if (typeof mediaInfo === 'undefined' || mediaInfo === null ||
          (typeof mediaInfo === 'number' && isNaN(mediaInfo)) || mediaInfo === '') {
          throw new Error('n-r-c-s-p: undefined response from get media info');
        }
        if (typeof mediaInfo.CurrentURI === 'undefined' || mediaInfo.CurrentURI === null ||
          (typeof mediaInfo.CurrentURI === 'number' && isNaN(mediaInfo.CurrentURI)) || mediaInfo.CurrentURI === '') {
          throw new Error('n-r-c-s-p: could not get CurrentURI');
        }
        const uri = mediaInfo.CurrentURI;
        if (!uri.startsWith('x-rincon-queue')) {
          throw new Error('n-r-c-s-p: queue has to be activated');
        } else {
          // SONOS queue is playing
          return true;
        }
      })
      .then(() => { return sonosPlayer.setPlayMode(msg.topic); })
      .then(plresp => {
        if (typeof plresp === 'undefined' || plresp === null ||
          (typeof plresp === 'number' && isNaN(plresp)) || plresp === '') {
          throw new Error('n-r-c-s-p: undefined response from setPlayMode');
        } else {
          return true;
        }
      })
      .then(() => {
        helper.nrcspSuccess(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Get the list of current songs in queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, msg.payload: array of songs
  */
  function getQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'get queue';
    sonosPlayer.getQueue()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getqueue response received');
        }
        let songsArray;
        if (response === false) {
          // queue is empty
          node.debug('response -> ' + JSON.stringify(response));
          songsArray = [];
        } else {
          if (typeof response.returned === 'undefined' || response.returned === null ||
            (typeof response.returned === 'number' && isNaN(response.returned)) || response.returned === '' || isNaN(response.returned)) {
            throw new Error('n-r-c-s-p: undefined queue size received');
          }
          node.debug(JSON.stringify(response));
          songsArray = response.items;
          // message albumArtURL
          songsArray.forEach(function (songsArray) {
            if (typeof songsArray.albumArtURL === 'undefined' || songsArray.albumArtURL === null ||
              (typeof songsArray.albumArtURL === 'number' && isNaN(songsArray.albumArtURL)) || songsArray.albumArtURL === '') {
              // ignore this item
              node.debug('albumArtURL not available' + JSON.stringify(songsArray));
            } else {
              const port = 1400;
              songsArray.albumArtURI = songsArray.albumArtURL;
              songsArray.albumArtURL = 'http://' + sonosPlayer.host + ':' + port + songsArray.albumArtURI;
            }
          });
        }
        msg.payload = songsArray;
        helper.nrcspSuccess(node, msg, sonosFunction);
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Get list of all My Sonos Spotify items and output.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, no modification
  */
  function getMySonosSpotify (node, msg, sonosPlayer) {
    const sonosFunction = 'get spotify playlist';

    sonosPlayer.getFavorites()
      .then(response => {
        // get array of playlists and return
        const SPOTIFY_IDENTIFIER = 'spotify%3a';
        const playlistArray = []; // will hold all playlist items
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getFavorites response received');
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: Could not find any My Sonos items or player not reachable');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined favorite list received');
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list');
        }
        let spotifyPlaylistUri = '';
        let itemTitle;
        for (let i = 0; i < parseInt(response.items.length); i++) {
          if (typeof response.items[i].uri === 'undefined' || response.items[i].uri === null ||
            (typeof response.items[i].uri === 'number' && isNaN(response.items[i].uri)) || response.items[i].uri === '') {
            helper.nrcspWarning(node, sonosFunction, 'item does NOT have uri property', 'item does NOT have uri property - ignored');
          } else {
            spotifyPlaylistUri = response.items[i].uri;
            if (spotifyPlaylistUri.indexOf(SPOTIFY_IDENTIFIER) > 0) {
              // found prime playlist
              spotifyPlaylistUri = response.items[i].uri;
              if (typeof response.items[i].title === 'undefined' || response.items[i].title === null ||
                (typeof response.items[i].title === 'number' && isNaN(response.items[i].title)) || response.items[i].title === '') {
                helper.nrcspWarning(node, sonosFunction, 'item does NOT have Title property', 'item does NOT have Title property - ignored');
                itemTitle = 'unknown';
              } else {
                itemTitle = response.items[i].title;
              }
              playlistArray.push({ title: itemTitle, uri: spotifyPlaylistUri });
            }
          }
        }
        if (playlistArray.length === 0) {
          throw new Error('n-r-c-s-p: could not find any amazon prime playlist');
        }
        return playlistArray;
      })
      .then((response) => {
        // response something like {"FirstTrackNumberEnqueued":"54","NumTracksAdded":"52","NewQueueLength":"105"}
        msg.payload = response;
        helper.nrcspSuccess(node, msg, sonosFunction);
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Get list of My Sonos Amazon Playlist (only standards).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg,  msg.payload to current array of My Sonos Amazon Prime playlist
  */
  function getMySonosAmazonPrimePlaylists (node, msg, sonosPlayer) {
    const sonosFunction = 'get amazon prime playlist';
    sonosPlayer.getFavorites()
      .then(response => {
        // validate response and send output
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getFavorites response received');
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: Could not find any My Sonos items or player not reachable');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined favorite list received');
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list');
        }
        const PRIME_IDENTIFIER = 'prime_playlist';
        const playlistArray = []; // will hold all playlist items
        let primePlaylistUri = '';
        node.debug('favorites:' + JSON.stringify(response.items));
        let itemTitle; // default
        for (let i = 0; i < parseInt(response.items.length); i++) {
          if (typeof response.items[i].uri === 'undefined' || response.items[i].uri === null ||
            (typeof response.items[i].uri === 'number' && isNaN(response.items[i].uri)) || response.items[i].uri === '') {
            helper.nrcspWarning(node, sonosFunction, 'item does NOT have uri property', 'item does NOT have uri property - ignored');
          } else {
            primePlaylistUri = response.items[i].uri;
            if (primePlaylistUri.indexOf(PRIME_IDENTIFIER) > 0) {
              // found prime playlist
              primePlaylistUri = response.items[i].uri;
              if (typeof response.items[i].title === 'undefined' || response.items[i].title === null ||
                (typeof response.items[i].title === 'number' && isNaN(response.items[i].title)) || response.items[i].title === '') {
                helper.nrcspWarning(node, sonosFunction, 'item does NOT have Title property', 'item does NOT have Title property - ignored');
                itemTitle = 'unknown';
              } else {
                itemTitle = response.items[i].title;
              }
              playlistArray.push({ title: itemTitle, uri: primePlaylistUri });
            }
          }
        }
        if (playlistArray.length === 0) {
          throw new Error('n-r-c-s-p: could not find any amazon prime playlist');
        }
        msg.payload = playlistArray;
        helper.nrcspSuccess(node, msg, sonosFunction);
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Get list of SONOS playlists. Dont mix up with My Sonos playlists.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *        size: optional, maximum amount of playlists being loaded from SONOS player
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, msg.payload = list of SONOS playlists
  */
  function getSonosPlaylists (node, msg, sonosPlayer) {
    const sonosFunction = 'get SONOS playlists';

    // validate msg.size and use default if not available
    let listDimension = 100; // default
    if (typeof msg.size === 'undefined' || msg.size === null ||
    (typeof msg.size === 'number' && isNaN(msg.size)) || msg.size === '') {
      node.debug('msg.size undefined - use default size 100');
    } else {
      listDimension = parseInt(msg.size);
      if (Number.isInteger(listDimension)) {
        if (listDimension > 0) {
          node.debug('msg.size will be used: ' + listDimension);
        } else {
          helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: msg.size is not positve: ' + msg.size), sonosFunction);
          return;
        }
      } else {
        helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: msg.size is not an integer: ' + msg.size), sonosFunction);
        return;
      }
    }
    // listDimension is either 100 (default) or a positive integer

    sonosPlayer.getMusicLibrary('sonos_playlists', { start: 0, total: listDimension })
      .then(response => {
        // validate response and change albumArtUri
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getMusicLibrary response received');
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: Could not find any playlists or player not reachable');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined sonos playlist list received');
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list');
        }
        const playlistArray = response.items;
        if (playlistArray.length === 0) {
          throw new Error('n-r-c-s-p: no SONOS playlist available');
        }
        node.debug('length:' + playlistArray.length);
        if (playlistArray.length === listDimension) {
          helper.nrcspWarning(node, sonosFunction, 'There may be more playlists.', 'Please use/modify msg.size');
        }
        playlistArray.forEach(function (songsArray) {
          if (typeof songsArray.albumArtURL === 'undefined' || songsArray.albumArtURL === null ||
            (typeof songsArray.albumArtURL === 'number' && isNaN(songsArray.albumArtURL)) || songsArray.albumArtURL === '') {
            // ignore this item
            node.debug('albumArtURL not available' + JSON.stringify(songsArray));
          } else {
            const port = 1400;
            songsArray.albumArtURI = songsArray.albumArtURL;
            songsArray.albumArtURL = 'http://' + sonosPlayer.host + ':' + port + songsArray.albumArtURI;
          }
        });
        return playlistArray;
      })
      .then((playlistArray) => {
        msg.payload = playlistArray;
        helper.nrcspSuccess(node, msg, sonosFunction);
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  Get list of music library playlists (imported).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *        size: maximum amount of playlists being loaded from SONOS player
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg,  msg.payload to current array of playlists
  * default is 100 entries if not specified msg.size
  */
  function getMusicLibraryPlaylists (node, msg, sonosPlayer) {
    const sonosFunction = 'get music library playlists';

    // validate msg.size and use default if not available
    let listDimension = 100; // default
    if (typeof msg.size === 'undefined' || msg.size === null ||
    (typeof msg.size === 'number' && isNaN(msg.size)) || msg.size === '') {
      node.debug('msg.size undefined - use default size 100');
    } else {
      listDimension = parseInt(msg.size);
      if (Number.isInteger(listDimension)) {
        if (listDimension > 0) {
          node.debug('msg.size will be used: ' + listDimension);
        } else {
          helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: msg.size is not positve: ' + msg.size), sonosFunction);
          return;
        }
      } else {
        helper.nrcspFailure(node, msg, new Error('n-r-c-s-p: msg.size is not an integer: ' + msg.size), sonosFunction);
        return;
      }
    }
    // listDimension is either 100 (default) or a positive integer

    sonosPlayer.getMusicLibrary('playlists', { start: 0, total: listDimension })
      .then(response => {
        // validate response
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined getMusicLibrary response received');
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: Could not find any playlists or player not reachable');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined playlists list received');
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list');
        }
        const playlistArray = response.items;
        if (playlistArray.length === 0) {
          throw new Error('n-r-c-s-p: no music libary playlist found');
        }
        node.debug('length:' + playlistArray.length);
        if (playlistArray.length === listDimension) {
          helper.nrcspWarning(node, sonosFunction, 'There may be more playlists.', 'Please use/modify msg.size');
        }
        return playlistArray;
      })
      .then((playlistArray) => {
        msg.payload = playlistArray;
        helper.nrcspSuccess(node, msg, sonosFunction);
      })
      .catch(error => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  /**  get queue mode: 'NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'
  * @param  {Object} node current node, msg.payload and msg.topic are beeing used
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg
  */
  function getQueuemode (node, msg, sonosPlayer) {
    const sonosFunction = 'get queuemode';
    sonosPlayer.getPlayMode()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: could not get queue mode from player');
        }
        msg.payload = response;
        helper.nrcspSuccess(node, msg, sonosFunction);
      })
      .catch((error) => helper.nrcspFailure(node, msg, error, sonosFunction));
  }

  RED.nodes.registerType('sonos-manage-queue', SonosManageQueueNode);
};
