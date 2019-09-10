var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosManageQueueNode (config) {
    /**  Create Manage Queue Node and subscribe to messages
    * @param  {Object} config current node configuration data
    */

    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and subscribe to messages
    var node = this;
    var configNode = RED.nodes.getNode(config.confignode);
    var isValid = helper.validateConfigNodeV3(configNode);
    if (isValid) {
      // clear node status
      node.status({});
      // subscribe and handle input message
      node.on('input', function (msg) {
        node.debug('node on - msg received');
        // check again configNode - in the meantime it might have changed
        var isStillValid = helper.validateConfigNodeV3(configNode);
        if (isStillValid) {
          helper.identifyPlayerProcessInputMsg(node, configNode, msg, function (ipAddress) {
            if (ipAddress === undefined || ipAddress === null) {
            // error handling node status, node error is done in identifyPlayerProcessInputMsg
            } else {
              node.debug('Found sonos player');
              handleInputMsg(node, msg, ipAddress);
            }
          });
        } else {
          node.status({ fill: 'red', shape: 'dot', text: 'error:process message - invalid configNode' });
          node.error('process message - invalid configNode. Please modify!');
        }
      });
    } else {
      node.status({ fill: 'red', shape: 'dot', text: 'error:setup subscribe - invalid configNode' });
      node.error('setup subscribe - invalid configNode. Please modify!');
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
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'error:get sonosplayer - sonos player is null.' });
      node.error('get sonosplayer - sonos player is null. Details: Check configuration.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      node.status({ fill: 'red', shape: 'dot', text: 'error:validate payload - invalid payload.' });
      node.error('validate payload - invalid payload. Details: ' + JSON.stringify(msg.payload));
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
    } else if (command === 'shuffle_queue') {
      // TODO TEST
      shuffleQueue(node, msg, sonosPlayer);
    } else {
      node.status({ fill: 'green', shape: 'dot', text: 'warning:depatching commands - invalid command' });
      node.warn('depatching commands - invalid command. Details: command -> ' + JSON.stringify(command));
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
    let msgShort = '';
    sonosPlayer.queue(uri)
      .then(response => {
        node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
        node.debug(`ok:${sonosFunction}`);
        node.send(msg);
      })
      .catch(err => {
        msgShort = 'error caught from response';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
      });
  }

  /** Insert all songs specified playlist (My Sonos Amazon Prime default) matching topic string into queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  */
  function insertPrimePlaylist (node, msg, sonosPlayer) {
    // https://github.com/bencevans/node-sonos/issues/308 ThomasMirlacher
    const SONOSFUNCTION = 'insert prime playlist';
    let msgShort = '';
    if (!(msg.topic !== null && msg.topic !== undefined && msg.topic)) {
      msgShort = 'invalid topic';
      node.status({ fill: 'red', shape: 'dot', text: `error:${SONOSFUNCTION} - ${msgShort}` });
      node.error(`${SONOSFUNCTION} - ${msgShort}`);
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
    sonosPlayer.queue({ uri, metadata }).then(result => {
      node.status({ fill: 'green', shape: 'dot', text: `ok:${SONOSFUNCTION}` });
      node.debug(`ok:${SONOSFUNCTION}`);
      node.send(msg);
    }).catch(err => {
      msgShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${SONOSFUNCTION} - ${msgShort}` });
      node.error(`${SONOSFUNCTION} - ${msgShort} Details: ` + JSON.stringify(err));
    });
  }

  /** Insert all songs from first playlist (only Sonos playlists) matching topic string into queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * CAUTION limited to 100
  */
  function insertSonosPlaylist (node, msg, sonosPlayer) {
    const sonosFunction = 'insert sonos playlist';
    let msgShort = '';
    if (!(msg.topic !== null && msg.topic !== undefined && msg.topic)) {
      msgShort = 'invalid topic (playlist name)';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
      node.error(`${sonosFunction} - ${msgShort}`);
      return;
    }
    sonosPlayer.getMusicLibrary('sonos_playlists', { start: 0, total: 100 })
      .then(response => {
        if (!(response.total !== null && response.total !== undefined &&
          response.total && parseInt(response.total) > 0)) {
          msgShort = 'invalid or empty response received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: response->` + JSON.stringify(response));
          return;
        }
        const mlPlaylist = response.items;
        if (mlPlaylist.length === 0) {
          msgShort = 'no sonos playlist found';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: reponse->` + JSON.stringify(response.items));
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
          msgShort = 'could not find playlist name in playlists';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: playlist->` + JSON.stringify(response.items));
        } else {
          sonosPlayer.queue(mlPlaylist[position].uri)
            .then(response => {
              node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
              node.debug(`ok:${sonosFunction}`);
              node.send(msg);
            })
            .catch(err => {
              msgShort = 'error caught from response';
              node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
              node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
            });
        }
      })
      .catch(err => {
        msgShort = 'error caught from response';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
      });
  }

  /** Insert all songs from first playlist (only Music Library = imported) matching topic string into queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * CAUTION limited to 100
  */
  function insertMusicLibraryPlaylist (node, msg, sonosPlayer) {
    const sonosFunction = 'insert music library playlist';
    let msgShort = '';
    if (!(msg.topic !== null && msg.topic !== undefined && msg.topic)) {
      msgShort = 'invalid topic (playlist name)';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
      node.error(`${sonosFunction} - ${msgShort}`);
      return;
    }
    sonosPlayer.getMusicLibrary('playlists', { start: 0, total: 100 })
      .then(response => {
        if (!(response.total !== null && response.total !== undefined &&
          response.total && parseInt(response.total) > 0)) {
          msgShort = 'invalid or empty response received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: response->` + JSON.stringify(response));
          return;
        }
        const mlPlaylist = response.items;
        if (mlPlaylist.length === 0) {
          msgShort = 'no music libary playlist found';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: reponse->` + JSON.stringify(response.items));
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
          msgShort = 'could not find playlist name in playlists';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: playlist->` + JSON.stringify(response.items));
        } else {
          sonosPlayer.queue(mlPlaylist[position].uri)
            .then(response => {
              node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
              node.debug(`ok:${sonosFunction}`);
              node.send(msg);
            })
            .catch(err => {
              msgShort = 'error caught from response';
              node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
              node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
            });
        }
      })
      .catch(err => {
        msgShort = 'error caught from response';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
      });
  }

  function removeSongFromQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'remove song from queue';
    let msgShort = '';
    sonosPlayer.getQueue().then(response => {
      if (response === null || response === undefined) {
        msgShort = 'invalid response received';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort}`);
        return;
      }
      let queueSize;
      if (response === false) {
        // queue is empty
        queueSize = 0;
        msgShort = 'queue is empty!';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort}`);
        return;
      }
      queueSize = parseInt(response.returned);
      node.debug(`queue contains ${queueSize} songs`);

      if (msg.topic === null || msg.topic === undefined) {
        msgShort = 'invalid topic';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort}`);
        return;
      }
      let position = String(msg.topic).trim();
      if (position === 'last') {
        position = queueSize;
      } else if (position === 'first') {
        position = 1;
      } else {
        if (isNaN(position)) {
          msgShort = 'topic - invalid number';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort}`);
          return;
        }
        if (position < 1 || position > queueSize) {
          msgShort = 'topic - number out of range';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort}`);
          return;
        }
      }
      // position is in range 1 ... queueSize

      sonosPlayer.removeTracksFromQueue(position, 1).then(response => {
        node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
        node.debug(`ok:${sonosFunction}`);
        node.send(msg);
      }).catch(err => {
        if (err.code === 'ECONNREFUSED') {
          msgShort = 'can not connect to player';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: Verify IP address of player.`);
        } else {
          msgShort = 'error caught from response';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
        }
      });
    }).catch(err => {
      msgShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
      node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
    });
  }

  /**  Activate queue and start playing first song
  * @param  {Object} node current node
  * @param  {Object} msg incoming message with topic
  * @param  {Object} sonosPlayer sonos player Object
  */
  function activateQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'activate queue';
    let msgShort = '';
    sonosPlayer.getQueue().then(response => {
      if (response === null || response === undefined) {
        msgShort = 'invalid response received';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort}`);
        return;
      }
      if (response === false) {
        // queue is empty
        msgShort = 'queue is empty! can not be activated';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort}`);
        return;
      }
      // queue not empty

      sonosPlayer.selectQueue().then(response => {
        node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
        node.debug(`ok:${sonosFunction}`);
        node.send(msg);
      }).catch(err => {
        if (err.code === 'ECONNREFUSED') {
          msgShort = 'can not connect to player';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: Verify IP address of player.`);
        } else {
          msgShort = 'error caught from response';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
        }
      });
    }).catch(err => {
      msgShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
      node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
    });
  }

  /**  Play a specific song in queue - only when queue is active.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message with topic
  * @param  {Object} sonosPlayer sonos player object
  */
  function playSong (node, msg, sonosPlayer) {
    const sonosFunction = 'play specific song in queue';
    let msgShort = '';
    sonosPlayer.getQueue().then(response => {
      if (response === null || response === undefined) {
        msgShort = 'invalid response received';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort}`);
        return;
      }
      let queueSize;
      if (response === false) {
        // queue is empty
        queueSize = 0;
        msgShort = 'queue is empty!';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort}`);
        return;
      }
      queueSize = parseInt(response.returned);
      node.debug(`queue contains ${queueSize} songs`);

      if (msg.topic === null || msg.topic === undefined) {
        msgShort = 'invalid topic - index of song';
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort}`);
        return;
      }
      let position = String(msg.topic).trim();
      if (position === 'last') {
        position = queueSize;
      } else if (position === 'first') {
        position = 1;
      } else {
        if (isNaN(position)) {
          msgShort = 'topic - not a number';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort}`);
          return;
        }
        if (position < 1 || position > queueSize) {
          msgShort = 'topic - number out of range';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort}`);
          return;
        }
      }
      // position is in range 1 ... queueSize

      sonosPlayer.selectTrack(position).then(response => {
        node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
        node.debug(`ok:${sonosFunction}`);
        node.send(msg);
      }).catch(err => {
        if (err.code === 'ECONNREFUSED') {
          msgShort = 'can not connect to player';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: Verify IP address of player.`);
        } else {
          msgShort = 'error caught from response';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
          node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
        }
      });
    }).catch(err => {
      msgShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
      node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
    });
  }

  /**  Flushes queue - removes all songs from queue.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message with topic
  * @param  {Object} sonosPlayer sonos player Object
  */
  function flushQueue (node, msg, sonosPlayer) {
    sonosPlayer.flush()
      .then(result => {
        node.status({ fill: 'green', shape: 'dot', text: 'OK- flush queue' });
        node.debug('OK- flush queue');
        node.send(msg);
      })
      .catch(err => {
        node.status({ fill: 'red', shape: 'dot', text: 'error:flush queue' });
        node.error('flush queue - Could not flush Details: ' + JSON.stringify(err));
      });
  }

  /**  Get the list of current songs in queue
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * msg.payload: array of songs, msg.queue_length: number of songs
  */
  function getQueue (node, msg, sonosPlayer) {
    const sonosFunction = 'get queue';
    let msgShort = 'invalid response received';
    sonosPlayer.getQueue().then(response => {
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort}`);
        return;
      }
      let songsArray;
      let queueSize;
      if (response === false) {
        // queue is empty
        queueSize = 0;
        songsArray = [];
        msgShort = 'queue is empty!';
      } else {
        node.debug(JSON.stringify(response));
        queueSize = parseInt(response.returned);
        songsArray = response.items;
        msgShort = `queue contains ${queueSize} songs`;
        // message albumArtURL
        songsArray.forEach(function (songsArray) {
          if (songsArray.albumArtURL !== undefined && songsArray.albumArtURL !== null) {
            const port = 1400;
            songsArray.albumArtURI = songsArray.albumArtURL;
            songsArray.albumArtURL = 'http://' + sonosPlayer.host + ':' + port + songsArray.albumArtURI;
          }
        });
      }
      node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction} - queue size is ${queueSize}` });
      node.debug(`ok:${sonosFunction} - queue size is ${queueSize}`);
      // send message data
      msg.payload = songsArray;
      msg.queue_length = queueSize;
      node.send(msg);
    }).catch(err => {
      msgShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
      node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
    });
  }

  /**  Get all SONOS playlists. Dont mix cup with My Sonos playlists.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * msg.payload = list of SONOS playlists,  msg.available_playlists = amount of playlists
  */
  function getSonosPlaylists (node, msg, sonosPlayer) {
    const sonosFunction = 'get SONOS playlists';
    let msgShort = '';
    sonosPlayer.getMusicLibrary('sonos_playlists', { start: 0, total: 100 }).then(response => {
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
        node.error(`${sonosFunction} - ${msgShort}`);
        return;
      }
      let playlistArray;
      let numberOfPlaylists;
      if (response === false) {
        // no playlist
        numberOfPlaylists = 0;
        playlistArray = [];
        msgShort = 'No SONOS playlists found!';
      } else {
        numberOfPlaylists = parseInt(response.total);
        playlistArray = response.items;
        msgShort = `found ${numberOfPlaylists} SONOS playlists`;
        // message albumArtURL
        playlistArray.forEach(function (songsArray) {
          if (songsArray.albumArtURL !== undefined && songsArray.albumArtURL !== null) {
            const port = 1400;
            songsArray.albumArtURI = songsArray.albumArtURL;
            songsArray.albumArtURL = 'http://' + sonosPlayer.host + ':' + port + songsArray.albumArtURI;
          }
        });

        node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction} - ${msgShort}` });
        node.debug(`ok:${sonosFunction} - ${msgShort}`);
        // send message data
        msg.payload = playlistArray;
        msg.available_playlists = numberOfPlaylists;
        node.send(msg);
      }
    }).catch(err => {
      msgShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${msgShort}` });
      node.error(`${sonosFunction} - ${msgShort} Details: ` + JSON.stringify(err));
    });
  }

  /**  Get list of My Sonos Amazon Playlist (only standards).
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * change msg.payload to current array of My Sonos Amazon Prime playlist
  */
  function getMySonosAmazonPrimePlaylists (node, msg, sonosPlayer) {
    // get list of My Sonos items
    const SONOSFUNCTION = 'get amazon prime playlist';
    let msgShort = 'invalid or empty My Sonos list received';
    sonosPlayer.getFavorites().then(response => {
      if (!(response.returned !== null && response.returned !== undefined &&
          response.returned && parseInt(response.returned) > 0)) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${SONOSFUNCTION} - ${msgShort}` });
        node.error(`${SONOSFUNCTION} - ${msgShort} Details: response->` + JSON.stringify(response));
        return;
      }
      // filter: Amazon Prime Playlists only
      const PRIME_IDENTIFIER = 'prime_playlist';
      var primePlaylistList = []; // will hold all playlist items
      let primePlaylistUri = '';
      for (let i = 0; i < parseInt(response.returned); i++) {
        primePlaylistUri = response.items[i].uri;
        if (primePlaylistUri.indexOf(PRIME_IDENTIFIER) > 0) {
          // found prime playlist
          primePlaylistUri = response.items[i].uri;
          primePlaylistList.push({ title: response.items[i].title, uri: primePlaylistUri });
        }
      }
      if (primePlaylistList.length === 0) {
        msgShort = 'no amazon prime playlist in my sonos';
        node.status({ fill: 'red', shape: 'dot', text: `error:${SONOSFUNCTION} - ${msgShort}` });
        node.error(`${SONOSFUNCTION} - ${msgShort} Details: mysonos->` + JSON.stringify(response.items));
        return;
      }
      node.status({ fill: 'green', shape: 'dot', text: `ok:${SONOSFUNCTION}` });
      node.debug(`ok:${SONOSFUNCTION}`);
      msg.payload = primePlaylistList;
      node.send(msg);
    }).catch(err => {
      msgShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${SONOSFUNCTION} - ${msgShort}` });
      node.error(`${SONOSFUNCTION} - ${msgShort} Details: ` + JSON.stringify(err));
    });
  }

  /**  Get list of music library playlists.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * change msg.payload to current array of playlists
  * CAUTION limited to 100
  */
  function getMusicLibraryPlaylists (node, msg, sonosPlayer) {
    const SONOSFUNCTION = 'get music library playlists';
    let msgShort;
    sonosPlayer.getMusicLibrary('playlists', { start: 0, total: 100 })
      .then(response => {
        if (!(response.returned !== null && response.returned !== undefined &&
          response.total && parseInt(response.total) > 0)) {
          msgShort = 'invalid or empty response received';
          node.status({ fill: 'red', shape: 'dot', text: `error:${SONOSFUNCTION} - ${msgShort}` });
          node.error(`${SONOSFUNCTION} - ${msgShort} Details: response->` + JSON.stringify(response));
          return;
        }
        const mlPaylist = response.items;
        if (mlPaylist.length === 0) {
          msgShort = 'no music libary playlist found';
          node.status({ fill: 'red', shape: 'dot', text: `error:${SONOSFUNCTION} - ${msgShort}` });
          node.error(`${SONOSFUNCTION} - ${msgShort} Details: mysonos->` + JSON.stringify(response.items));
          return;
        }
        node.status({ fill: 'green', shape: 'dot', text: `ok:${SONOSFUNCTION}` });
        node.debug(`ok:${SONOSFUNCTION}`);
        msg.payload = mlPaylist;
        node.send(msg);
      })
      .catch(err => {
        msgShort = 'error caught from response';
        node.status({ fill: 'red', shape: 'dot', text: `error:${SONOSFUNCTION} - ${msgShort}` });
        node.error(`${SONOSFUNCTION} - ${msgShort} Details: ` + JSON.stringify(err));
      });
  }

  // TODO TEST
  function shuffleQueue (node, msg, sonosPlayer) {
    sonosPlayer.getQueue()
      .then(queue => queue.items.length)
      .then(queueLength => {
      // if (queueLength === 0) {
        return new Error('empty queue');
        // }
      })
      .then(sonosPlayer.setPlayMode('SHUFFLE'))
      .then(() => {
        node.status({ fill: 'green', shape: 'dot', text: 'ok' });
      })
      .catch(err => {
        node.error('error' + JSON.stringify(err));
        node.status({ fill: 'red', shape: 'dot', text: 'error' });
      });
  }

  RED.nodes.registerType('sonos-manage-queue', SonosManageQueueNode);
};
