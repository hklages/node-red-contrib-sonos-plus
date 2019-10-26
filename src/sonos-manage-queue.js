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
    // verify config node. if valid then set status and subscribe to messages
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
          helper.showError(node, msg, new Error('n-r-c-s-p: Please modify config node'), sonosFunction, 'process message - invalid configNode');
        }
      });
    } else {
      // no msg available!
      const msgShort = 'setup subscribe - invalid configNode';
      const errorDetails = 'Please modify config node';
      node.error(`${sonosFunction} - ${msgShort} Details: ` + errorDetails);
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
      helper.showError(node, msg, new Error('n-r-c-s-p: Invalid sonos player. Check configuration'), sonosFunction, 'invalid sonos player.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (typeof msg.payload === 'undefined' || msg.payload === null ||
      (typeof msg.payload === 'number' && isNaN(msg.payload)) || msg.payload === '') {
      helper.showError(node, msg, new Error('n-r-c-s-p: invalid payload ' + JSON.stringify(msg)), sonosFunction, 'invalid payload');
      return;
    }

    let command = String(msg.payload);
    command = command.toLowerCase();

    // dispatch
    if (command === 'insert_uri') {
      // TODO check queue activated
      insertUri(node, msg, sonosPlayer, msg.topic);
    } else if (command === 'insert_sonos_playlist') {
      insertSonosPlaylist(node, msg, sonosPlayer);
    } else if (command === 'insert_prime_playlist') {
      insertPrimePlaylist(node, msg, sonosPlayer);
    } else if (command === 'insert_musiclibrary_playlist') {
      insertMusicLibraryPlaylist(node, msg, sonosPlayer);
    } else if (command === 'activate_queue') {
      activateQueue(node, msg, sonosPlayer);
    } else if (command === 'play_song') {
      // TODO check queue activated
      playSong(node, msg, sonosPlayer, msg.topic);
    } else if (command === 'remove_song') {
      removeSongFromQueue(node, msg, sonosPlayer);
    } else if (command === 'flush_queue') {
      flushQueue(node, msg, sonosPlayer);
    } else if (command === 'get_queue') {
      getQueue(node, msg, sonosPlayer);
    } else if (command === 'get_sonos_playlists') {
      getSonosPlaylists(node, msg, sonosPlayer);
    } else if (command === 'get_prime_playlists') {
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

  // ------------------------------------------------------------------------------------

  /**  Insert defined uri into queue. Can be used for single songs, playlists, ...
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  */
  function insertUri (node, msg, sonosPlayer, uri) {
    const sonosFunction = 'insert uri';
    sonosPlayer.queue(uri)
      .then(response => {
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /** Insert all songs specified playlist (My Sonos Amazon Prime default) matching topic string into queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  */
  function insertPrimePlaylist (node, msg, sonosPlayer) {
    // https://github.com/bencevans/node-sonos/issues/308 ThomasMirlacher
    const sonosFunction = 'insert prime playlist';
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.showError(node, msg, new Error('n-r-c-s-p: invalid topic ' + JSON.stringify(msg)), sonosFunction, 'invalid topic');
      return;
    }

    const uri = msg.topic;
    const newUri = String(uri).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const parsed = newUri.match(/^(x-rincon-cpcontainer):(.*)\?(.*)/).splice(1);
    // TODO Region? Does that work everywhere?
    const region = 51463;
    const title = 'Amazon Prime Playlist from My Sonos';
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
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /** Insert all songs from first playlist (only Sonos playlists) matching topic string into queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * CAUTION limited to 100
  */
  function insertSonosPlaylist (node, msg, sonosPlayer) {
    const sonosFunction = 'insert sonos playlist';

    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.showError(node, msg, new Error('n-r-c-s-p: invalid topic ' + JSON.stringify(msg)), sonosFunction, 'invalid topic');
      return;
    }
    sonosPlayer.getMusicLibrary('sonos_playlists', { start: 0, total: 100 })
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid playlists list received ' + JSON.stringify(response)), sonosFunction, 'invalid playlists list received');
          return;
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid playlists list received ' + JSON.stringify(response)), sonosFunction, 'invalid playlists list received');
          return;
        }
        if (!Array.isArray(response.items)) {
          helper.showError(node, msg, new Error('n-r-c-s-p: did not receive a list' + JSON.stringify(response)), sonosFunction, 'did not receive a list');
          return;
        }
        const mlPlaylist = response.items;
        if (mlPlaylist.length === 0) {
          helper.showError(node, msg, new Error('n-r-c-s-p: no playlist available ' + JSON.stringify(response)), sonosFunction, 'no playlist available');
          return;
        }

        // find topic in title and insert into queue
        let position = -1;
        for (let i = 0; i < mlPlaylist.length; i++) {
          if ((mlPlaylist[i].title).indexOf(msg.topic) > -1) {
            position = i;
            break;
          }
        }
        if (position === -1) {
          helper.showError(node, msg, new Error('n-r-c-s-p: could not find playlist name in playlists ' + JSON.stringify(response.items)), sonosFunction, 'could not find playlist name in playlists');
        } else {
          sonosPlayer.queue(mlPlaylist[position].uri)
            .then(response => {
              helper.showSuccess(node, sonosFunction);
              node.send(msg);
            })
            .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
        }
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /** Insert all songs from first playlist (only Music Library = imported) matching topic string into queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * Maximum number of playlists is 100 entries if not specified msg.size
  */
  function insertMusicLibraryPlaylist (node, msg, sonosPlayer) {
    const sonosFunction = 'insert music library playlist';

    // validate msg.topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.showError(node, msg, new Error('n-r-c-s-p: invalid topic ' + JSON.stringify(msg)), sonosFunction, 'invalid topic');
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
          helper.showError(node, msg, new Error('n-r-c-s-p: msg.size is not positve: ' + msg.size),
            sonosFunction, 'invalid msg.size');
          return;
        }
      } else {
        helper.showError(node, msg, new Error('n-r-c-s-p: msg.size is not an integer: ' + msg.size),
          sonosFunction, 'msg.size is not an integer');
        return;
      }
    }
    // listDimension is either 100 (default) or a positive integer
    sonosPlayer.getMusicLibrary('playlists', { start: 0, total: listDimension })
      .then(response => {
        // validate response
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: invalid getMusicLibrary response received ' + JSON.stringify(response));
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: Could not find any playlists or player not reachable');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: invalid playlists list received ' + JSON.stringify(response));
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list' + JSON.stringify(response));
        }
        const mlPlaylist = response.items;
        if (mlPlaylist.length === 0) {
          throw new Error('n-r-c-s-p: no music libary playlist found ' + JSON.stringify(response));
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
          throw new Error('n-r-c-s-p: could not find playlist name in playlists ' + JSON.stringify(playlistArray));
        } else {
          return playlistArray[position].uri;
        }
      })
      .then((uri) => {
        node.debug('founde uri: ' + JSON.stringify(uri));
        return sonosPlayer.queue(uri);
      })
      .then(() => {
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  function removeSongFromQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'remove song from queue';

    sonosPlayer.getQueue()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid getqueue response received ' + JSON.stringify(response)), sonosFunction, 'invalid getqueue response received');
          return;
        }

        if (response === false) {
          // queue is empty
          helper.showError(node, msg, new Error('n-r-c-s-p: queue is empty!'), sonosFunction, 'queue is empty!');
          return;
        }

        if (typeof response.returned === 'undefined' || response.returned === null ||
          (typeof response.returned === 'number' && isNaN(response.returned)) || response.returned === '' || isNaN(response.returned)) {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid queue size received ' + JSON.stringify(response)), sonosFunction, 'invalid queue size received');
          return;
        }

        const queueSize = parseInt(response.returned);
        node.debug(`queue contains ${queueSize} songs`);

        if (typeof msg.topic === 'undefined' || msg.topic === null ||
          (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid topic ' + JSON.stringify(msg)), sonosFunction, 'invalid topic');
          return;
        }
        let position = String(msg.topic).trim();
        if (position === 'last') {
          position = queueSize;
        } else if (position === 'first') {
          position = 1;
        } else {
          if (isNaN(position)) {
            helper.showError(node, msg, new Error('n-r-c-s-p: topic is not number '), sonosFunction, 'topic is not number');
            return;
          }
          if (position < 1 || position > queueSize) {
            helper.showError(node, msg, new Error('n-r-c-s-p: topic is out of range'), sonosFunction, 'topic is out of range');
            return;
          }
        }
        // position is in range 1 ... queueSize

        sonosPlayer.removeTracksFromQueue(position, 1)
          .then(response => {
            helper.showSuccess(node, sonosFunction);
            node.send(msg);
          })
          .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /**  Activate queue and start playing first song, optionally set volume
  * @param  {Object} node current node
  * @param  {Object} msg incoming message optional with volume
  * @param  {Object} sonosPlayer sonos player Object
  */
  function activateQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'activate queue';
    sonosPlayer.getQueue()
      .then(response => { // validiate queue ist not empty
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: invalid get queue response received ' + JSON.stringify(response));
        }
        if (response === false) {
          // queue is empty
          throw new Error('n-r-c-s-p: queue is empty');
        }
        // queue not empty
        return true;
      })
      .then(() => { return sonosPlayer.selectQueue(); })
      .then(() => { // optionally change volume
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
        return true;
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }
  /**  Play a specific song in queue - only when queue is active.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message with topic
  * @param  {Object} sonosPlayer sonos player object
  */
  function playSong (node, msg, sonosPlayer) {
    const sonosFunction = 'play specific song in queue';
    sonosPlayer.getQueue()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid getqueue response received ' + JSON.stringify(response)), sonosFunction, 'invalid getqueue response received');
          return;
        }
        if (response === false) {
          // queue is empty
          helper.showError(node, msg, new Error('n-r-c-s-p: queue is empty' + JSON.stringify(response)), sonosFunction, 'queue is empty');
          return;
        }
        if (typeof response.returned === 'undefined' || response.returned === null ||
          (typeof response.returned === 'number' && isNaN(response.returned)) || response.returned === '' || isNaN(response.returned)) {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid queue size received ' + JSON.stringify(response)), sonosFunction, 'invalid queue size received');
          return;
        }
        // queue not empty

        const queueSize = parseInt(response.returned);
        node.debug(`queue contains ${queueSize} songs`);

        if (typeof msg.topic === 'undefined' || msg.topic === null ||
          (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid topic ' + JSON.stringify(msg)), sonosFunction, 'invalid topic');
          return;
        }
        let position = String(msg.topic).trim();
        if (position === 'last') {
          position = queueSize;
        } else if (position === 'first') {
          position = 1;
        } else {
          if (isNaN(position)) {
            helper.showError(node, msg, new Error('n-r-c-s-p: topic is not number '), sonosFunction, 'topic is not number');
            return;
          }
          if (position < 1 || position > queueSize) {
            helper.showError(node, msg, new Error('n-r-c-s-p: topic is out of range'), sonosFunction, 'topic is out of range');
            return;
          }
        }
        // position is in range 1 ... queueSize

        sonosPlayer.selectTrack(position)
          .then(response => {
            helper.showSuccess(node, sonosFunction);
            node.send(msg);
          })
          .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /**  Flushes queue - removes all songs from queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message with topic
  * @param  {Object} sonosPlayer sonos player Object
  */
  function flushQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'flush queue';
    sonosPlayer.flush()
      .then(response => {
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /**  Get the list of current songs in queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * msg.payload: array of songs, msg.queue_length: number of songs
  */
  function getQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'get queue';
    sonosPlayer.getQueue()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid getqueue response received ' + JSON.stringify(response)), sonosFunction, 'invalid getqueue response received');
          return;
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
            helper.showError(node, msg, new Error('n-r-c-s-p: invalid queue size received ' + JSON.stringify(response)), sonosFunction, 'invalid queue size received');
            return;
          }
          node.debug(JSON.stringify(response));
          queueSize = parseInt(response.returned);
          songsArray = response.items;
          // message albumArtURL
          songsArray.forEach(function (songsArray) {
            if (songsArray.albumArtURL !== undefined && songsArray.albumArtURL !== null) {
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
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /**  Get all SONOS playlists. Dont mix cup with My Sonos playlists.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * msg.payload = list of SONOS playlists,  msg.available_playlists = amount of playlists
  */
  function getSonosPlaylists (node, msg, sonosPlayer) {
    const sonosFunction = 'get SONOS playlists';
    sonosPlayer.getMusicLibrary('sonos_playlists', { start: 0, total: 100 })
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid getMusicLibrary response received ' + JSON.stringify(response)), sonosFunction, 'invalid getMusicLibrary response received');
          return;
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid sonos playlist list received ' + JSON.stringify(response)), sonosFunction, 'invalid sonoa playlist list received');
          return;
        }

        let playlistArray;
        let numberOfPlaylists;
        if (response === false) {
          // no playlist
          numberOfPlaylists = 0;
          playlistArray = [];
        } else {
          playlistArray = response.items;
          numberOfPlaylists = playlistArray.length;
          // message albumArtURL
          playlistArray.forEach(function (songsArray) {
            if (songsArray.albumArtURL !== undefined && songsArray.albumArtURL !== null) {
              const port = 1400;
              songsArray.albumArtURI = songsArray.albumArtURL;
              songsArray.albumArtURL = 'http://' + sonosPlayer.host + ':' + port + songsArray.albumArtURI;
            }
          });
          helper.showSuccess(node, sonosFunction);
          // send message data
          msg.payload = playlistArray;
          msg.available_playlists = numberOfPlaylists;
          node.send(msg);
        }
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /**  Get list of My Sonos Amazon Playlist (only standards).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * change msg.payload to current array of My Sonos Amazon Prime playlist
  */
  function getMySonosAmazonPrimePlaylists (node, msg, sonosPlayer) {
    // get list of My Sonos items
    const sonosFunction = 'get amazon prime playlist';
    sonosPlayer.getFavorites()
      .then(response => {
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid getFavorites response received ' + JSON.stringify(response)), sonosFunction, 'invalid getqueue response received');
          return;
        }

        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          helper.showError(node, msg, new Error('n-r-c-s-p: invalid favorite list received ' + JSON.stringify(response)), sonosFunction, 'invalid favorite list received');
          return;
        }

        // filter: Amazon Prime Playlists only
        if (!Array.isArray(response.items)) {
          helper.showError(node, msg, new Error('n-r-c-s-p: did not receive a list' + JSON.stringify(response)), sonosFunction, 'did not receive a list');
          return;
        }
        const PRIME_IDENTIFIER = 'prime_playlist';
        const primePlaylistList = []; // will hold all playlist items
        let primePlaylistUri = '';
        for (let i = 0; i < parseInt(response.items.length); i++) {
          primePlaylistUri = response.items[i].uri;
          if (primePlaylistUri.indexOf(PRIME_IDENTIFIER) > 0) {
            // found prime playlist
            primePlaylistUri = response.items[i].uri;
            primePlaylistList.push({ title: response.items[i].title, uri: primePlaylistUri });
          }
        }
        if (primePlaylistList.length === 0) {
          helper.showError(node, msg, new Error('n-r-c-s-p: could not find any amazon prime playlist'), sonosFunction, 'no amazon prime playlist found');
          return;
        }
        helper.showSuccess(node, sonosFunction);
        msg.payload = primePlaylistList;
        node.send(msg);
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /**  Get list of music library playlists (imported)
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * change msg.payload to current array of playlists
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
          helper.showError(node, msg, new Error('n-r-c-s-p: msg.size is not positve: ' + msg.size),
            sonosFunction, 'invalid msg.size');
          return;
        }
      } else {
        helper.showError(node, msg, new Error('n-r-c-s-p: msg.size is not an integer: ' + msg.size),
          sonosFunction, 'msg.size is not an integer');
        return;
      }
    }
    // listDimension is either 100 (default) or a positive integer
    sonosPlayer.getMusicLibrary('playlists', { start: 0, total: listDimension })
      .then(response => {
        // validate response
        if (typeof response === 'undefined' || response === null ||
          (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: invalid getMusicLibrary response received ' + JSON.stringify(response));
        }
        if (response === false) {
          throw new Error('n-r-c-s-p: Could not find any playlists or player not reachable');
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: invalid playlists list received ' + JSON.stringify(response));
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list' + JSON.stringify(response));
        }
        const mlPlaylist = response.items;
        if (mlPlaylist.length === 0) {
          throw new Error('n-r-c-s-p: no music libary playlist found ' + JSON.stringify(response));
        }
        node.debug('length:' + mlPlaylist.length);
        if (mlPlaylist.length === listDimension) {
          helper.showWarning(node, sonosFunction, 'There may be more playlists.', 'Please use/modify msg.size');
        }
        return mlPlaylist;
      })
      .then((playlistArray) => {
        helper.showSuccess(node, sonosFunction);
        msg.payload = playlistArray;
        node.send(msg);
      })
      .catch(error => helper.showError(node, msg, error, sonosFunction, 'error caught from response'));
  }

  /**  Set queue mode: 'NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'
  * @param  {Object} node current node
  * @param  {Object} msg incoming message, msg.payload and msg.topic are beeing used
  * @param  {Object} sonosPlayer Sonos Player
  * msg send in case of success
  */
  function setQueuemode (node, msg, sonosPlayer) {
    const sonosFunction = 'set queuemode';

    // check topic
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      helper.showError(node, msg, new Error('n-r-c-s-p: invalid topic ' + JSON.stringify(msg)), sonosFunction, 'invalid topic');
      return;
    }

    sonosPlayer.getQueue()
      .then(response => {
        if (response === null || response === undefined) {
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
        if (mediaInfo === null || mediaInfo === undefined) {
          throw new Error('n-r-c-s-p: undefined response from get media info'); // promise implicitly rejected
        }
        if (mediaInfo.CurrentURI === null || mediaInfo.CurrentURI === undefined) {
          throw new Error('n-r-c-s-p: could not get CurrentURI'); // promise implicitly rejected
        }
        const uri = mediaInfo.CurrentURI;
        if (!uri.startsWith('x-rincon-queue')) {
          throw new Error('n-r-c-s-p: queue has to be activated'); // promise implicitly rejected
        } else {
          // SONOS queue is playing
          return true; // promise implicitly resolved
        }
      })
      .then(() => { return sonosPlayer.setPlayMode(msg.topic); })
      .then(plresp => {
        if (plresp === null || plresp === undefined) {
          throw new Error('n-r-c-s-p: undefined response from setPlayMode'); // promise implicitly rejected
        } else {
          const resp = JSON.stringify(plresp, Object.getOwnPropertyNames(plresp));
          if (resp.indexOf('Invalid play mode:') > -1) {
            throw new Error(`n-r-c-s-p: wrong topic: ${msg.topic}`); // promise implicitly rejected
          } else {
            return true; // promise implicitly resolved
          }
        }
      })
      .then(() => {
        helper.showSuccess(node, sonosFunction);
        node.send(msg);
        return true; // promise implicitly resolved
      })
      .catch((error) => helper.showError(node, msg, error, sonosFunction, 'error caught from responses and .then'));
  }

  /**  get queue mode: 'NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'
  * @param  {Object} node current node, msg.payload and msg.topic are beeing used
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * msg send in case of succes
  */
  function getQueuemode (node, msg, sonosPlayer) {
    const sonosFunction = 'get queuemode';
    sonosPlayer.getPlayMode()
      .then(response => {
        if (response === null || response === undefined) {
          return Promise.reject(new Error('n-r-c-s-p: could not get queue mode from player'));
        }
        helper.showSuccess(node, sonosFunction);
        msg.payload = response;
        node.send(msg);
      })
      .catch((error) => helper.showError(node, msg, error, sonosFunction, 'error caught from responses'));
  }
  RED.nodes.registerType('sonos-manage-queue', SonosManageQueueNode);
};
