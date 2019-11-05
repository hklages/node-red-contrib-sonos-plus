const SonosHelper = require('./SonosHelper.js');
const helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosManageQueueNode (config) {
    /**  Create Manage Queue Node and subscribe to messages.
    * @param  {Object} config current node configuration data
    */

    RED.nodes.createNode(this, config);
    const sonosFunction = 'create node manage queue';
    // validate config node. if valid then set status and subscribe to messages
    const node = this;
    const configNode = RED.nodes.getNode(config.confignode);
    const isValid = helper.validateConfigNodeV3(configNode);
    if (isValid) {
      // clear node status
      node.status({});
      // subscribe and handle input message
      node.on('input', function (msg) {
        node.debug('node on - msg received');
        // check again configNode - in the meantime it might have changed
        const isStillValid = helper.validateConfigNodeV3(configNode);
        if (isStillValid) {
          helper.identifyPlayerProcessInputMsg(node, configNode, msg, function (ipAddress) {
            if (typeof ipAddress === 'undefined' || ipAddress === null ||
              (typeof ipAddress === 'number' && isNaN(ipAddress)) || ipAddress === '') {
            // error handling node status, node error is done in identifyPlayerProcessInputMsg
            } else {
              node.debug('Found sonos player');
              handleInputMsg(node, msg, ipAddress);
            }
          });
        } else {
          helper.showErrorV2(node, msg, new Error('n-r-c-s-p: invalid config node'), sonosFunction);
        }
      });
    } else {
      // no msg available!
      const msgShort = 'setup subscribe - invalid configNode';
      const errorDetails = 'Please modify config node';
      node.error(`${sonosFunction} - ${msgShort} :: Details: ` + errorDetails);
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
    }
  }

  // -------------------------------------------------------------------------

  /**  Validate sonos player and input message then dispatch further.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function handleInputMsg (node, msg, ipaddress) {
    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    const sonosFunction = 'handle input msg';
    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null ||
      (typeof sonosPlayer === 'number' && isNaN(sonosPlayer)) || sonosPlayer === '') {
      helper.showErrorV2(node, msg, new Error('n-r-c-s-p: undefined sonos player. Check configuration'), sonosFunction);
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (typeof msg.payload === 'undefined' || msg.payload === null ||
      (typeof msg.payload === 'number' && isNaN(msg.payload)) || msg.payload === '') {
      helper.showErrorV2(node, msg, new Error('n-r-c-s-p: undefined payload'), sonosFunction);
      return;
    }

    let command = String(msg.payload);
    command = command.toLowerCase();

    // dispatch
    if (command === 'insert_uri') {
      insertUri(node, msg, sonosPlayer);
    } else if (command === 'insert_sonos_playlist') {
      insertSonosPlaylist(node, msg, sonosPlayer);
    } else if (command === 'insert_prime_playlist') {
      helper.showWarning(node, sonosFunction, 'Command depreciated', 'Please use insert_prime_playlisturi');
    } else if (command === 'insert_prime_playlisturi') {
      insertPrimePlaylistURI(node, msg, sonosPlayer);
    } else if (command === 'insert_amazonprime_playlist') {
      insertMySonosAmazonPrimePlaylist(node, msg, sonosPlayer);
    } else if (command === 'insert_musiclibrary_playlist') {
      insertMusicLibraryPlaylist(node, msg, sonosPlayer);
    } else if (command === 'activate_queue') {
      activateQueue(node, msg, sonosPlayer);
    } else if (command === 'play_song') {
      playSong(node, msg, sonosPlayer, msg.topic);
    } else if (command === 'remove_song') {
      removeSongFromQueue(node, msg, sonosPlayer);
    } else if (command === 'flush_queue') {
      flushQueue(node, msg, sonosPlayer);
    } else if (command === 'get_queue') {
      getQueue(node, msg, sonosPlayer);
    } else if (command === 'get_sonos_playlists') {
      getSonosPlaylists(node, msg, sonosPlayer);
    } else if (command === 'get_amazonprime_playlists') {
      getMySonosAmazonPrimePlaylists(node, msg, sonosPlayer);
    } else if (command === 'get_musiclibrary_playlists') {
      getMusicLibraryPlaylists(node, msg, sonosPlayer);
    } else if (command === 'get_queuemode') {
      getQueuemode(node, msg, sonosPlayer);
    } else if (command === 'set_queuemode') {
      setQueuemode(node, msg, sonosPlayer);
    } else {
      helper.showWarning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(command));
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /**  Insert defined uri at end of SONOS queue. Can be used for single songs, playlists, .... Does NOT activate queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message with msg.topic
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, no modifications!
  */
  function insertUri (node, msg, sonosPlayer) {
    const sonosFunction = 'insert uri';

    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.showErrorV2(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    const uri = msg.topic;

    sonosPlayer.queue(uri)
      .then(response => {
        // will response something like {"FirstTrackNumberEnqueued":"1","NumTracksAdded":"1","NewQueueLength":"1"}
        node.debug('response:' + JSON.stringify(response));
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
  }

  /** Insert all songs of specified Amazon Prime playlist  (URI format) into SONOS queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *           topic uri of playlist (very specific format)
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, no modification
  */
  function insertPrimePlaylistURI (node, msg, sonosPlayer) {
    // https://github.com/bencevans/node-sonos/issues/308 ThomasMirlacher
    const sonosFunction = 'insert prime playlist';

    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.showErrorV2(node, msg, new Error('n-r-c-s-p: undefined prime playlist'), sonosFunction);
      return;
    }
    if (!msg.topic.startsWith('x-rincon-cpcontainer:')) {
      helper.showErrorV2(node, msg, new Error('n-r-c-s-p: invalid prime playlist'), sonosFunction);
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
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
        return true;
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
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
      helper.showErrorV2(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
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
          helper.showErrorV2(node, msg, new Error('n-r-c-s-p: msg.size is not positve: ' + msg.size), sonosFunction);
          return;
        }
      } else {
        helper.showErrorV2(node, msg, new Error('n-r-c-s-p: msg.size is not an integer: ' + msg.size), sonosFunction);
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
        const sonosPlaylists = response.items;
        if (sonosPlaylists.length === 0) {
          throw new Error('n-r-c-s-p: no SONOS playlist available');
        }
        node.debug('length:' + sonosPlaylists.length);
        if (sonosPlaylists.length === listDimension) {
          helper.showWarning(node, sonosFunction, 'There may be more playlists.', 'Please use/modify msg.size');
        }
        return sonosPlaylists;
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
        // insert uri in SONOS queue
        // Should have format file:///jffs/settings/savedqueues ...
        node.debug('founde uri: ' + JSON.stringify(uri));
        return sonosPlayer.queue(uri);
      })
      .then(() => {
        // Should we check response from queue?
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
        return true;
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
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
      helper.showErrorV2(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
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
          helper.showErrorV2(node, msg, new Error('n-r-c-s-p: msg.size is not positve:' + msg.size), sonosFunction);
          return;
        }
      } else {
        helper.showErrorV2(node, msg, new Error('n-r-c-s-p: msg.size is not an integer: ' + msg.size), sonosFunction);
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
        const mlPlaylist = response.items;
        if (mlPlaylist.length === 0) {
          throw new Error('n-r-c-s-p: no music libary playlist found');
        }
        node.debug('length:' + mlPlaylist.length);
        if (mlPlaylist.length === listDimension) {
          helper.showWarning(node, sonosFunction, 'There may be more playlists.', 'Please use/modify msg.size');
        }
        return mlPlaylist;
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
        // Should have format x-file-cifs: ...
        node.debug('founde uri: ' + JSON.stringify(uri));
        return sonosPlayer.queue(uri);
      })
      .then(() => {
        // Should we check response from queue?
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
        return true;
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
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
      helper.showErrorV2(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }

    sonosPlayer.getFavorites()
      .then(response => {
        // get array of playlists and return
        const PRIME_IDENTIFIER = 'prime_playlist';
        const primePlaylistList = []; // will hold all playlist items
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
        let primePlaylistUri = '';
        node.debug('favorites:' + JSON.stringify(response.items));
        let itemTitle;
        for (let i = 0; i < parseInt(response.items.length); i++) {
          if (typeof response.items[i].uri === 'undefined' || response.items[i].uri === null ||
            (typeof response.items[i].uri === 'number' && isNaN(response.items[i].uri)) || response.items[i].uri === '') {
            helper.showWarning(node, sonosFunction, 'item does NOT have uri property', 'item does NOT have uri property - ignored');
          } else {
            primePlaylistUri = response.items[i].uri;
            if (primePlaylistUri.indexOf(PRIME_IDENTIFIER) > 0) {
              // found prime playlist
              primePlaylistUri = response.items[i].uri;
              if (typeof response.items[i].title === 'undefined' || response.items[i].title === null ||
                (typeof response.items[i].title === 'number' && isNaN(response.items[i].title)) || response.items[i].title === '') {
                helper.showWarning(node, sonosFunction, 'item does NOT have Title property', 'item does NOT have Title property - ignored');
                itemTitle = 'unknown';
              } else {
                itemTitle = response.items[i].title;
              }
              primePlaylistList.push({ title: itemTitle, uri: primePlaylistUri });
            }
          }
        }
        if (primePlaylistList.length === 0) {
          throw new Error('n-r-c-s-p: could not find any amazon prime playlist');
        }
        return primePlaylistList;
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
        return sonosPlayer.queue({ uri, metadata });
      })
      .then((response) => {
        // response something like {"FirstTrackNumberEnqueued":"54","NumTracksAdded":"52","NewQueueLength":"105"}
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
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
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
        return true;
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
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
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
        return true;
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
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
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
        return true;
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
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
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
  }

  /**  Get the list of current songs in queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, msg.payload: array of songs, msg.queue_length: number of songs
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
        let queueSize;
        if (response === false) {
          // queue is empty
          queueSize = 0;
          songsArray = [];
        } else {
          if (typeof response.returned === 'undefined' || response.returned === null ||
            (typeof response.returned === 'number' && isNaN(response.returned)) || response.returned === '' || isNaN(response.returned)) {
            throw new Error('n-r-c-s-p: undefined queue size received');
          }
          node.debug(JSON.stringify(response));
          queueSize = parseInt(response.returned);
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
        helper.showSuccess(node, sonosFunction);
        // send message data
        msg.payload = songsArray;
        msg.queue_length = queueSize;
        node.send(msg);
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
  }

  /**  Get list of SONOS playlists. Dont mix up with My Sonos playlists.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  *        size: optional, maximum amount of playlists being loaded from SONOS player
  * @param  {Object} sonosPlayer Sonos Player
  * @output {Object} Success: msg, msg.payload = list of SONOS playlists,  msg.available_playlists = amount of playlists
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
          helper.showErrorV2(node, msg, new Error('n-r-c-s-p: msg.size is not positve: ' + msg.size), sonosFunction);
          return;
        }
      } else {
        helper.showErrorV2(node, msg, new Error('n-r-c-s-p: msg.size is not an integer: ' + msg.size), sonosFunction);
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
        const sonosPlaylists = response.items;
        if (sonosPlaylists.length === 0) {
          throw new Error('n-r-c-s-p: no SONOS playlist available');
        }
        node.debug('length:' + sonosPlaylists.length);
        if (sonosPlaylists.length === listDimension) {
          helper.showWarning(node, sonosFunction, 'There may be more playlists.', 'Please use/modify msg.size');
        }
        sonosPlaylists.forEach(function (songsArray) {
          // TODO has to be validated in more detail
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
        return sonosPlaylists;
      })
      .then((playlistArray) => {
        helper.showSuccess(node, sonosFunction);
        // send message data
        msg.payload = playlistArray;
        msg.available_playlists = playlistArray.length;
        node.send(msg);
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
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
        const primePlaylistList = []; // will hold all playlist items
        let primePlaylistUri = '';
        node.debug('favorites:' + JSON.stringify(response.items));
        let itemTitle; // default
        for (let i = 0; i < parseInt(response.items.length); i++) {
          if (typeof response.items[i].uri === 'undefined' || response.items[i].uri === null ||
            (typeof response.items[i].uri === 'number' && isNaN(response.items[i].uri)) || response.items[i].uri === '') {
            helper.showWarning(node, sonosFunction, 'item does NOT have uri property', 'item does NOT have uri property - ignored');
          } else {
            primePlaylistUri = response.items[i].uri;
            if (primePlaylistUri.indexOf(PRIME_IDENTIFIER) > 0) {
              // found prime playlist
              primePlaylistUri = response.items[i].uri;
              if (typeof response.items[i].title === 'undefined' || response.items[i].title === null ||
                (typeof response.items[i].title === 'number' && isNaN(response.items[i].title)) || response.items[i].title === '') {
                helper.showWarning(node, sonosFunction, 'item does NOT have Title property', 'item does NOT have Title property - ignored');
                itemTitle = 'unknown';
              } else {
                itemTitle = response.items[i].title;
              }
              primePlaylistList.push({ title: itemTitle, uri: primePlaylistUri });
            }
          }
        }
        if (primePlaylistList.length === 0) {
          throw new Error('n-r-c-s-p: could not find any amazon prime playlist');
        }
        helper.showSuccess(node, sonosFunction);
        msg.payload = primePlaylistList;
        node.send(msg);
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
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
          helper.showErrorV2(node, msg, new Error('n-r-c-s-p: msg.size is not positve: ' + msg.size), sonosFunction);
          return;
        }
      } else {
        helper.showErrorV2(node, msg, new Error('n-r-c-s-p: msg.size is not an integer: ' + msg.size), sonosFunction);
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
        const mlPlaylist = response.items;
        if (mlPlaylist.length === 0) {
          throw new Error('n-r-c-s-p: no music libary playlist found');
        }
        node.debug('length:' + mlPlaylist.length);
        if (mlPlaylist.length === listDimension) {
          helper.showWarning(node, sonosFunction, 'There may be more playlists.', 'Please use/modify msg.size');
        }
        return mlPlaylist;
      })
      .then((playlistArray) => {
        helper.showSuccess(node, sonosFunction);
        // send message data
        msg.payload = playlistArray;
        msg.available_playlists = playlistArray.length;
        node.send(msg);
      })
      .catch(error => helper.showErrorV2(node, msg, error, sonosFunction));
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
      helper.showErrorV2(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    const playmodes = ['NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'];
    if (playmodes.indexOf(msg.topic) === -1) {
      helper.showErrorV2(node, msg, new Error('n-r-c-s-p: this topic is not allowed ' + msg.topic), sonosFunction);
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
          throw new Error('n-r-c-s-p: undefined response from setPlayMode'); // promise implicitly rejected
        } else {
          // response should be true
          return true;
        }
      })
      .then(() => {
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
        return true; // promise implicitly resolved
      })
      .catch((error) => helper.showErrorV2(node, msg, error, sonosFunction));
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
        helper.showSuccess(node, sonosFunction);
        msg.payload = response;
        node.send(msg);
      })
      .catch((error) => helper.showErrorV2(node, msg, error, sonosFunction));
  }

  RED.nodes.registerType('sonos-manage-queue', SonosManageQueueNode);
};
