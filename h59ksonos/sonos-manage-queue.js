var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosManageQueueNode (config) {
    /**  Create Manage Queue Node and subscribe to messages
    * @param  {object} config current node configuration data
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

  function handleInputMsg (node, msg, ipaddress) {
    /**  Validate sonos player and input message then dispatch
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {string} ipaddress IP address of sonos player
    */

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
    var command = msg.payload;
    command = '' + command;// convert to string
    command = command.toLowerCase();

    // dispatch
    if (command === 'activate_queue') {
      activateQueue(node, sonosPlayer);
    } else if (command === 'play_song') {
      // TODO check queue activated
      playTrack(node, sonosPlayer, msg.topic);
    } else if (command === 'flush_queue') {
      sonosPlayer.flush().then(result => {
        node.status({ fill: 'green', shape: 'dot', text: 'OK- flush queue' });
        node.debug('OK- flush queue');
      }).catch(err => {
        node.status({ fill: 'red', shape: 'dot', text: 'error:flush queue' });
        node.error('flush queue - Could not flush Details: ' + JSON.stringify(err));
      });
    } else if (command === 'get_queue') {
      getQueue(node, msg, sonosPlayer);
      // here test test
    } else if (command === 'get_queuesize') {
      getQueueSize(node, msg, sonosPlayer);
    } else if (command === 'get_playlists') {
      getPlaylists(node, msg, sonosPlayer);
    } else if (command === 'get_playlist') {
      getSpecificPlaylist(node, msg, sonosPlayer);
    } else if (command === 'insert_uri') {
      // TODO check queue activated
      insertUri(node, sonosPlayer, msg.topic);
    } else {
      node.status({ fill: 'green', shape: 'dot', text: 'warning:depatching commands - invalid command' });
      node.warn('depatching commands - invalid command. Details: command -> ' + JSON.stringify(command));
    }
  }

  // ------------------------------------------------------------------------------------

  function activateQueue (node, sonosPlayer) {
    // TODO ensure not empty
    var sonosFunction = 'activate queue';
    var errorShort = '';
    sonosPlayer.selectQueue().then(response => {
      node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
      node.debug(`ok:${sonosFunction}`);
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  function playTrack (node, sonosPlayer, topic) {
    // TODO Ensure there is next and queue not empty
    // TODO error handling
    var sonosFunction = 'play track';
    var errorShort = '';
    var i = parseInt(topic);
    sonosPlayer.selectTrack(i).then(response => {
      node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
      node.debug(`ok:${sonosFunction}`);
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  function getQueue (node, msg, sonosPlayer) {
    var sonosFunction = 'get queue';
    var errorShort = 'invalid response received';
    sonosPlayer.getQueue().then(response => {
      if (response === null || response === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
        node.error(`${sonosFunction} - ${errorShort}`);
        return;
      }
      var songsArray;
      var queueSize;
      if (response === false) {
        // queue is empty
        queueSize = 0;
        songsArray = [];
        errorShort = 'queue is empty!';
      } else {
        queueSize = parseInt(response.returned);
        songsArray = response.items;
        errorShort = `queue contains ${queueSize} songs`;
        // message albumArtURL
        songsArray.forEach(function (songsArray) {
          if (songsArray.albumArtURL !== undefined && songsArray.albumArtURL !== null) {
            var port = 1400;
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
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  /// TEST TEST TEST TEST TEST

  // function getQueueSize (node, msg, sonosPlayer) {
  //   /**  payload will be set to number of songs (format number) in queue. 0 means empty queue.
  //   * @param  {Object} node current node
  //   * @param  {Object} msg incoming message
  //   * @param  {Object} sonosPlayer selected sonos player
  //   */
  //
  //   var sonosFunction = 'get queue size';
  //   var errorShort = 'invalid response received';
  //   sonosPlayer.getQueue().then(response => {
  //     console.log('--> %j', response);
  //     if (response === null || response === undefined) {
  //       node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
  //       node.error(`${sonosFunction} - ${errorShort}`);
  //       return;
  //     }
  //     if (response === false) {
  //       // queue is empty
  //       msg.payload = 0;
  //       errorShort = 'queue is empty!';
  //     } else {
  //       msg.payload = parseInt(response.returned);
  //       errorShort = `queue contains ${msg.payload} songs`;
  //     }
  //     node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction} - ${errorShort}` });
  //     node.debug(`ok:${sonosFunction} - ${errorShort}`);
  //     // send message
  //     node.send(msg);
  //   }).catch(err => {
  //     if (err === false) {
  //       node.status({ fill: 'blue', shape: 'dot', text: `ok:${sonosFunction} - queue is empty` });
  //       node.debug(`ok:${sonosFunction} - queue is empty`);
  //       msg.payload = 0;
  //       node.send(msg);
  //     } else {
  //       errorShort = 'error caught from response';
  //       node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
  //       node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
  //     }
  //   });
  // }

  function insertUri (node, sonosPlayer, uri) {
    // TODO STILL IN TEST
    var sonosFunction = 'insert uri';
    var errorShort = '';
    sonosPlayer.queue(uri).then(response => {
      node.status({ fill: 'green', shape: 'dot', text: `ok:${sonosFunction}` });
      node.debug(`ok:${sonosFunction}`);
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  function getPlaylists (node, msg, sonosPlayer) {
    // TODO STILL IN TEST
    var sonosFunction = 'get all SONOS playlists';
    var errorShort = '';
    sonosPlayer.getMusicLibrary('sonos_playlists', { start: 0, total: 25 }).then(response => {
      console.log('xxxx: %j', response);
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }

  function getSpecificPlaylist (node, msg, sonosPlayer) {
    // TODO STILL IN TEST
    var sonosFunction = 'get specific SONOS playlists';
    var errorShort = '';
    sonosPlayer.getPlaylist('4', { start: 0, total: 25 }).then(response => {
      console.log('xxxx: %j', response);
    }).catch(err => {
      errorShort = 'error caught from response';
      node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - ${errorShort}` });
      node.error(`${sonosFunction} - ${errorShort} Details: ` + JSON.stringify(err));
    });
  }
  RED.nodes.registerType('sonos-manage-queue', SonosManageQueueNode);
};
